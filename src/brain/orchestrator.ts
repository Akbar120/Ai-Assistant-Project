/**
 * ORCHESTRATOR — System-Controlled 5-Mode Engine (v4)
 * ─────────────────────────────────────────────────────
 *
 * ARCHITECTURE:
 *   LLM is used ONLY for reasoning (analyze, planning, confirmation text).
 *   LLM NEVER controls execution.
 *   SYSTEM controls all mode transitions and tool dispatch.
 *
 * FLOW:
 *   user message
 *     → SYSTEM checks approval (pure regex, no LLM)
 *     → SYSTEM classifies intent (LLM assist, then guarded)
 *     → SYSTEM enforces transition (hard state machine)
 *     → mode-specific LLM prompt (reasoning only)
 *     → SYSTEM validates response
 *     → if execution: system calls tools directly via executionEngine
 *     → result returned
 *
 * FORBIDDEN:
 *   ❌ LLM deciding what tool to call
 *   ❌ LLM text returned as "execution"
 *   ❌ Skipping confirmation
 *   ❌ Planning → Execution directly
 */

import { ollamaChat, ollamaChatWithSentenceCallback, OllamaMessage, DEFAULT_MODEL } from '@/lib/ollama';
import type { EnrichedInput } from '@/services/inputEnrichment';
import { getAgentStore } from './agentManager';
import { matchSkills, buildSkillContext, loadAllSkills } from './skillsEngine';
import { runExecution, detectFakeExecution } from './executionEngine';
import { ALL_TOOL_IDS, TOOL_MAP } from './toolRegistry';
import { getRecommendedToolsForUseCase } from './skills/skillManagement';
import {
  JennyMode,
  getCurrentMode,
  transition,
  forceTransition,
  unlockMode,
  storePendingAnalysis,
  storePendingPlan,
  getPendingPlan,
  getApprovedPlan,
  getPendingAnalysis,
  approvePlan,
  resetAfterExecution,
  classifyIntent,
  resolveNextMode,
  getPlanningStage,
  setPlanningStage,
} from './modeManager';

// ── STRICT EXECUTION TOOLS WHITELIST ──────────────────────────────────────────
const EXECUTABLE_TOOLS = [
  'instagram_dm_sender', 'platform_post', 'caption_manager', 'code_executor', 
  'exec', 'write', 'edit', 'apply_patch', 'write_file', 'define_tool', 
  'image_generate', 'music_generate', 'video_generate', 'tts', 'cron', 
  'gateway', 'browser', 'canvas', 'manage_agent', 'agent_command', 
  'install_skill', 'update_plan'
];

// Tools that ALWAYS require explicit user permission before execution (from refinedPermissionGuard.ts)
const TOOLS_REQUIRING_APPROVAL = [
  'instagram_dm_sender', 'platform_post', 'caption_manager', 'code_executor', 
  'exec', 'write', 'edit', 'apply_patch', 'write_file', 'define_tool', 
  'image_generate', 'music_generate', 'video_generate', 'tts', 'cron', 
  'gateway', 'browser', 'canvas', 'manage_agent', 'agent_command', 
  'install_skill', 'update_plan'
];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AgentContext extends EnrichedInput {
  workspacePrompt?: string;
  sessionContext?: string;
}

export type OrchestratorAction =
  | 'conversation'
  | 'tool_call'
  | 'create_agent'
  | 'confirm_agent'
  | 'edit_agent'
  | 'restart_agent'
  | 'learn_knowledge';

export interface OrchestratorResult {
  action: OrchestratorAction;
  data: Record<string, unknown>;
  reply: string;
  taskId?: string;
  mode: JennyMode;
}

// ── APPROVAL DETECTION — pure deterministic, no LLM ──────────────────────────
const APPROVAL_WORDS = [
  'yes', 'proceed', 'go ahead', 'theek hai', 'haan', 'approved',
  'kar do', 'chalo', 'bilkul', 'confirm', 'let\'s go',
  'okay', 'ok', 'sure', 'absolutely', 'correct', 'sahi hai', 'done',
  'execute it', 'do it', 'run it'
];

