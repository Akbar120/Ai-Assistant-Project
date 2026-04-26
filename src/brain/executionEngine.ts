/**
 * EXECUTION ENGINE — Deterministic Tool Dispatcher
 * ─────────────────────────────────────────────────
 * The LLM does NOT control execution.
 * The SYSTEM reads the approved plan, extracts the required tool, and calls it directly.
 *
 * Flow:
 *   1. Parse approved plan text for known tool signals
 *   2. Extract args from conversation history + plan context
 *   3. Call runToolWithoutGuard directly
 *   4. Return structured result
 *
 * If no specific tool can be determined → LLM is called ONCE with a strict JSON-only prompt.
 * That JSON output is validated. If it has no tool_call → error is returned (no fake text).
 */

import { ollamaChat, OllamaMessage, DEFAULT_MODEL } from '@/lib/ollama';
import { runToolWithoutGuard } from './tools';
import { createTask, appendLog, updateTask } from './taskService';
import { isExecutionApproved } from './modeManager';

// ── Known tool signals ────────────────────────────────────────────────────────
// Maps tool name → keywords that indicate this tool should run
const TOOL_SIGNALS: Array<{ tool: string; signals: string[] }> = [
  { tool: 'platform_post',     signals: ['post to instagram', 'post to twitter', 'publish post', 'share post', 'upload image', 'platform_post', 'platform post'] },
  { tool: 'instagram_dm',      signals: ['send dm', 'send message', 'instagram dm', 'dm to', 'message to', 'bhej', 'dm sender', 'instagram_dm'] },
  { tool: 'instagram_fetch',   signals: ['fetch dms', 'read dms', 'check dms', 'instagram fetch', 'instagram_fetch', 'instagram_dm_reader'] },
  { tool: 'search_web',        signals: ['search the web', 'search for', 'google', 'web search', 'search_web', 'look up'] },
  { tool: 'code_executor',     signals: ['create skill', 'write skill', 'create tool', 'write file', 'create file', 'code_executor', 'write code', 'write_file'] },
  { tool: 'manage_agent',      signals: ['create agent', 'spawn agent', 'start agent', 'manage_agent', 'new agent', 'delete skill', 'remove skill', 'delete_skill'] },
  { tool: 'caption_manager',   signals: ['generate caption', 'write caption', 'caption_manager', 'caption for'] },
  { tool: 'get_skills',        signals: ['list skills', 'show skills', 'what skills', 'get_skills'] },
  { tool: 'get_agents',        signals: ['list agents', 'show agents', 'what agents', 'get_agents'] },
  { tool: 'get_tasks',         signals: ['list tasks', 'show tasks', 'what tasks', 'get_tasks'] },
];

// ── Fake-execution text patterns — LLM hallucinating execution ────────────────
const FAKE_EXECUTION_PATTERNS = [
  /let'?s (do|build|create|start|execute|run) this/i,
  /here'?s how (i|we|main)/i,
  /i will (now|start|begin|create|build|execute)/i,
  /ready to (run|execute|start|proceed)/i,
  /main (abhi|ab|kar) (karti|karta|karo|karunga)/i,
  /proceeding (to|with)/i,
  /starting (the|now|execution)/i,
];

export interface ExecutionResult {
  success: boolean;
  reply: string;
  results: Array<{
    tool: string;
    success: boolean;
    reply: string;
    toolResult?: any;
  }>;
  taskId?: string;
  error?: string;
}

interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

// ── Arg extractors ────────────────────────────────────────────────────────────
function extractInstagramDmArgs(plan: string, history: OllamaMessage[]): Record<string, any> {
  const args: Record<string, any> = { platform: 'instagram' };

  // Try to find username in plan or history
  const userMatch = plan.match(/(?:username|user|to)[:\s]+[@]?([a-zA-Z0-9._]+)/i)
    || history.slice().reverse().join(' ').toString().match(/[@]([a-zA-Z0-9._]+)/);
  if (userMatch) args.username = userMatch[1].replace('@', '');

  // Try to find message content
  const msgMatch = plan.match(/(?:message|msg|content|text)[:\s]+"([^"]+)"/i)
    || plan.match(/(?:message|msg|bolo|bhej)[:\s]+(.+?)(?:\n|$)/i);
  if (msgMatch) args.message = msgMatch[1].trim();

  return args;
}

