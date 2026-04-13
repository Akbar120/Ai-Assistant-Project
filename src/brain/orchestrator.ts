/**
 * ORCHESTRATOR — LLM decision layer (OPTIMIZED FOR SPEED)
 * ─────────────────────────────────────────────────────────────
 * Receives: (message, history, enriched context)
 * Calls:    Ollama gemma4:e4b with a JSON-forcing system prompt
 * Returns:  { action, data, reply }
 */

import { ollamaChat, OllamaMessage, DEFAULT_MODEL } from '@/lib/ollama';
import type { EnrichedInput } from '@/services/inputEnrichment';
import { getKnowledge } from '@/services/knowledge';
import { getAgentStore, saveAgentStore } from './agentManager';
import { createTask, getAllTasks, updateTask, TaskStatus, appendLog } from './taskService';

export interface AgentContext extends EnrichedInput {
  workspacePrompt?: string;
  sessionContext?: string;
}

export type OrchestratorAction = 'conversation' | 'tool_call' | 'create_agent' | 'confirm_agent' | 'edit_agent' | 'restart_agent' | 'learn_knowledge';

export interface OrchestratorResult {
  action: OrchestratorAction;
  data: Record<string, unknown>;
  reply: string;
}

// ── Normalize and remove clutter from Hinglish input ───────────────────────
function cleanInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(uh|umm|matlab|like)/g, '')
    .trim();
}

/**
 * Splits text into manageable chunks for the intent extractor.
 */