function isApprovalMessage(msg: string): boolean {
  const clean = msg.toLowerCase().trim();
  // Short message (< 100 chars) containing an approval word
  if (clean.length > 100) return false;
  
  // If it asks a question or asks to explain, it's not an approval
  if (clean.includes('?') || /\b(kya|kaise|kyun|how|why|what|explain|tell|batao)\b/i.test(clean)) {
    return false;
  }

  // Common simple approvals
  if (/^(yes|haan|ok|okay|yep|sure|y|go|chalo|done|kar do|sahi hai|perfect)$/i.test(clean)) return true;

  return APPROVAL_WORDS.some(w => {
    const re = new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|[!?.,])`, 'i');
    return re.test(clean) || clean === w;
  });
}

const REJECTION_WORDS = ['no', 'nahi', 'nahi chahiye', 'cancel', 'abort', 'stop', 'rehne do', 'ruk', 'wait', 'change'];
function isRejectionMessage(msg: string): boolean {
  const clean = msg.toLowerCase().trim();
  if (clean.length > 60) return false;
  return REJECTION_WORDS.some(w => clean.includes(w));
}

/**
 * isFinalAgreement — checks if user has AGREED to finalize the plan.
 * Reads FULL SENTENCE INTENT, never isolated words.
 * Used only inside Planning Mode (Interactive Stage).
 */
function isFinalAgreement(msg: string): boolean {
  const clean = msg.toLowerCase().trim();

  // Long messages are discussion/refinement — not agreements
  if (clean.split(/\s+/).length > 24) return false;

  // Questions are never agreements
  if (clean.includes('?') || /\b(kya|kaise|kyun|how|why|what|explain|batao)\b/i.test(clean)) return false;

  // Correction/negative intent
  if (/\b(nahi|nhi|mat|na|no|sahi karo|change|isko|isse|thoda|modify|update|aur|alag|warna|galat|wrong|fix|badle)\b/i.test(clean)) return false;

  // Must match a clear agreement PHRASE
  const AGREEMENT_PHRASES = [
    'yes this works', 'yeah this works', 'this works', 'this is good', "let's do this", 'lets do this',
    'perfect', 'go ahead', 'proceed', 'we can do this', 'we can build this', 'build this',
    'theek hai yeh', 'haan yeh sahi hai', 'bilkul', 'haan proceed',
    'looks good', 'sounds good', 'finalize', 'finalize it', 'finalize this',
    'haan theek hai', 'kar lo', 'yes proceed', 'yes go ahead',
    'i approve', 'approve this', 'approve', 'yes sure', 'haan bilkul',
    'karo proceed', 'start execution', 'theek hai karo', 'carry on',
    'go for it', 'kar de', 'kardo', 'theek hai kardo', 'lets proceed', "let's proceed",
    'continue with this', 'move forward', 'this plan is fine'
  ];

  if (AGREEMENT_PHRASES.some(phrase => clean.includes(phrase))) return true;
  
  // Simple "yes" or "haan" or "ok" also counts if it's short
  if (/^(yes|haan|ok|okay|yep|sure|y)$/i.test(clean)) return true;

  return false;
}

function buildToolCatalog(toolIds: string[]): string {
  if (!toolIds.length) return 'None';
  return toolIds
    .map(id => {
      const tool = TOOL_MAP[id];
      return tool ? `- ${tool.id}: ${tool.description}` : `- ${id}: registered tool`;
    })
    .join('\n');
}

function buildCapabilityContext(userMessage: string, assignedTools: string[], unassignedTools: string[], assignedSkills: string[]): string {
  const recs = getRecommendedToolsForUseCase(userMessage);
  const recommended = [...new Set([...recs.safeTools, ...recs.majorTools])];
  const assignedRecommended = recommended.filter(t => assignedTools.includes(t));
  const missingRecommended = recommended.filter(t => !assignedTools.includes(t) && ALL_TOOL_IDS.includes(t));
  const availableSkillFiles = loadAllSkills().map(s => `${s.file.replace(/\.md$/, '')}: ${s.name}`).join('\n') || 'None';

  return `CAPABILITY MAP
Skills are knowledge/instructions. Tools are executable actions.
Jenny may use only ASSIGNED tools during execution. If an unassigned tool is necessary, she must request it in the plan instead of pretending it is available.

ASSIGNED TOOL CATALOG:
${buildToolCatalog(assignedTools)}

UNASSIGNED TOOL CATALOG:
${buildToolCatalog(unassignedTools)}

RECOMMENDED TOOLS FOR THIS REQUEST:
- Assigned now: ${assignedRecommended.join(', ') || 'None'}
- Should request if needed: ${missingRecommended.join(', ') || 'None'}

ASSIGNED SKILLS:
${assignedSkills.length ? assignedSkills.map(s => `- ${s}`).join('\n') : 'None'}

INSTALLED SKILL FILES:
${availableSkillFiles}`;
}

/** Checks if user wants to abort planning entirely */
function isPlanningAbort(msg: string): boolean {
  const clean = msg.toLowerCase().trim();
  // STRICT CHECK: Only trigger on exact standalone commands, not natural sentences
  return clean === 'abort' || clean === 'abort karo';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function getSkillsSummary(): string {
  try {
    const all = loadAllSkills();
    return all.length ? all.map(s => `• ${s.name} (${s.file})`).join('\n') : 'None';
  } catch { return 'Unknown'; }
}

async function runPreflight(message: string): Promise<string> {
  try {
    const matched = await matchSkills(message);
    return matched.length ? buildSkillContext(matched.slice(0, 2)) : '';
  } catch { return ''; }
}

// ── Mode system prompts (LLM reasoning only) ──────────────────────────────────
function promptConversation(enriched: AgentContext): string {
  return `You are Jenny AI — warm, intelligent, Hinglish assistant.
MODE: CONVERSATION — respond naturally, NO JSON, NO tools, NO execution.
${enriched.workspacePrompt ? `\nContext: ${enriched.workspacePrompt}` : ''}`;
}

function promptAnalyze(message: string, skillCtx: string, assignedTools: string[], unassignedTools: string[], assignedSkills: string[]): string {
  const store = getAgentStore();
  const agents = Object.values(store.agents).slice(0, 4).map(a => `• ${a.name}: ${a.goal}`).join('\n') || 'None';
  
  const permissionReq = assignedTools.filter(t => TOOLS_REQUIRING_APPROVAL.includes(t));
  const capabilityContext = buildCapabilityContext(message, assignedTools, unassignedTools, assignedSkills);

  return `You are Jenny AI in ANALYZE MODE — DECISIVE TOOL SELECTOR.
DO NOT EXECUTE. DO NOT OUTPUT JSON.

Your job is to determine WHICH tool to use. No explanations, no skill references.

═══════════════════════════════════════════════════════════════════════════════════
🚨 CONCEPTUAL CORE
═══════════════════════════════════════════════════════════════════════════════════
🛠️ TOOLS (Actions): ${assignedTools.join(', ') || 'None'}
📚 SKILLS (Knowledge): ${assignedSkills.join(', ') || 'None'}
RULE: Skills guide HOW you use Tools. You EXECUTE tools, you APPLY skills.
${capabilityContext}

═══════════════════════════════════════════════════════════════════════════════════
🚨 STRICT RULES
═══════════════════════════════════════════════════════════════════════════════════
❌ NEVER output "Explanation:"
❌ NEVER explain which skill you're using
❌ NEVER act as a chatbot
❌ NEVER ask unnecessary questions

✅ ALWAYS:
- Map to a concrete TOOL from the ASSIGNED list below
- Skills are internal knowledge only
- Be decisive

═══════════════════════════════════════════════════════════════════════════════════
USER REQUEST: "${message}"

✅ ASSIGNED TOOLS (Available Now):
${assignedTools.length > 0 ? assignedTools.map(t => `- ${t}`).join('\n') : 'None'}

🚨 CRITICAL: Check the ASSIGNED list above before proposing ANY action. 
If a tool for the task ALREADY EXISTS (e.g., memory_search for searching, write_file for creating files), use it. 
DO NOT propose "defining" a new tool if an existing tool can do the job.

⚠️ UNASSIGNED TOOLS (Disabled in UI):
${unassignedTools.length > 0 ? unassignedTools.map(t => `- ${t}`).join('\n') : 'None'}

📝 PERMISSION RULES:
The following assigned tools REQUIRE user approval: ${permissionReq.join(', ') || 'None'}.

✅ ASSIGNED SKILLS (Your internal knowledge):
${assignedSkills.length > 0 ? assignedSkills.map(s => `- ${s}`).join('\n') : 'None'}

SKILLS ARE KNOWLEDGE BASE - NOT EXECUTABLE.
If you need to CREATE/MODIFY → use code_executor (if assigned).
If you need to RECALL info → use memory_search (if assigned).

═══════════════════════════════════════════════════════════════════════════════════
End with EXACTLY ONE:
→ "Ready to confirm: [tool name + brief inputs]" — ONLY if you have a concrete tool.
→ "Ready to plan: [topic]" — USE THIS if the user is asking for advice or a strategy.
→ "Need more info: [critical missing info]" — ONLY if execution breaks without it.
→ "Cannot execute: [reason]" — ONLY if impossible.`;
}

function promptInteractivePlanning(userMessage: string, skillCtx: string, conversationSummary: string, assignedTools: string[], unassignedTools: string[], assignedSkills: string[]): string {
  const permissionReq = assignedTools.filter(t => TOOLS_REQUIRING_APPROVAL.includes(t));
  const capabilityContext = buildCapabilityContext(userMessage, assignedTools, unassignedTools, assignedSkills);
  
  return `You are Jenny AI in PLANNING MODE — COLLABORATIVE THINKING PARTNER.
DO NOT produce a rigid structured plan yet. DO NOT output JSON.

Your role right now is to THINK WITH THE USER — explore ideas, ask smart questions, suggest improvements.

═══════════════════════════════════════════════════════════════════════════
🚨 CONCEPTUAL CORE
═══════════════════════════════════════════════════════════════════════════
🛠️ TOOLS: ${assignedTools.join(', ') || 'None'}
📚 SKILLS: ${assignedSkills.join(', ') || 'None'}
You can propose using ANY tool from your ASSIGNED list below.
${capabilityContext}

═══════════════════════════════════════════════════════════════════════════
🧠 STAGE 1 — INTERACTIVE PLANNING
═══════════════════════════════════════════════════════════════════════════
✔ Discuss ideas with the user
✔ Suggest improvements and alternatives
✔ CHECK EXISTING TOOLS: Before suggesting a new tool, see if one of your ASSIGNED tools (like memory_search or code_executor) can already do the job.
✔ Ask ONE smart, specific question if needed
✔ Make intelligent assumptions where safe
✔ Guide and refine the thinking

❌ DO NOT execute tools in this stage. Only discuss their use.
❌ DO NOT output "🔧 PLAN:" headers
❌ DO NOT ask "Do you want me to proceed with execution?"
❌ STRICT: DO NOT output any roleplay actions. Output ONLY spoken conversational text.

═══════════════════════════════════════════════════════════════════════════
💡 TONE: Conversational, warm, idea-driven.
═══════════════════════════════════════════════════════════════════════════
USER REQUEST: "${userMessage}"
${conversationSummary ? `CONTEXT SO FAR:\n${conversationSummary}\n` : ''}

✅ ASSIGNED TOOLS: ${assignedTools.join(', ')}
(Use memory_search/memory_get for conversation recall tasks)

⚠️ UNASSIGNED: ${unassignedTools.join(', ')}
✅ ASSIGNED SKILLS: ${assignedSkills.join(', ')}

📝 PERMISSION NOTICE:
You will need to ask for permission in your final plan if you use: ${permissionReq.join(', ') || 'None'}.

${skillCtx ? `RELEVANT SKILL KNOWLEDGE (Apply silently):\n${skillCtx}\n` : ''}

Respond conversationally. Help them think through this.`;
}

function promptPlanning(pendingAnalysis: string, skillCtx: string, assignedTools: string[], assignedSkills: string[], userMessage = ''): string {
  const permissionReq = assignedTools.filter(t => TOOLS_REQUIRING_APPROVAL.includes(t));
  const unassignedTools = ALL_TOOL_IDS.filter(t => !assignedTools.includes(t));
  const capabilityContext = buildCapabilityContext(`${pendingAnalysis}\n${userMessage}`, assignedTools, unassignedTools, assignedSkills);

  return `You are Jenny AI in PLANNING MODE — STRUCTURED SYSTEM PLANNER.
DO NOT EXECUTE. DO NOT OUTPUT JSON.

Your job is to produce EXECUTION-READY PLANS. The plan must be a precise numbered process the execution engine can follow.

═══════════════════════════════════════════════════════════════════════════
🎯 OUTPUT FORMAT (STRICT)
═══════════════════════════════════════════════════════════════════════════

🔧 PLAN: <Clear Task Name>

Goal:
- <one precise outcome>

Step-by-step Process:
1. <first concrete step>
2. <second concrete step>
3. <continue until creation/setup/validation is complete>

⚙️ EXECUTION APPROACH:

Skills Used:
- <Skill name ONLY if relevant - NO explanation>

Tools Required:
- <tool_name> → <what it does>

Tool Assignment Notes:
- Assigned tools to use now: <real assigned tool ids only>
- Tools to request before execution: <real unassigned tool ids needed, or none>

Agent/Skill Setup Notes:
- If creating a skill: name the .md file, include Tool Access, and define execution steps.
- If creating an agent: list exact skills and exact tools the agent should receive.

Permissions Required:
- YES: <list tools from required list below> / NO (if using only safe tools)

═══════════════════════════════════════════════════════════════════════════
FINAL LINE (REQUIRED):
"Do you want me to proceed with execution?"

═══════════════════════════════════════════════════════════════════════════
✅ ASSIGNED TOOLS:
${assignedTools.join(', ')}

✅ ASSIGNED SKILLS:
${assignedSkills.join(', ')}

${capabilityContext}

📝 PERMISSION REQUIREMENTS:
The following assigned tools REQUIRE explicit permission: ${permissionReq.join(', ') || 'None'}.
If your plan uses these, set 'Permissions Required: YES' and list them.

${skillCtx ? `RELEVANT SKILL KNOWLEDGE:\n${skillCtx}\n` : ''}
NOTE: Skills are used SILENTLY as knowledge. Do not explain them.

If you have an executable plan, end with:
"Ready to confirm: [primary tool and inputs]"
Otherwise, use the structured format above.`;
}

function promptConfirmation(plan: string, skillCtx: string): string {
  return `You are Jenny AI in CONFIRMATION MODE — STRONG, CONFIDENT EXECUTION PLAN.
DO NOT EXECUTE. DO NOT OUTPUT JSON.

Your ONLY job is to present the COMPLETE final plan to the user for explicit approval.

═══════════════════════════════════════════════════════════════════════════
🚨 CONFIRMATION GUIDELINES
═══════════════════════════════════════════════════════════════════════════
1. Be CRYSTAL CLEAR about which High-Risk tools (code_executor, platform_post, etc.) will be used.
2. Ensure the user knows what they are saying YES to.
3. Use a confident, professional tone.

PLAN TO CONFIRM:
${plan}

${skillCtx ? `\nTOOLS/SKILLS CONTEXT:\n${skillCtx}` : ''}

═══════════════════════════════════════════════════════════════════════════════════
✅ REQUIRED CONFIRMATION STRUCTURE
═══════════════════════════════════════════════════════════════════════════
1. **WHAT WILL BE BUILT/CREATED**
2. **TOOLS TO BE USED** (Highlight those needing permission)
3. **EXPECTED OUTCOME**
4. **EXECUTION STEPS**

End EXACTLY with: "Say YES to execute ✅"`;
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────
export async function orchestrate(
  message: string,
  history: OllamaMessage[],
  enriched: AgentContext,
  images?: string[],
  onSentence?: (sentence: string) => void,
  onMode?: (mode: JennyMode) => void,
  forceNextMode?: JennyMode
): Promise<OrchestratorResult> {

  const mode         = getCurrentMode();
  const pendingPlan  = getPendingPlan();
  const approvedPlan = getApprovedPlan();
  const pendingAnal  = getPendingAnalysis();

  const hasPendingPlan     = pendingPlan.trim().length > 0;
  const hasPendingApproval = approvedPlan.trim().length > 0;
  const hasPendingAnalysis = pendingAnal.trim().length > 0;
  const hasSomethingPending = hasPendingPlan || hasPendingApproval || hasPendingAnalysis;

  // ── GATHER LIVE CAPABILITIES ───────────────────────────────────────────
  const store = getAgentStore();
  const jenny = store.agents['system_jenny'];
  const assignedTools = jenny?.allowedTools || [];
  
  const unassignedTools = ALL_TOOL_IDS.filter(t => !assignedTools.includes(t));

  console.log(`[Orchestrator] mode=${mode} hasPlan=${hasPendingPlan} hasAnalysis=${hasPendingAnalysis} hasApproval=${hasPendingApproval}`);

  // ── PREFLIGHT — Gather skills/context early so it's available for ALL paths (including execution)
  const skillCtx = await runPreflight(message);

  // ════════════════════════════════════════════════════════════════════════════════════
  // STEP 1 — DETERMINISTIC APPROVAL CHECK
  // ════════════════════════════════════════════════════════════════════════════
  if (isApprovalMessage(message) && mode === 'confirmation') {
    console.log('[Orchestrator] ✅ APPROVAL DETECTED — forcing execution path');
    forceTransition('execution');
    if (onMode) onMode('execution');
    approvePlan();

    const execResult = await runExecution(
      getApprovedPlan(),
      message,
      history,
      skillCtx
    );

    resetAfterExecution();
    
    return {
      action: 'conversation',
      data: { results: execResult.results },
      reply: execResult.reply,
      taskId: execResult.taskId,
      mode: 'conversation',
    };
  }

  // ════════════════════════════════════════════════════════════════════════════════════
  // STEP 2 — REJECTION & ABORT CHECK
  // ════════════════════════════════════════════════════════════════════════════════════
  if (hasSomethingPending) {
    if (isPlanningAbort(message)) {
      console.log('[Orchestrator] 🛑 Process aborted by user');
      setPlanningStage('interactive');
      const next = transition('conversation');
      if (onMode) onMode(next);
      return {
        action: 'conversation',
        data: {},
        reply: 'Theek hai, process stop kar diya. Kuch aur help karoon? 😊',
        mode: 'conversation',
      };
    }

    if (isRejectionMessage(message)) {
      console.log('[Orchestrator] ❌ REJECTION DETECTED — returning to planning');
      if (mode === 'confirmation') {
        transition('planning');
        if (onMode) onMode('planning');
      }
      unlockMode();
      return {
        action: 'conversation',
        data: {},
        reply: 'Theek hai, kya change karna chahte ho? Main plan revise kar deti hoon 😊',
        mode: getCurrentMode(),
      };
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3 — CLASSIFY INTENT
  // ════════════════════════════════════════════════════════════════════════════
  if (mode === 'planning' && getPlanningStage() === 'interactive' && isFinalAgreement(message)) {
    console.log('[Orchestrator] Planning agreement detected before LLM - finalizing structured plan');
    setPlanningStage('finalized');
    forceNextMode = 'planning';
  }

  let targetMode: JennyMode;
  if (forceNextMode) {
    targetMode = transition(forceNextMode);
    if (onMode) onMode(targetMode);
  } else {
    const cls = await classifyIntent(message, history, {
      currentMode: mode,
      hasPendingPlan,
      hasPendingApproval,
      hasPendingAnalysis,
    });
    const desired = resolveNextMode(cls, hasPendingPlan, hasPendingApproval, hasPendingAnalysis);
    targetMode = transition(desired);
    if (onMode) onMode(targetMode);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 4 — SKILL PREFLIGHT (Already done above)
  // ════════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 5 — MODE-SPECIFIC LLM PROMPT
  // ════════════════════════════════════════════════════════════════════════════
  const assignedSkills = jenny?.skills || [];

  let systemPrompt: string;
  if (targetMode === 'analyze') {
    systemPrompt = promptAnalyze(message, skillCtx, assignedTools, unassignedTools, assignedSkills);
  } else if (targetMode === 'planning') {
    const stage = getPlanningStage();
    const conversationSummary = history.slice(-4)
      .map(h => `${h.role === 'user' ? 'User' : 'Jenny'}: ${(h.content as string).slice(0, 120)}`)
      .join('\n');
    systemPrompt = stage === 'finalized'
      ? promptPlanning(pendingAnal, skillCtx, assignedTools, assignedSkills, message)
      : promptInteractivePlanning(message, skillCtx, conversationSummary, assignedTools, unassignedTools, assignedSkills);
  } else if (targetMode === 'confirmation') {
    systemPrompt = promptConfirmation(pendingPlan || pendingAnal, skillCtx);
  } else {
    systemPrompt = promptConversation(enriched);
  }

  const llmMessages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4),
    { role: 'user', content: message, images: images?.length ? images : undefined },
  ];

  const temp = targetMode === 'analyze' ? 0.2 : 0.5;
  let raw = '';

  try {
    if (onSentence && targetMode !== 'analyze') {
      raw = await ollamaChatWithSentenceCallback(
        { messages: llmMessages, model: DEFAULT_MODEL, temperature: temp, num_predict: 2500 },
        onSentence
      );
    } else {
      raw = await ollamaChat({ messages: llmMessages, model: DEFAULT_MODEL, temperature: temp, num_predict: 2500 });
    }
  } catch (err) {
    console.error('[Orchestrator] LLM call failed:', err);
    unlockMode();
    return { action: 'conversation', data: {}, reply: 'System error, retry karo 😅', mode: targetMode };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 6 — RESPONSE VALIDATION
  // ════════════════════════════════════════════════════════════════════════════
  const hasPlanHeader = raw.toLowerCase().includes('plan:');

  if (detectFakeExecution(raw) && targetMode !== 'execution' && !hasPlanHeader) {
    raw = 'Iska plan ready hai. Kya aap approve karte ho ki main execute karun? Say YES to proceed ✅';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 7 — MODE-SPECIFIC RESPONSE HANDLING
  // ════════════════════════════════════════════════════════════════════════════
  if (targetMode === 'conversation') {
    unlockMode();
    return { action: 'conversation', data: {}, reply: raw.trim() || 'Haan 😊', mode: 'conversation' };
  }

  if (targetMode === 'analyze') {
    storePendingAnalysis(raw.trim());
    unlockMode();
    if (/cannot execute/i.test(raw)) {
      resetAfterExecution();
      const rejectMsg = 'Yeh kaam main abhi nahi kar sakti. Kuch aur batao? 😊';
      if (onSentence) onSentence(rejectMsg);
      return { action: 'conversation', data: {}, reply: rejectMsg, mode: 'conversation' };
    }
    return orchestrate(message, history, enriched, images, onSentence, onMode, 'planning');
  }

  if (targetMode === 'planning') {
    unlockMode();
    const currentStage = getPlanningStage();
    if (currentStage === 'interactive') {
      storePendingPlan(raw.trim());
      
      // Check if the user is already approving or if the LLM itself produced a "ready to confirm" signal
      const userApproved = isFinalAgreement(message);
      const llmReady = /ready to confirm|proceed with execution/i.test(raw);

      if (userApproved || llmReady) {
        console.log(`[Orchestrator] Interactive → Finalizing (UserApproved=${userApproved}, LLMReady=${llmReady})`);
        setPlanningStage('finalized');
        // Recurse to generate the actual structured plan immediately
        return orchestrate(message, history, enriched, images, onSentence, onMode, 'planning');
      }
      return { action: 'conversation', data: {}, reply: raw.trim(), mode: 'planning' };
    }

    if (currentStage === 'finalized') {
      function hasStructuredFormat(text: string): boolean {
        const t = text.toLowerCase();
        return t.includes('plan:') && t.includes('execution approach:');
      }
      let finalRaw = raw;
      if (!hasStructuredFormat(finalRaw)) {
        const finalizedSystemPrompt = promptPlanning(pendingAnal, skillCtx, assignedTools, assignedSkills, message);
        const retryRaw = await ollamaChat({
          messages: [
            { role: 'system', content: finalizedSystemPrompt + '\n\n🚨 STRICT: Must include "🔧 PLAN:" and "⚙️ EXECUTION APPROACH:" sections.' },
            ...history.slice(-2),
            { role: 'user', content: message },
          ],
          model: DEFAULT_MODEL,
          temperature: 0.3,
          num_predict: 1200,
        }).catch(() => '');
        if (retryRaw && hasStructuredFormat(retryRaw)) finalRaw = retryRaw;
      }

      // Store plan and transition to confirmation — NO second LLM call
      storePendingPlan(finalRaw.trim());
      setPlanningStage('interactive');
      const next = transition('confirmation');
      if (onMode) onMode(next);
      console.log('[Orchestrator] Structured plan stored → Confirmation mode activated');

      const confirmReply = finalRaw.trim() + '\n\n---\n\n✅ **Plan is ready.** Say **YES** to execute, or tell me what to change.';
      return { action: 'conversation', data: {}, reply: confirmReply, mode: 'confirmation' };
    }
    return { action: 'conversation', data: {}, reply: raw.trim(), mode: getCurrentMode() };
  }

  if (targetMode === 'confirmation') {
    // Plan is already stored. Present it as-is and wait for user's YES/NO.
    storePendingPlan(raw.trim());
    unlockMode();
    return { action: 'conversation', data: {}, reply: raw.trim(), mode: getCurrentMode() };
  }

  unlockMode();
  return { action: 'conversation', data: {}, reply: raw.trim() || 'Haan 😊', mode: targetMode };
}
