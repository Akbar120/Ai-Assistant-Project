import { getAgentStore, logAgentAction, updateAgentStatus, saveAgentStore } from './agentManager';
import { ollamaChat } from '@/lib/ollama';
import { runTool } from './tools';
import { readWorkspaceFile, writeWorkspaceFile } from './workspace';
import path from 'path';
import fs from 'fs';

const WORKSPACE_BASE = path.join(process.cwd(), 'workspace', 'agents');

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

// ─── Daily memory log ─────────────────────────────────────────────────────────
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

// ─── Cycle counter ────────────────────────────────────────────────────────────
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

// ─── Extract JSON robustly from LLM output ────────────────────────────────────
function extractJSON(raw: string): any | null {
  try {
    const trimmed = raw.trim();
    // 1. Try code fence
    const fenced = trimmed.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (fenced && fenced[1]) return JSON.parse(fenced[1].trim());

    // 2. Try greedy bracket match (finds first { and last })
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = trimmed.substring(start, end + 1);
      return JSON.parse(candidate);
    }

    // 3. Direct parse
    return JSON.parse(trimmed);
  } catch (e) {
    return null;
  }
}

// ─── Agent Type Classification ────────────────────────────────────────────────
// Reads the agent's md files and determines its behavioral type.
// Returns: 'approval_based' | 'one_shot' | 'recurring'
function classifyAgentFromMdFiles(folder: string, isAutonomous: boolean): 'approval_based' | 'one_shot' | 'recurring' {
  try {
    const agentsFile  = readWorkspaceFile(folder, 'AGENTS.md') || '';
    const skillFile   = readWorkspaceFile(folder, 'SKILL.md')  || '';
    const heartbeat   = readWorkspaceFile(folder, 'HEARTBEAT.md') || '';
    const bootstrap   = readWorkspaceFile(folder, 'BOOTSTRAP.md') || '';

    // Explicit marker takes highest priority
    const combined = agentsFile + skillFile;
    if (/AGENT_TYPE:\s*approval_based/i.test(combined)) return 'approval_based';
    if (/AGENT_TYPE:\s*one_shot/i.test(combined)) return 'one_shot';
    if (/AGENT_TYPE:\s*recurring/i.test(combined)) return 'recurring';

    // Heuristic detection for approval-based
    const approvalKeywords = [
      'wait for', 'notify jenny', 'never send directly', 'approval', 'agent_notify',
      'request approval', 'route through jenny', 'handoff to user',
    ];
    const hasApprovalKeyword = approvalKeywords.some(kw =>
      agentsFile.toLowerCase().includes(kw) || skillFile.toLowerCase().includes(kw)
    );

    if (hasApprovalKeyword) return 'approval_based';

    // Recurring: autonomous + heartbeat
    if (isAutonomous && heartbeat.length > 50) return 'recurring';

    // Default: one-shot worker
    return 'one_shot';
  } catch {
    return isAutonomous ? 'recurring' : 'one_shot';
  }
}