function extractPlatformPostArgs(plan: string, history: OllamaMessage[]): Record<string, any> {
  const args: Record<string, any> = {};

  // Platforms
  const platforms: string[] = [];
  if (/instagram/i.test(plan)) platforms.push('instagram');
  if (/twitter|x\.com/i.test(plan)) platforms.push('twitter');
  if (/discord/i.test(plan)) platforms.push('discord');
  args.platforms = platforms.length ? platforms : ['instagram'];

  // Caption/content
  const captionMatch = plan.match(/(?:caption|content|text|post)[:\s]+"([^"]+)"/i);
  if (captionMatch) args.caption = captionMatch[1].trim();

  return args;
}

function extractCodeExecutorArgs(plan: string): Record<string, any> {
  const isSkill = /skill/i.test(plan);
  const isTool = /tool/i.test(plan);
  const isWriteFile = /write[_ ]file|create[_ ]file/i.test(plan);

  // Try to find file path / name
  const pathMatch = plan.match(/(?:file_path|path|named?|called?|skill name|tool name)[:\s]+["']?([a-zA-Z0-9._\-\/\\ ]+?)["']?(?:\n|,|\.|\))/i);
  const path = pathMatch ? pathMatch[1].trim().replace(/\s+/g, '_') : 'new_item.txt';

  // Try to find operation
  let operation = 'write_file';
  if (isSkill) operation = 'create_skill';
  else if (isTool) operation = 'create_tool';

  // Try to extract content if operation is write_file
  let content = '';
  const contentMatch = plan.match(/(?:content|text)[:\s]+["']([\s\S]+?)["'](?:\n|$|\))/i) 
    || plan.match(/(?:content|text)[:\s]+([\s\S]+?)(?:\n|$|\))/i);
  
  if (contentMatch) {
    content = contentMatch[1].trim();
  }

  const descMatch = plan.match(/(?:description|goal|purpose|it (?:should|will|must))[:\s]+(.+?)(?:\n|$)/i);
  const description = descMatch ? descMatch[1].trim() : plan.slice(0, 200);

  return {
    operation,
    name: path,
    path, // code_executor uses 'name' for skills/tools but often 'path' for files
    content,
    description,
    goal: description,
  };
}

function extractSkillDeletionName(plan: string, history: OllamaMessage[]): string | undefined {
  const context = `${plan}\n${history.slice(-6).map(m => m.content).join('\n')}`;
  const patterns = [
    /skill(?:\s+module)?\s+(?:named|called|name(?:d)?\s+is)?\s*['"`]?([a-zA-Z0-9_-]+)['"`]?/i,
    /(?:delete|remove)\s+(?:the\s+)?skill\s+['"`]?([a-zA-Z0-9_-]+)['"`]?/i,
    /['"`]([a-zA-Z0-9_-]+)['"`]/,
  ];

  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match?.[1] && !/^skill$/i.test(match[1])) {
      return match[1].trim();
    }
  }

  return undefined;
}

function extractManageAgentArgs(plan: string, history: OllamaMessage[]): Record<string, any> {
  if (/\b(delete|remove)\b/i.test(plan) && /\bskill\b/i.test(plan)) {
    return {
      operation: 'delete_skill',
      skill_id: extractSkillDeletionName(plan, history),
    };
  }

  const nameMatch = plan.match(/(?:agent name|named?|called?)[:\s]+["']?([a-zA-Z0-9_\-\s]+?)["']?(?:\n|,|\.)/i);
  const goalMatch = plan.match(/(?:goal|objective|purpose|task)[:\s]+(.+?)(?:\n|$)/i);
  const roleMatch = plan.match(/(?:role|type)[:\s]+(.+?)(?:\n|$)/i);
  const toolsMatch = plan.match(/(?:tools|tools required|assigned tools|agent tools)[:\s]+(.+?)(?:\n\n|permissions required|skills|$)/i);
  const skillsMatch = plan.match(/(?:skills|skills used|assigned skills|agent skills)[:\s]+(.+?)(?:\n\n|tools|permissions required|$)/i);

  const parseList = (value?: string): string[] => {
    if (!value) return [];
    return value
      .split(/[,\n]/)
      .map(item => item.replace(/^[-*\d.\s]+/, '').replace(/`/g, '').trim())
      .map(item => item.split(/\s+(?:->|—|-)\s+/)[0].trim())
      .filter(Boolean);
  };

  const agentName = nameMatch ? nameMatch[1].trim() : 'New Agent';
  const tools = parseList(toolsMatch?.[1]);
  const skills = parseList(skillsMatch?.[1]).map(s => s.replace(/\.md$/, ''));

  return {
    operation: 'create_agent',
    target_agent: agentName,
    agentName,
    goal: goalMatch ? goalMatch[1].trim() : plan.slice(0, 100),
    role: roleMatch ? roleMatch[1].trim() : 'Assistant',
    details: {
      tools,
      skills,
    },
  };
}

// ── Main tool resolver ────────────────────────────────────────────────────────
function resolveToolFromPlan(
  plan: string,
  history: OllamaMessage[],
): ToolCall[] {
  const planLower = plan.toLowerCase();
  const found: ToolCall[] = [];

  for (const { tool, signals } of TOOL_SIGNALS) {
    if (signals.some(sig => planLower.includes(sig))) {
      let args: Record<string, any> = {};

      switch (tool) {
        case 'instagram_dm':     args = extractInstagramDmArgs(plan, history); break;
        case 'platform_post':    args = extractPlatformPostArgs(plan, history); break;
        case 'code_executor':    args = extractCodeExecutorArgs(plan); break;
        case 'manage_agent':     args = extractManageAgentArgs(plan, history); break;
        case 'search_web': {
          const qMatch = plan.match(/(?:search|find|look up)[:\s]+["']?(.+?)["']?(?:\n|$)/i);
          args = { query: qMatch ? qMatch[1].trim() : plan.slice(0, 100) };
          break;
        }
        case 'caption_manager': {
          const capMatch = plan.match(/(?:caption for|image of|about)[:\s]+(.+?)(?:\n|$)/i);
          args = { prompt: capMatch ? capMatch[1].trim() : 'a social media post' };
          break;
        }
        default: args = {};
      }

      console.log(`[ExecutionEngine] Resolved tool="${tool}" from plan keywords`);
      found.push({ tool, args });
    }
  }

  return found;
}

// ── LLM fallback JSON extractor (validation enforced) ────────────────────────
function repairToolCall(call: ToolCall, plan: string, history: OllamaMessage[]): ToolCall {
  if (call.tool !== 'manage_agent') return call;

  const args = call.args && typeof call.args === 'object' ? { ...call.args } : {};
  const isSkillDeletion = /\b(delete|remove)\b/i.test(plan) && /\bskill\b/i.test(plan);

  if (isSkillDeletion && (!args.operation || /^(delete|remove)$/i.test(String(args.operation)))) {
    args.operation = 'delete_skill';
  }

  if (args.operation === 'delete_skill' && !args.skill_id) {
    args.skill_id = extractSkillDeletionName(plan, history);
  }

  return { tool: call.tool, args };
}

async function resolveSequenceViaLLM(
  plan: string,
  history: OllamaMessage[],
  skillCtx?: string
): Promise<ToolCall[]> {
  console.log('[ExecutionEngine] Using LLM to extract execution sequence');

  const historySnippet = history.slice(-5).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n');

  const prompt = `You are a high-level tool execution sequencer. Extract the COMPLETE sequence of tool calls needed to fulfill this APPROVED PLAN.

APPROVED PLAN:
${plan}

RECENT CONTEXT:
${historySnippet}
${skillCtx ? `\nRELEVANT KNOWLEDGE:\n${skillCtx}` : ''}

AVAILABLE TOOLS: platform_post, instagram_dm, instagram_fetch, search_web, code_executor, manage_agent, caption_manager, get_skills, get_agents, get_tasks

RULES:
1. Return a JSON array of tool calls in chronological order.
2. If one step depends on another, include them both.
3. Be precise with arguments.
4. For deleting a skill, use {"tool":"manage_agent","args":{"operation":"delete_skill","skill_id":"exact_skill_id"}}.
5. Never call manage_agent without an operation.

Reply ONLY with this exact JSON format (no text before or after):
[
  {"tool":"tool_name_1", "args":{"key":"value"}},
  {"tool":"tool_name_2", "args":{"key":"value"}}
]

If no tools are needed, reply ONLY with: []`;

  try {
    const raw = await ollamaChat({
      messages: [{ role: 'user', content: prompt }],
      model: DEFAULT_MODEL,
      temperature: 0.1,
      num_predict: 1000,
    });

    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    if (s === -1 || e === -1) return [];

    const parsed = JSON.parse(raw.slice(s, e + 1));
    if (!Array.isArray(parsed)) return [];

    const validTools = TOOL_SIGNALS.map(t => t.tool);
    return parsed
      .filter(call => validTools.includes(call.tool))
      .map(call => repairToolCall({ tool: call.tool, args: call.args || {} }, plan, history));
  } catch (err) {
    console.error('[ExecutionEngine] LLM sequence resolution failed:', err);
    return [];
  }
}

// ── Response validator ────────────────────────────────────────────────────────
export function detectFakeExecution(text: string): boolean {
  return FAKE_EXECUTION_PATTERNS.some(p => p.test(text));
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runExecution(
  approvedPlan: string,
  originalMessage: string,
  history: OllamaMessage[],
  skillCtx?: string
): Promise<ExecutionResult> {
  console.log('[ExecutionEngine] 🚀 Starting iterative step-by-step execution');

  // Create a tracking task
  let taskId: string | undefined;
  try {
    const task = await createTask({
      type: 'execution',
      name: `Execution: ${originalMessage.slice(0, 35)}...`,
      source: 'orchestrator',
      status: 'processing',
    });
    taskId = task.id;
    await appendLog(taskId, '🚀 Iterative Execution engine started', 'info', 'orchestrator', 'execute');
  } catch { /* non-fatal */ }

  // ── Step 1: Resolve the sequence of tools ──────────────────────────────────
  // We prefer the LLM for sequencing to ensure logic flow
  let sequence = await resolveSequenceViaLLM(approvedPlan, history, skillCtx);

  // Fallback to keyword matching if LLM returns empty but plan has keywords
  if (sequence.length === 0) {
    sequence = resolveToolFromPlan(approvedPlan, history);
  }

  sequence = sequence.map(call => repairToolCall(call, approvedPlan, history));

  if (sequence.length === 0) {
    const errMsg = 'Could not determine a valid tool sequence from the approved plan.';
    if (taskId) await appendLog(taskId, '❌ No tools resolved', 'error', 'orchestrator', 'execute').catch(() => {});
    return { success: false, reply: errMsg, results: [], taskId };
  }

  console.log(`[ExecutionEngine] 📋 Plan contains ${sequence.length} steps`);
  if (taskId) await appendLog(taskId, `📋 Resolved ${sequence.length} execution steps`, 'info', 'orchestrator', 'execute');

  const executionResults: ExecutionResult['results'] = [];
  let cumulativeSuccess = true;

  // ── Step 2: Iterate and execute ───────────────────────────────────────────
  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    const stepNum = i + 1;
    
    console.log(`[ExecutionEngine] ⏩ Step ${stepNum}/${sequence.length}: ${step.tool}`);
    if (taskId) {
      await appendLog(taskId, `⏩ Step ${stepNum}/${sequence.length}: Executing ${step.tool}`, 'info', 'orchestrator', 'execute');
      await updateTask(taskId, { progress: Math.floor((i / sequence.length) * 100) });
    }

    try {
      const toolArgs = { ...step.args, task_id: taskId, defer_task_completion: true };
      const result = await runToolWithoutGuard(step.tool, toolArgs, 'orchestrator', 'system_jenny');
      
      executionResults.push({
        tool: step.tool,
        success: result.success !== false,
        reply: result.reply || `✅ Step ${stepNum} (${step.tool}) completed.`,
        toolResult: result
      });

      if (result.success === false) {
        cumulativeSuccess = false;
        if (taskId) await appendLog(taskId, `⚠️ Step ${stepNum} failed: ${result.reply}`, 'warning', 'orchestrator', 'execute');
        break;
      } else {
        if (taskId) await appendLog(taskId, `✅ Step ${stepNum} succeeded`, 'info', 'orchestrator', 'execute');
      }

    } catch (err: any) {
      cumulativeSuccess = false;
      const errMsg = err.message || 'Unknown error';
      executionResults.push({ tool: step.tool, success: false, reply: `❌ Step ${stepNum} failed: ${errMsg}` });
      if (taskId) await appendLog(taskId, `❌ Step ${stepNum} fatal error: ${errMsg}`, 'error', 'orchestrator', 'execute');
      break;
    }
  }

  // ── Step 3: Finalize ──────────────────────────────────────────────────────
  const finalReply = executionResults.map(r => r.reply).join('\n\n');
  if (taskId) {
    await updateTask(taskId, { 
      status: cumulativeSuccess ? 'completed' : 'failed', 
      progress: 100 
    });
    await appendLog(taskId, cumulativeSuccess ? '✅ Full execution sequence completed' : '⚠️ Execution sequence completed with errors', 'info', 'orchestrator', 'execute');
  }

  return {
    success: cumulativeSuccess,
    reply: finalReply,
    results: executionResults,
    taskId
  };
}
