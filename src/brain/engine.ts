import { getAgentStore, logAgentAction, updateAgentStatus, saveAgentStore } from './agentManager';
import { ollamaChat } from '../lib/ollama';
import { runTool } from './tools';
import { readWorkspaceFile, writeWorkspaceFile } from './workspace';
import * as path from 'path';
import * as fs from 'fs';

const WORKSPACE_BASE = path.join(process.cwd(), 'workspace', 'agents');

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function todayLog(folder: string): string {
  return `memory/${new Date().toISOString().split('T')[0]}.md`;
}

function getExecutionMemory(folder: string): string {
  const key = todayLog(folder);
  let content = readWorkspaceFile(folder, key);
  if (!content) {
    const header = `# Execution Log — ${new Date().toISOString().split('T')[0]}\n\n`;
    writeWorkspaceFile(folder, key, header);
    content = header;
  }
  return content;
}

function appendExecutionMemory(folder: string, log: string) {
  const key = todayLog(folder);
  let content = getExecutionMemory(folder);
  content += `\n[${new Date().toLocaleTimeString()}] ${log}`;
  writeWorkspaceFile(folder, key, content);
}

function incrementCycle(id: string): number {
  const store = getAgentStore();
  if (!store.agents[id]) return 0;
  store.agents[id].cycleCount = (store.agents[id].cycleCount || 0) + 1;
  saveAgentStore(store);
  return store.agents[id].cycleCount!;
}

function updateLastCycle(id: string, step: 'think' | 'action' | 'tool' | 'result', value: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  if (!store.agents[id].lastCycle) store.agents[id].lastCycle = {};
  store.agents[id].lastCycle![step] = value;
  saveAgentStore(store);
}

function extractJSON(raw: string): any | null {
  try {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (fenced && fenced[1]) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.substring(start, end + 1));
    }
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function classifyAgentFromMdFiles(folder: string, isAutonomous: boolean): 'approval_based' | 'one_shot' | 'recurring' {
  try {
    const agentsFile  = readWorkspaceFile(folder, 'AGENTS.md') || '';
    const skillFile   = readWorkspaceFile(folder, 'SKILL.md')  || '';
    const heartbeat   = readWorkspaceFile(folder, 'HEARTBEAT.md') || '';
    const combined = agentsFile + skillFile;
    if (/AGENT_TYPE:\s*approval_based/i.test(combined)) return 'approval_based';
    if (/AGENT_TYPE:\s*one_shot/i.test(combined)) return 'one_shot';
    if (/AGENT_TYPE:\s*recurring/i.test(combined)) return 'recurring';
    const approvalKeywords = ['wait for', 'notify jenny', 'never send directly', 'approval', 'agent_notify'];
    if (approvalKeywords.some(kw => combined.toLowerCase().includes(kw))) return 'approval_based';
    return isAutonomous && heartbeat.length > 50 ? 'recurring' : 'one_shot';
  } catch {
    return isAutonomous ? 'recurring' : 'one_shot';
  }
}