function splitIntoChunks(text: string, maxLength = 200): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).length > maxLength) {
      chunks.push(current.trim());
      current = word;
    } else {
      current += ' ' + word;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Compresses messy Hinglish instructions into a structured intent object.
 */
async function extractIntent(message: string): Promise<any> {
  const prompt = `
You are an AI that converts messy Hinglish into structured intent.

Message:
"${message}"

Return ONLY valid JSON:
{
  "goal": "...",
  "features": ["...", "..."],
  "rules": ["...", "..."]
}

Rules:
- Keep it short
- Infer meaning even if grammar is bad
- If unclear, guess best possible intent`;

  try {
    const raw = await ollamaChat({
      messages: [{ role: 'user', content: prompt }],
      model: DEFAULT_MODEL,
      temperature: 0.2,
    });
    return extractJSON(raw);
  } catch {
    return null;
  }
}

/**
 * Extracts intents from multiple chunks and returns a list of results.
 */
async function extractIntentFromChunks(message: string): Promise<any[]> {
  const chunks = splitIntoChunks(message);
  const results = [];

  for (const chunk of chunks) {
    const intent = await extractIntent(chunk);
    if (intent) results.push(intent);
  }

  return results;
}

/**
 * Merges multiple intent objects into a single cohesive structure.
 */
function mergeIntents(intents: any[]) {
  const merged = {
    goal: '',
    features: new Set<string>(),
    rules: new Set<string>()
  };

  for (const i of intents) {
    if (!merged.goal && i.goal) merged.goal = i.goal;

    i.features?.forEach((f: string) => merged.features.add(f));
    i.rules?.forEach((r: string) => merged.rules.add(r));
  }

  return {
    goal: merged.goal,
    features: Array.from(merged.features),
    rules: Array.from(merged.rules)
  };
}

/**
 * Formats a clean, structured Hinglish plan for agent proposals.
 * Ensures the user sees a premium overview instead of raw logic.
 */
function formatCleanPlan(parsed: any): string {
  const args = parsed.data?.args || {};

  return `
Samajh gayi 😏

Tum ek agent banana chahte ho:

### 🧠 Agent Name:
${args.agentName || args.name || 'Unnamed Agent'}

### 🎯 Goal:
${args.goal || 'Not defined yet'}

### ⚙️ Capabilities:
- Monitoring channels for activity
- Learning your conversation style
- Generating proactive suggestions
- Executing tasks on your confirmation

### 🔁 Proposed Workflow:
1. Detect new trigger or message
2. Analyze context and memory
3. Propose best action/reply
4. Execute once you say "go ahead"

---

Batao 😏 ye sahi hai ya kuch change karna hai?
`;
}

/**
 * Checks if a task has all required fields before execution.
 * Prevents execution with ambiguous or missing data.
 */
function isTaskComplete(task: any): boolean {
  if (!task) return false;

  const requiredFieldsMap: Record<string, string[]> = {
    create_agent: ["agent_name", "goal"],
    dm_send: ["username", "message"],
    post: ["content"],
  };

  const args = task.data?.args || task.args || {};
  const type = task.data?.tool || task.type || "";
  const required = requiredFieldsMap[type] || [];

  return required.every((field) => {
    return args[field] !== undefined && args[field] !== "";
  });
}

// ── Hybrid system prompt — prioritizing base rules > workspace context ─────
function buildSystemPrompt(enriched: AgentContext, currentState: any = {}): string {
  const store = getAgentStore();
  const agentList = Object.values(store.agents).map(a => {
    const lastLogs = a.logs.slice(-2).join(' | ');
    return `- ${a.name}: ${a.goal} (${lastLogs})`;
  }).join('\n');

  return `You are Jenny AI — an intelligent orchestrator.

You operate in TWO MODES:

-------------------------
MODE 1: PLANNING (DEFAULT)
-------------------------
- Understand the user's intent (even Hinglish, messy, long text)
- Break it into clear structured plan
- DO NOT output JSON
- DO NOT call tools
- Explain like a human

Output format:
Summary: (what user wants)
Plan:
1. ...
Missing Info (if any): - ...
Suggestions: - ...

End by asking: "Proceed karu?"

-------------------------
MODE 2: EXECUTION
-------------------------
Trigger ONLY if user says: "go ahead", "execute", "create it", "yes", "theek hai"

ONLY in this mode:
- Output STRICT JSON: {"action":"...","data":{...},"reply":"..."}
- No explanation text outside JSON

[BASE_RULES]
- Normalize names: Sohail(not sohel).
- conversation action: be fun, flirty (only in Planning mode).
- create_agent: ALWAYS suggest plan first (Rule 1).

[TASK_ENFORCEMENT_RULE — MANDATORY]
- Every major action MUST create a task.
- NEVER execute silently.
- Log every step to the user.

[WORKSPACE_CONTEXT]
${enriched.workspacePrompt || 'Persona: AI Social Manager'}

[MANAGER_VIEW]
ACTIVE_AGENTS:
${agentList || 'None'}

[STRICT RULES]
- NEVER output JSON in planning mode.
- NEVER mix JSON + text.
- NEVER cut response midway.

-------------------------
ANTI-TRUNCATION RULE
-------------------------
- Limit response size.
- Avoid large nested structures.
- Use summaries instead of long lists.

[AGENT_PROVISIONING_RULE]
- Agent creation is NOT complete until:
  - Skills assigned
  - Tools attached
  - Channels connected
  - Files created
- ALWAYS run the FULL setup pipeline.`;
}

// ── Fast JSON extractor — tries multiple patterns ───────────────────────────
function extractJSON(raw: string): any | null {
  // Pattern 1: find first complete {...} block
  const start = raw.indexOf('{');
  if (start === -1) return null;

  // Walk forward counting braces
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    // Pattern 2: try regex fallback
    const match = raw.match(/\{[\s\S]*?\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { }
    }
    return null;
  }
}

// ── Casual Interaction Detection ──────────────────────────────────────────
function detectCasualMessage(msg: string): boolean {
  const casualTriggers = [
    'hi', 'hello', 'hey', 'yo',
    'kya haal', 'kaise ho', 'kya kar rahi ho',
    'hello jenny', 'jenny hi'
  ];
  const cleaned = msg.toLowerCase().trim();
  // Check if its a very short message containing a trigger
  return cleaned.length < 25 && casualTriggers.some(t => cleaned.includes(t));
}

export async function orchestrate(
  message: string,
  history: OllamaMessage[],
  enriched: AgentContext,
  images?: string[]
): Promise<OrchestratorResult> {
  // ── 0. Casual Check (Highest Priority) ──────────────────────────────────
  if (detectCasualMessage(message)) {
    const casualPrompt = `You are Jenny AI. The user is just saying hi or being casual. 
    Respond in your fun, flirty, Hinglish persona. 
    Keep it short and sweet. NO JSON. NO TOOLS.`;

    const reply = await ollamaChat({
      messages: [{ role: 'system', content: casualPrompt }, ...history.slice(-2), { role: 'user', content: message }],
      model: DEFAULT_MODEL,
      temperature: 0.8,
    });

    return {
      action: 'conversation',
      data: {},
      reply: reply.trim()
    };
  }

  // ── Extract current slot state from last assistant JSON ─────────────────
  let currentState: any = {};
  // Only look at last 3 messages for state (faster than scanning all)
  const recentHistory = history.slice(-6);
  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const msg = recentHistory[i];
    if (msg.role === 'assistant') {
      const parsed = extractJSON(msg.content);
      if (parsed?.data && Object.keys(parsed.data).length > 0) {
        currentState = parsed.data;
        break;
      }
    }
  }

  let systemPrompt = buildSystemPrompt(enriched, currentState);
  const isExecutionMode = /go ahead|execute|create it|yes|theek hai/i.test(message);

  if (isExecutionMode) {
    systemPrompt += "\n[CURRENT_MODE: EXECUTION — OUTPUT ONLY JSON]";
  } else {
    systemPrompt += "\n[CURRENT_MODE: PLANNING — NO JSON, HUMAN SUMMARY ONLY]";
  }

  const cleaned = cleanInput(message);

  // ── STRUCTURE THE INTENT ────────────────────────────────────────────────
  let finalIntentObj = cleaned.length > 120 ? await extractIntent(cleaned) : null;

  if (cleaned.length > 120 && !finalIntentObj) {
    finalIntentObj = {
      goal: cleaned,
      features: [],
      rules: []
    };
  }

  const finalUserMessage = finalIntentObj
    ? `
User wants to build something.

INTERPRETED INTENT:
Goal: ${finalIntentObj.goal}

Features:
${finalIntentObj.features?.join('\n') || 'None'}

Rules:
${finalIntentObj.rules?.join('\n') || 'None'}

Now:
- Expand this into a clear structured plan
- Do NOT ask vague questions`
    : cleaned;

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    // Trimmed to last 4 messages for token safety
    ...history.slice(-4),
    {
      role: 'user',
      content: finalUserMessage,
      images: images?.length ? images : undefined,
    },
  ];

  let raw = '';
  try {
    raw = await ollamaChat({
      messages,
      model: DEFAULT_MODEL,
      temperature: 0.3,
      num_predict: 1500, // Increased for complex tasks
    });
  } catch (err) {
    console.error('[Orchestrator] Ollama call failed:', err);
    throw err;
  }

  // ── Task Propagation & Injection ──────────────────────────────────────────
  let activeTaskId: string | undefined;

  // 1. Check for recent active task in history or look up by intent
  const tasks = await getAllTasks();
  const runningTask = tasks.find(t => t.status === 'processing' || t.status === 'waiting_input');

  const messageIntent = message.toLowerCase();
  let taskType: string = 'execution';
  if (/create|agent/i.test(messageIntent)) taskType = 'create_agent';
  else if (/dataset|train/i.test(messageIntent)) taskType = 'dataset_creation';
  else if (/sandbox|test/i.test(messageIntent)) taskType = 'sandbox';

  if (runningTask) {
    activeTaskId = runningTask.id;
  } else if (/create|agent|dm|send|train|dataset|sandbox|post/i.test(message)) {
    // 2. Auto-initialize task with Template Mapping
    const newTask = await createTask({
      type: taskType,
      name: `${taskType.replace('_', ' ').toUpperCase()}: ${message.substring(0, 20)}...`,
      source: 'orchestrator'
    });
    activeTaskId = newTask.id;
  }

  // ── Parse JSON with Robust Pipeline ──────────────────────────────────────
  let parsed = extractJSON(raw);

  if (!parsed) {
    // Robust Fallback: Handle raw text as a conversation reply
    parsed = {
      action: 'conversation',
      data: {},
      reply: raw.trim() || 'Thoda short me batao na yaar 😅'
    };
  }

  // ── 3. Confirmation Loop Integration: Dependency Guard ─────────────────
  if (parsed.action === 'tool_call' && (parsed.data as any).tool === 'create_agent') {
    const args = (parsed.data as any).args || {};
    // Check for obvious missing dependencies
    const missing = [];
    if (!args.name) missing.push('Agent Name');
    if (!args.goal) missing.push('Agent Goal');

    // Future: check database for Instagram keys if intent includes 'instagram'
    if (message.toLowerCase().includes('instagram')) {
      // Mocking check: if we had a secret storage tool, we'd call it here
      // For now, assume we need to ask if it's the first time
    }

    if (missing.length > 0) {
      parsed = {
        action: 'conversation',
        data: { missing },
        reply: `Pakka agent banana hai? Par ye details missing hain: ${missing.join(', ')}. Batao na!`
      };
    }
  }

  // ── 4. Auto Task Chain: Trigger Setup Mission ────────────────────────
  if (parsed.action === 'tool_call' && (parsed.data as any).tool === 'create_agent' && activeTaskId) {
    await appendLog(activeTaskId, 'Agent creation initiated. Transitioning to Setup Pipeline...', 'info', 'orchestrator', 'provision_workspace');
  }

  // ── SAFE WRAPPER: Task Validation Guard ────────────────────────────────
  try {
    if (parsed.action === 'tool_call' && !isTaskComplete(parsed)) {
      // If incomplete, pivot to clarification
      parsed = {
        action: 'conversation',
        data: parsed.data,
        reply: `Wait, I need more info to complete this. Check missing fields! (Hint: Use confirmation_loop)`
      };
    }
  } catch (err) {
    console.error("Task validation failed:", err);
    return {
      action: 'conversation',
      data: {},
      reply: "System me thoda issue aa gaya hai, retry karo."
    };
  }

  // Guarantee safe output
  if (!parsed.reply?.trim()) parsed.reply = raw.trim() || 'Thoda short me batao na yaar 😅 kya banana hai exactly?';

  // Use mode detection for seriousness guard
  if (!isExecutionMode && parsed.action === 'conversation' && cleaned.length > 50) {
    parsed.reply = `
Samajh gayi 😏

Main isko structure kar deti hoon:

${parsed.reply}
`;
  }

  if (!parsed.action) parsed.action = 'conversation';
  if (!parsed.data) parsed.data = {};

  // ── CONFIRMATION MODE (Guard create_agent) ─────────────────────────────
  if (parsed.action === 'tool_call' && (parsed.data as any).tool === 'create_agent') {
    parsed.action = 'confirm_agent';
    parsed.reply = formatCleanPlan(parsed);
  }

  // ── Tool Injection Guard: Mandatory Task Context ────────────────────────
  if (parsed.action === 'tool_call' || parsed.action === 'create_agent') {
    if (activeTaskId) {
      if (!parsed.data) parsed.data = {};
      const data = parsed.data as any;
      if (!data.args) data.args = {};

      // AUTO-INJECT TASK CONTEXT
      data.args.task_id = activeTaskId;

      // Log execution attempt to task
      await appendLog(activeTaskId, `Attempting Tool Call: ${data.tool || parsed.action}`);
    }
  }

  return parsed;
}