// ─── Extract Required Tools from SKILL.md ────────────────────────────────────
function extractRequiredTools(skillContent: string): string[] {
  if (!skillContent) return [];
  const match = skillContent.match(/Required Tools?:?\s*\n([\s\S]*?)(\n\n|\n##|$)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(line => line.replace(/^[-*\s]+/, '').replace(/`/g, '').trim())
    .filter(t => t.length > 2 && !t.startsWith('#'));
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — BOOTSTRAP  (DETERMINISTIC — NO LLM, just file reading + logging)
// The LLM only runs in Phase 2 (cycle). This way bootstrap NEVER fails.
// ─────────────────────────────────────────────────────────────────────────────
export async function executeBootstrap(id: string, folder: string) {
  const store = getAgentStore();
  const agent = store.agents[id];
  if (!agent) return;

  logAgentAction(id, `Agent initialized`, 'BOOT', 'Bootstrap Started');

  // Read every file and log what was found
  const files: Record<string, string> = {
    'IDENTITY.md':  readWorkspaceFile(folder, 'IDENTITY.md'),
    'SOUL.md':      readWorkspaceFile(folder, 'SOUL.md'),
    'AGENTS.md':    readWorkspaceFile(folder, 'AGENTS.md'),
    'USER.md':      readWorkspaceFile(folder, 'USER.md'),
    'TOOLS.md':     readWorkspaceFile(folder, 'TOOLS.md'),
    'MEMORY.md':    readWorkspaceFile(folder, 'MEMORY.md'),
    'HEARTBEAT.md': readWorkspaceFile(folder, 'HEARTBEAT.md'),
    'SKILL.md':     readWorkspaceFile(folder, 'SKILL.md'),
    'BOOTSTRAP.md': readWorkspaceFile(folder, 'BOOTSTRAP.md'),
  };

  // Also load today's + yesterday's daily log (short-term context)
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const todayKey = `memory/${today.toISOString().split('T')[0]}.md`;
  const yestKey  = `memory/${yesterday.toISOString().split('T')[0]}.md`;
  const todayLog  = readWorkspaceFile(folder, todayKey) || '';
  const yestLog   = readWorkspaceFile(folder, yestKey) || '';

  // Log which files were loaded
  for (const [name, content] of Object.entries(files)) {
    if (content) {
      logAgentAction(id, `Loaded ${name}`, 'BOOT');
    } else {
      logAgentAction(id, `${name} not found — using defaults`, 'BOOT');
    }
  }

  // ── CLASSIFY AGENT TYPE from md files ────────────────────────────────────
  const agentType = classifyAgentFromMdFiles(folder, agent.isAutonomous);
  const currentStore = getAgentStore();
  if (currentStore.agents[id]) {
    (currentStore.agents[id] as any).agentType = agentType;
    saveAgentStore(currentStore);
  }
  logAgentAction(id, `Agent classified as: ${agentType.toUpperCase()}`, 'BOOT', 'Type Classification');

  // Log identity and role from IDENTITY.md
  if (files['IDENTITY.md']) {
    logAgentAction(id, files['IDENTITY.md'].slice(0, 200), 'BOOT', 'Identity Loaded');
  }

  // Log the operational plan from AGENTS.md (SOP)
  if (files['AGENTS.md']) {
    logAgentAction(id, files['AGENTS.md'].slice(0, 300), 'BOOT', 'Operating Manual Loaded');
  }

  // Log skill definition
  if (files['SKILL.md']) {
    logAgentAction(id, files['SKILL.md'].slice(0, 200), 'BOOT', 'Skill Set Loaded');
  }

  // Log heartbeat schedule
  if (files['HEARTBEAT.md']) {
    logAgentAction(id, files['HEARTBEAT.md'].slice(0, 200), 'BOOT', 'Heartbeat Schedule Loaded');
  }

  // Write boot entry to daily log
  appendExecutionMemory(folder, `[BOOT] Agent started. Type: ${agentType}. Loaded ${Object.values(files).filter(Boolean).length}/9 workspace files.`);
  if (todayLog) appendExecutionMemory(folder, `[CONTEXT] Today's prior log loaded (${todayLog.length} chars).`);

  // Confirm heartbeat
  const pollingInterval = agent.pollingInterval || 60000;
  logAgentAction(id, `Heartbeat active. Polling every ${Math.round(pollingInterval / 60000)} min(s).`, 'BOOT', 'Bootstrap Complete');

  appendExecutionMemory(folder, `[BOOT] Complete. Heartbeat: ${Math.round(pollingInterval / 1000)}s`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — CYCLE  (LLM-driven using ALL workspace files as context)
// ─────────────────────────────────────────────────────────────────────────────
export async function startAgentWorker(id: string) {
  const store = getAgentStore();
  const agent = store.agents[id];
  if (!agent) return;

  await executeBootstrap(agent.id, agent.folder);

  while (true) {
    const currentAgent = getAgentStore().agents[id];
    if (!currentAgent) break;

    if (currentAgent.status === 'sleeping' || currentAgent.status === 'error') {
      await sleep(10000);
      continue;
    }

    // ── WAITING APPROVAL: Only resume when directive.json says execute ───────
    if (currentAgent.status === 'paused') {
      const directivePath = path.join(process.cwd(), 'workspace', 'agents', currentAgent.folder, 'directive.json');
      if ((currentAgent as any).waitingApproval && fs.existsSync(directivePath)) {
        try {
          const directive = JSON.parse(fs.readFileSync(directivePath, 'utf-8'));
          if (!directive.processed && directive.operation === 'execute') {
            // Resume — will be handled in runAgentCycle
            const s = getAgentStore();
            if (s.agents[id]) {
              s.agents[id].status = 'running';
              (s.agents[id] as any).waitingApproval = false;
              saveAgentStore(s);
              logAgentAction(id, `▶️ Approval received via agent_command. Resuming execution.`, 'SYSTEM', 'Approval Resume');
            }
            await runAgentCycle(id);
          }
        } catch {}
      }
      await sleep(5000);
      continue;
    }

    if (!currentAgent.isAutonomous) {
      await runAgentCycle(id);
      // One-shot: if no approval pending, mark completed
      const post = getAgentStore().agents[id];
      if (post && !(post as any).waitingApproval) {
        updateAgentStatus(id, 'completed');
      }
      break;
    } else {
      await runAgentCycle(id);
      const postAgent = getAgentStore().agents[id];
      if (!postAgent || postAgent.status !== 'running') break;

      const interval = postAgent.pollingInterval || 60000;
      logAgentAction(id, `Next cycle in ${Math.round(interval / 60000)} min(s)`, 'INFO', 'Wait');
      await sleep(interval);
    }
  }
}

async function runAgentCycle(id: string) {
  const agent = getAgentStore().agents[id];
  if (!agent) return;
  const { folder, goal } = agent;
  const agentType: string = (agent as any).agentType || 'one_shot';

  // ─── CHECK FOR DIRECTIVES (Jenny's Commands) ───────────────────────────
  const directivePath = path.join(process.cwd(), 'workspace', 'agents', folder, 'directive.json');
  let directive: any = null;
  if (fs.existsSync(directivePath)) {
    try {
      directive = JSON.parse(fs.readFileSync(directivePath, 'utf-8'));
      if (!directive.processed) {
        logAgentAction(id, `Directive Received: ${directive.operation}`, 'SYSTEM', 'Incoming Command');
        
        if (directive.operation === 'abandon') {
          logAgentAction(id, "Command received: Abandoning current task iteration. Moving to next cycle.", 'INFO', 'Abandon');
          fs.writeFileSync(directivePath, JSON.stringify({ ...directive, processed: true }, null, 2));
          return; // Move to next cycle immediately
        }
      }
    } catch (e) {
       console.error("Directive parse error:", e);
    }
  }

  const cycleNum = incrementCycle(id);

  // Mark as thinking
  const s = getAgentStore();
  if (s.agents[id]) { s.agents[id].mode = 'thinking'; saveAgentStore(s); }

  // ─── Build full context from workspace files ───────────────────────────────
  const identity    = readWorkspaceFile(folder, 'IDENTITY.md');
  const soul        = readWorkspaceFile(folder, 'SOUL.md');
  const agentsSOP   = readWorkspaceFile(folder, 'AGENTS.md');
  const userPref    = readWorkspaceFile(folder, 'USER.md');
  const toolsDef    = readWorkspaceFile(folder, 'TOOLS.md');
  const memory      = readWorkspaceFile(folder, 'MEMORY.md');
  const trimmedMemory = memory && memory.length > 4000 ? `... (trimmed) ...\n${memory.slice(-4000)}` : memory;

  const skill       = readWorkspaceFile(folder, 'SKILL.md');
  const heartbeat   = readWorkspaceFile(folder, 'HEARTBEAT.md');

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const todayLogContent  = readWorkspaceFile(folder, `memory/${today}.md`) || '';
  const yestLogContent   = readWorkspaceFile(folder, `memory/${yesterday.toISOString().split('T')[0]}.md`) || '';
  const recentLog = (yestLogContent.slice(-500) + '\n' + todayLogContent.slice(-1000)).trim();

  // ─── Extract required tools from SKILL.md ─────────────────────────────────
  const requiredTools = extractRequiredTools(skill || '');

  // Build approval-based agent enforcement addition to prompt
  const approvalEnforcement = agentType === 'approval_based'
    ? `\n⚠️ APPROVAL-BASED AGENT RULES:\n- After generating suggestions or findings, you MUST call agent_notify (type: approval_needed)\n- NEVER call the send/DM tool directly without an execute directive\n- If you have findings ready, your ONLY valid action is agent_notify\n`
    : '';

  const requiredToolsHint = requiredTools.length > 0
    ? `\n⚠️ REQUIRED TOOLS for this cycle: [${requiredTools.join(', ')}]. You MUST call one of these. Plain text output is INVALID.\n`
    : '';

  const systemPrompt = `You are an autonomous AI execution agent.

[IDENTITY]
${identity || `Goal: ${goal}`}

[CHARACTER]
${soul || 'Analytical worker.'}

[OPERATOR]
${userPref || 'None.'}

[SOP]
${agentsSOP || `Goal: ${goal}`}

[SKILLS]
${skill || 'None.'}

[TOOLS]
${toolsDef || agent.tools?.join(', ') || 'None'}

[MEMORY]
${trimmedMemory || 'None'}

[RECENT_LOGS]
${recentLog || 'None'}

[HEARTBEAT]
${heartbeat || `Run every ${Math.round((agent.pollingInterval || 60000) / 60000)}m.`}

${directive && !directive.processed ? `[COMMAND] ${directive.operation}: ${JSON.stringify(directive.payload)}\n` : ''}

[CURRENT TIME]
${new Date().toLocaleString()}
${approvalEnforcement}${requiredToolsHint}
---
CYCLE #${cycleNum}

You MUST act. DO NOT explain. DO NOT narrate. Output ONLY valid JSON.

Rules:
- Follow your AGENTS.md SOP exactly
- Use the skill defined in SKILL.md as your execution method
- Call tools listed in TOOLS.md (use exact names)
- If a goal exists, you MUST call a tool — do NOT sleep

Output this JSON and NOTHING ELSE:
{
  "action": "tool_call",
  "tool": "exact_tool_name_from_TOOLS.md",
  "params": { "param": "value" },
  "reason": "one line referencing AGENTS.md or SKILL.md"
}

If truly nothing to do right now, output:
{ "action": "sleep", "reason": "explanation" }`;

  try {
    const rawResponse = await ollamaChat({
      messages: [
        { role: 'user', content: systemPrompt }
      ],
      temperature: 0.1,
    });

    let decision = extractJSON(rawResponse);

    if (!decision) {
      appendExecutionMemory(folder, `[ERROR #${cycleNum}] Invalid LLM output: ${rawResponse.slice(0, 100)}...`);
      logAgentAction(id, `LLM Parse Error. Captured raw response.`, 'ERROR', `Cycle #${cycleNum}`);
      return;
    }

    // ── THINK log ────────────────────────────────────────────────────────────
    const reason = String(decision.reason || 'No reason given').trim();
    logAgentAction(id, reason, 'THINK', `Cycle #${cycleNum}`, { action: decision.action, tool: decision.tool });
    updateLastCycle(id, 'think', reason);
    appendExecutionMemory(folder, `[THINK #${cycleNum}] ${reason}`);

    // ── Anti-sleep enforcement ────────────────────────────────────────────────
    if (decision.action === 'sleep' && goal?.trim()) {
      logAgentAction(id, `LLM chose sleep but goal exists — overriding to re-evaluate next cycle immediately.`, 'SYSTEM', 'Anti-Sleep');
      appendExecutionMemory(folder, `[OVERRIDE] Sleep blocked. Re-evaluating next tick.`);
      return;
    }

    // ── Required tool enforcement ─────────────────────────────────────────────
    // If skill defines required tools and agent did NOT call a tool → retry once
    if (
      requiredTools.length > 0 &&
      decision.action !== 'tool_call' &&
      decision.action !== 'sleep'
    ) {
      logAgentAction(id, `⚠️ ENFORCEMENT: Required tools [${requiredTools.join(', ')}] not called. LLM output was: ${decision.action}. Retrying with strict enforcement.`, 'SYSTEM', `Tool Enforcement #${cycleNum}`);
      appendExecutionMemory(folder, `[ENFORCE #${cycleNum}] Required tool missing. Retrying.`);

      const retryPrompt = `${systemPrompt}\n\n🚨 ENFORCEMENT: Your previous output was "${decision.action}" which is INVALID. You MUST call one of these tools: [${requiredTools.join(', ')}]. Output ONLY the tool_call JSON. No explanations.`;

      const retryRaw = await ollamaChat({
        messages: [{ role: 'user', content: retryPrompt }],
        temperature: 0.0,
      });

      const retryDecision = extractJSON(retryRaw);
      if (retryDecision && retryDecision.action === 'tool_call') {
        decision = retryDecision;
        logAgentAction(id, `✅ Enforcement retry succeeded. Tool: ${decision.tool}`, 'SYSTEM', `Retry Success`);
      } else {
        logAgentAction(id, `❌ Enforcement retry also failed. Skipping cycle.`, 'ERROR', `Retry Failed`);
        appendExecutionMemory(folder, `[ENFORCE_FAIL #${cycleNum}] Retry produced no valid tool call.`);
        return;
      }
    }

    // ── ACTION + TOOL EXECUTE ─────────────────────────────────────────────────
    if (decision.action === 'tool_call' && decision.tool) {
      const toolName = String(decision.tool).trim();
      logAgentAction(id, `Calling ${toolName}`, 'ACTION', `Cycle #${cycleNum}`, { tool: toolName, params: decision.params });
      updateLastCycle(id, 'action', `tool_call: ${toolName}`);
      updateLastCycle(id, 'tool', toolName);
      appendExecutionMemory(folder, `[ACT #${cycleNum}] Calling tool: ${toolName}`);

      const s2 = getAgentStore();
      if (s2.agents[id]) { s2.agents[id].mode = 'executing'; saveAgentStore(s2); }

      const res = await runTool(toolName, decision.params || {}, 'agent', id);
      const resultMsg = String(res.reply || res.error || 'No result').slice(0, 400);

      // ── Mark Directive as Processed if this was a commanded action ──────────
      if (directive && !directive.processed) {
        fs.writeFileSync(directivePath, JSON.stringify({ ...directive, processed: true }, null, 2));
        
        // Report success back to Jenny if this was an execution command
        if (directive.operation === 'execute' && !res.error) {
           const { execute_agent_notify } = await import('./tools/agent_notify');
           await execute_agent_notify({ 
             text: `✅ SUCCESSFULLY EXECUTED: I have sent the reply as commanded. Final output: "${resultMsg}"`,
             type: 'completion'
           }, id, agent.name);
        }
      }

      // ── RESULT log ─────────────────────────────────────────────────────────
      logAgentAction(id, resultMsg, 'RESULT', `Cycle #${cycleNum}`, { tool: toolName, success: !res.error });

      updateLastCycle(id, 'result', resultMsg);
      appendExecutionMemory(folder, `[RESULT #${cycleNum}] ${toolName}: ${resultMsg}`);

      // ── APPROVAL PAUSE: If approval-based agent just called agent_notify ─────
      if (toolName === 'agent_notify' && agentType === 'approval_based' && res.success) {
        const s3 = getAgentStore();
        if (s3.agents[id]) {
          s3.agents[id].status = 'paused';
          s3.agents[id].mode = 'waiting_confirmation';
          (s3.agents[id] as any).waitingApproval = true;
          saveAgentStore(s3);
        }
        logAgentAction(id, `⏸️ WAITING FOR USER APPROVAL via Jenny. Agent paused until agent_command(execute) is received.`, 'SYSTEM', 'Awaiting Approval');
        appendExecutionMemory(folder, `[PAUSE #${cycleNum}] Approval-based agent paused. Waiting for directive.`);
        return; // EXIT cycle — will not continue until directive resumes it
      }

      // Write result to MEMORY.md if it's meaningful
      if (!res.error || resultMsg.length > 5) {
        const existing = readWorkspaceFile(folder, 'MEMORY.md') || '';
        const dayStamp = new Date().toLocaleDateString();
        const memEntry = `\n\n### [${dayStamp}] Cycle #${cycleNum}\n**Reasoning**: ${reason}\n**Action**: Called ${toolName}\n**Result**: ${resultMsg}`;
        writeWorkspaceFile(folder, 'MEMORY.md', existing + memEntry);
      }
    } else {
      // Log unhandled actions for debugging (e.g., if LLM chose 'conversation' or 'reply')
      if (decision.action !== 'sleep') {
        logAgentAction(id, `Unhandled action: ${decision.action}. Reasoning: ${reason}`, 'SYSTEM', `Cycle #${cycleNum} Diagnostics`);
        appendExecutionMemory(folder, `[DIAGNOSTIC #${cycleNum}] Action: ${decision.action} | Reason: ${reason}`);
      }
    }

  } catch (err: any) {
    logAgentAction(id, `Cycle #${cycleNum} failed: ${err.message}`, 'ERROR', `Cycle #${cycleNum} Error`);
    appendExecutionMemory(folder, `[ERROR #${cycleNum}] ${err.message}`);
  }
}