function extractRequiredTools(skillContent: string): string[] {
  if (!skillContent) return [];
  const match = skillContent.match(/Required Tools?:?\s*\n([\s\S]*?)(\n\n|\n##|$)/i);
  if (!match) return [];
  return match[1].split('\n').map(line => line.replace(/^[-*\s]+/, '').replace(/`/g, '').trim()).filter(t => t.length > 2);
}

function readDmQueue(folder: string): { queue: any[]; savedAt?: string } {
  const queuePath = path.join(WORKSPACE_BASE, folder, 'dm_queue.json');
  try { if (fs.existsSync(queuePath)) return JSON.parse(fs.readFileSync(queuePath, 'utf-8')); } catch {}
  return { queue: [] };
}

function writeDmQueue(folder: string, data: any) {
  const queuePath = path.join(WORKSPACE_BASE, folder, 'dm_queue.json');
  try { fs.writeFileSync(queuePath, JSON.stringify(data, null, 2)); } catch {}
}

function extractPastReplies(memory: string): string {
  const match = memory.match(/## Reply History([\s\S]*?)(?=\n##|$)/);
  if (!match) return '';
  return match[1].trim().split('\n').slice(-8).join('\n');
}

export async function executeBootstrap(id: string, folder: string) {
  const store = getAgentStore();
  const agent = store.agents[id];
  if (!agent) return;
  const agentType = classifyAgentFromMdFiles(folder, agent.isAutonomous);
  const currentStore = getAgentStore();
  if (currentStore.agents[id]) {
    (currentStore.agents[id] as any).agentType = agentType;
    saveAgentStore(currentStore);
  }
  logAgentAction(id, `Agent classified as: ${agentType.toUpperCase()}`, 'BOOT');
}

const activeWorkers = new Set<string>();

// ─── Worker Lifecycle Management ──────────────────────────────────────────────
// This prevents multiple duplicate workers from running after a hot-reload.
const generationId = Date.now();
(global as any).__ENGINE_GENERATION_ID = generationId;
console.log(`[Engine] New generation starting: ${generationId}`);

export async function startAgentWorker(id: string) {
  if (activeWorkers.has(id)) {
    console.log(`[Engine] Worker for agent ${id} is already running.`);
    return;
  }
  activeWorkers.add(id);
  try {
    const store = getAgentStore();
    const agent = store.agents[id];
    if (!agent) return;
    await executeBootstrap(agent.id, agent.folder);
    const myGeneration = (global as any).__ENGINE_GENERATION_ID;
    while (true) {
      // Check if this worker instance is still the active generation
      if ((global as any).__ENGINE_GENERATION_ID !== myGeneration) {
        console.log(`[Engine] Worker ${id} (Gen ${myGeneration}) stopping: New generation detected.`);
        break;
      }
      const currentAgent = getAgentStore().agents[id];
      if (!currentAgent) break;
      if (currentAgent.status === 'sleeping' || currentAgent.status === 'error') {
        if (currentAgent.status === 'error') {
          console.error(`[Engine] Agent ${id} is in error state. Waiting for manual fix or restart.`);
        }
        await sleep(10000);
        continue;
      }
      if (currentAgent.status === 'paused') {
        const directivePath = path.join(process.cwd(), 'workspace', 'agents', currentAgent.folder, 'directive.json');
        if ((currentAgent as any).waitingApproval && fs.existsSync(directivePath)) {
          try {
            const directive = JSON.parse(fs.readFileSync(directivePath, 'utf-8'));
            if (!directive.processed && (directive.operation === 'execute' || directive.operation === 'abandon')) {
              const s = getAgentStore();
              if (s.agents[id]) {
                s.agents[id].status = 'running';
                (s.agents[id] as any).waitingApproval = false;
                saveAgentStore(s);
              }
              await runAgentCycle(id);
            }
          } catch {}
        }
        await sleep(5000);
        continue;
      }
      const lastAction = await runAgentCycle(id);
      
      const postAgent = getAgentStore().agents[id];
      if (!postAgent) break;

      // Handle terminal states
      if (postAgent.status === 'error' || postAgent.status === 'sleeping') continue;
      if (postAgent.status === 'paused') {
         await sleep(5000);
         continue;
      }

      if (lastAction === 'tool_call' || lastAction === 'overridden') {
        await sleep(1000);
        continue;
      }
      await sleep(postAgent.pollingInterval || 60000);
    }
  } finally {
    activeWorkers.delete(id);
  }
}

async function runAgentCycle(id: string): Promise<'tool_call' | 'sleep' | 'error' | 'paused' | 'overridden'> {
  const agent = getAgentStore().agents[id];
  if (!agent) return 'error';
  const { folder, goal } = agent;
  const agentType: string = (agent as any).agentType || 'one_shot';
  const directivePath = path.join(process.cwd(), 'workspace', 'agents', folder, 'directive.json');
  if (fs.existsSync(directivePath)) {
    try {
      const directive = JSON.parse(fs.readFileSync(directivePath, 'utf-8'));
      if (!directive.processed) {
        if (directive.operation === 'abandon') {
          fs.writeFileSync(directivePath, JSON.stringify({ ...directive, processed: true }, null, 2));
          const qData = readDmQueue(folder);
          const notifyingUser = qData.queue?.find((u: any) => u.status === 'notifying');
          if (notifyingUser) {
            notifyingUser.status = 'abandoned';
            writeDmQueue(folder, qData);
          }
          return 'tool_call';
        }
        if (directive.operation === 'execute') {
          fs.writeFileSync(directivePath, JSON.stringify({ ...directive, processed: true }, null, 2));
          const qData = readDmQueue(folder);
          const notifyingUser = qData.queue?.find((u: any) => u.status === 'notifying');
          if (!notifyingUser) return 'paused';
          const replyText = directive.payload?.text || directive.payload?.selectedOption || '';
          if (!replyText) return 'paused';
          const s2 = getAgentStore();
          if (s2.agents[id]) { s2.agents[id].mode = 'executing'; saveAgentStore(s2); }
          const res = await runTool('instagram_dm_sender', {
            username: notifyingUser.username,
            threadUrl: notifyingUser.threadUrl,
            message: replyText,
            platform: 'instagram',
          }, 'agent', id);
          const s3 = getAgentStore();
          if (s3.agents[id]) { s3.agents[id].mode = 'thinking'; saveAgentStore(s3); }
          notifyingUser.status = !res.error ? 'handled' : 'failed';
          writeDmQueue(folder, qData);
          return qData.queue?.some((u: any) => u.status === 'pending') ? 'tool_call' : 'paused';
        }
      }
    } catch {}
  }

  const cycleNum = incrementCycle(id);
  const s = getAgentStore();
  if (s.agents[id]) { 
    s.agents[id].mode = 'thinking'; 
    saveAgentStore(s); 
  }

  // Enrich prompt with workspace files
  const identity = readWorkspaceFile(folder, 'IDENTITY.md') || '';
  const soul = readWorkspaceFile(folder, 'SOUL.md') || '';
  const skill = readWorkspaceFile(folder, 'SKILL.md') || '';
  const toolsMd = readWorkspaceFile(folder, 'TOOLS.md') || '';
  const heartbeat = readWorkspaceFile(folder, 'HEARTBEAT.md') || '';
  
  const today = new Date().toISOString().split('T')[0];
  
  const qData = readDmQueue(folder);
  const pendingUser = qData.queue?.find((u: any) => u.status === 'pending');
  const needsForcedNotify = agentType === 'approval_based' && !!pendingUser;

  if (needsForcedNotify && pendingUser) {
      updateLastCycle(id, 'think', `Forcing notification for @${pendingUser.username} due to pending queue item.`);
      pendingUser.status = 'notifying';
      writeDmQueue(folder, qData);
      const suggestions = { a: 'Sounds good!', b: 'Got it, thanks!', c: "Let's talk soon!" };
      const notifyText = `👤 From: @${pendingUser.username}\n\n💬 Messages:\n${(pendingUser.messages || []).map((m:any)=>`  "${m}"`).join('\n')}\n\n💡 Suggested Replies:\n  A) ${suggestions.a}\n  B) ${suggestions.b}\n  C) ${suggestions.c}`;
      try {
        const { execute_agent_notify } = await import('./tools/agent_notify');
        await execute_agent_notify({ text: notifyText, type: 'approval_needed', metadata: { username: pendingUser.username, suggestions } }, id, agent.name);
        
        appendExecutionMemory(folder, `[NOTIFY_SENT] Notified for @${pendingUser.username}`);
        logAgentAction(id, `Sent approval notification for @${pendingUser.username}`, 'ACTION', 'Notify Sent');
        updateLastCycle(id, 'result', `Notification sent for @${pendingUser.username}. Waiting for approval.`);

        const s3 = getAgentStore();
        if (s3.agents[id]) {
          s3.agents[id].status = 'paused';
          (s3.agents[id] as any).waitingApproval = true;
          saveAgentStore(s3);
        }
        return 'paused';
      } catch (err: any) {
        logAgentAction(id, `Failed to send notification: ${err.message}`, 'ERROR');
        pendingUser.status = 'pending';
        writeDmQueue(folder, qData);
        return 'error';
      }
    }

  const systemPrompt = `
You are an autonomous AI agent operating within the OpenClaw OS.
  
[IDENTITY]
${identity}

[SOUL / PERSONALITY]
${soul}

[GOAL]
${goal}

[CAPABILITIES / SKILLS]
${skill}

[AVAILABLE TOOLS]
${toolsMd}

[HEARTBEAT / ROUTINE]
${heartbeat}

[SESSION MEMORY]
${agent.sessionMemory?.join('\n') || 'No recent memory.'}

[TASK]
Decide on your next action based on your identity and goal. 
If it's time for a routine check (HEARTBEAT), execute it.
If you find something to report, use 'agent_notify'.

[OUTPUT FORMAT]
You MUST respond with a JSON object ONLY:
{
  "think": "Your reasoning here",
  "action": "tool_call",
  "tool": "tool_name",
  "args": { "arg1": "val1" }
}
OR if no action is needed:
{
  "think": "Your reasoning here",
  "action": "sleep"
}
`;

  try {
    updateLastCycle(id, 'think', 'Analyzing state and deciding next action...');
    let rawResponse = await ollamaChat({ messages: [{ role: 'user', content: systemPrompt }], temperature: 0.1 });
    let decision = extractJSON(rawResponse);
    
    if (!decision) {
       logAgentAction(id, "LLM returned invalid JSON. Sleeping.", 'ERROR');
       updateLastCycle(id, 'result', 'Error: Invalid LLM response format.');
       return 'sleep';
    }

    if (decision.think) updateLastCycle(id, 'think', decision.think);

    // ── Execution Enforcement Layer (Background Agent) ────────────────────────
    const isFakeCompletion = decision.action !== 'tool_call' && /done|created|submitted|completed|successful|i have|added|updated/i.test(decision.think || '');
    
    if (isFakeCompletion) {
      logAgentAction(id, "Fake completion detected. Forcing retry...", 'WARNING');
      const retryMessages: any[] = [
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: rawResponse },
        { role: 'system', content: '[SYSTEM ERROR] Execution required. You MUST use a tool_call. Do NOT simulate completion.' }
      ];
      
      try {
        rawResponse = await ollamaChat({ messages: retryMessages, temperature: 0.1 });
        decision = extractJSON(rawResponse) || decision;
        if (decision.think) updateLastCycle(id, 'think', decision.think + ' (Retried)');
      } catch (err) {
        // Fallback to original decision on retry error
      }
    }

    if (decision.action !== 'tool_call') {
      updateLastCycle(id, 'result', 'No action needed. Sleeping.');
      return 'sleep';
    }

    const toolName = decision.tool;
    const toolArgs = decision.args || decision.params || {};

    // Set mode to executing before tool call
    const s2 = getAgentStore();
    if (s2.agents[id]) { s2.agents[id].mode = 'executing'; saveAgentStore(s2); }
    
    updateLastCycle(id, 'tool', toolName);
    logAgentAction(id, `Executing tool: ${toolName}`, 'TOOL', toolName, { args: toolArgs });

    const res = await runTool(toolName, toolArgs, 'agent', id);
    
    // Set mode back to thinking
    const s3 = getAgentStore();
    if (s3.agents[id]) { s3.agents[id].mode = 'thinking'; saveAgentStore(s3); }

    const resultSummary = res.success ? (res.reply || 'Success') : (res.error || res.reply || 'Failed');
    updateLastCycle(id, 'result', resultSummary);
    logAgentAction(id, `Tool result: ${resultSummary}`, 'RESULT', toolName, { success: res.success });

    if (toolName === 'instagram_dm_reader' && agentType === 'approval_based' && !res.error) {
      const unreadData = res.data?.unread || res.data?.contacts;
      if (unreadData && Array.isArray(unreadData) && unreadData.length > 0) {
        const queueUsers = unreadData.map((c: any) => ({
          username: c.username || 'unknown',
          threadUrl: c.threadUrl || '',
          messages: Array.isArray(c.messages) ? c.messages : [c.lastMessage],
          status: 'pending',
        }));
        writeDmQueue(folder, { queue: queueUsers, savedAt: new Date().toISOString() });
        return 'tool_call';
      } else {
        const existing = readDmQueue(folder);
        if (!existing.queue?.some((u:any) => u.status === 'notifying')) {
          writeDmQueue(folder, { queue: [], savedAt: new Date().toISOString() });
        }
        return 'sleep';
      }
    }
    return 'tool_call';
  } catch (err: any) {
    logAgentAction(id, `Critical cycle error: ${err.message}`, 'ERROR');
    updateLastCycle(id, 'result', `Error: ${err.message}`);
    return 'error';
  }
}

// Heartbeat re-parse trigger 2
