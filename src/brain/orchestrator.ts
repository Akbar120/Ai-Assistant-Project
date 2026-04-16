/**
 * ORCHESTRATOR — LLM decision layer (OPTIMIZED FOR SPEED)
 * ─────────────────────────────────────────────────────────────
 * Receives: (message, history, enriched context)
 * Calls:    Ollama gemma4:e4b with a JSON-forcing system prompt
 * Returns:  { action, data, reply }
 */

import fs from 'fs';
import path from 'path';
import { ollamaChat, ollamaChatWithSentenceCallback, OllamaMessage, getActiveModel } from '@/lib/ollama';
import { matchSkills, buildSkillContext, SkillMatch } from './skillsEngine';
import type { EnrichedInput } from '@/services/inputEnrichment';
import { getKnowledge } from '@/services/knowledge';
import { getAgentStore, saveAgentStore } from './agentManager';
import { createTask, getAllTasks, updateTask, TaskStatus, appendLog, exists as taskExists } from './taskService';
import { get_channels, get_config, get_agents, get_tasks, get_skills } from './tools/reality';
import { ALL_TOOLS } from './toolRegistry';
import { setPendingAction } from './state';

export interface AgentContext extends EnrichedInput {
  workspacePrompt?: string;
  sessionContext?: string;
}

export type OrchestratorAction = 'conversation' | 'tool_call' | 'create_agent' | 'confirm_agent' | 'edit_agent' | 'restart_agent' | 'learn_knowledge';

export interface OrchestratorResult {
  action: OrchestratorAction;
  data: Record<string, unknown>;
  reply: string;
  taskId?: string;
}

// ─── Intent Types ───────────────────────────────────────────────────────────
export type IntentType = 'casual' | 'agent_creation' | 'automation' | 'external_action' | 'system_status';

// ── Normalize and remove clutter from Hinglish input ───────────────────────
function cleanInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(uh|umm|matlab|like)/g, '')
    .trim();
}

/**
 * Maps input to specific Intent Types for thresholding.
 */
function detectIntentType(message: string): IntentType {
  const msg = message.toLowerCase();
  if (detectCasualMessage(msg)) return 'casual';
  // delete/manage must NOT be classified as agent_creation (which gates the task guard differently)
  if (/delete agent|remove agent|manage agent|restart agent/.test(msg)) return 'automation';
  if (/create|agent|setup|provision/i.test(msg)) return 'agent_creation';
  if (/insta|instagram|post|tweet|x\.com|discord|dm|send/i.test(msg)) return 'external_action';
  if (/status|config|tasks|skills|reality/i.test(msg)) return 'system_status';
  return 'automation';
}

/**
 * Determines if a task should be created for this intent.
 */
function shouldCreateTask(intent: IntentType): boolean {
  // Create tasks for all real execution paths so tool injection works
  return intent === 'agent_creation' || intent === 'external_action' || intent === 'automation';
}

/**
 * Parallelized Reality Hydration (Limited by Intent).
 */
async function preProcessReality(intent: IntentType, taskId: string): Promise<Record<string, any>> {
  const reality: Record<string, any> = {};
  const promises: Promise<any>[] = [];

  const args = { task_id: taskId, requester: 'orchestrator' };

  if (intent === 'external_action' || intent === 'system_status') {
    promises.push(get_channels(args).then(res => reality.insta = res.data.instagram));
  }
  if (intent === 'agent_creation' || intent === 'system_status') {
    promises.push(get_agents(args).then(res => reality.agents = res.data?.length || 0));
    promises.push(get_skills(args).then(res => reality.skills = res.data?.length || 0));
  }
  if (intent === 'system_status') {
    promises.push(get_config(args).then(res => reality.conf = res.data));
    promises.push(get_tasks(args).then(res => reality.tasks = res.data?.length || 0));
  }

  // Promise.race for global timeout protection (2s)
  await Promise.race([
    Promise.all(promises),
    new Promise(res => setTimeout(res, 2000))
  ]);

  return reality;
}

/**
 * Compresses Reality Object into tiny tokens for the LLM.
 */
function compressTruth(reality: Record<string, any>): string {
  if (Object.keys(reality).length === 0) return '';
  
  const compact: any = {};
  if (reality.insta) compact.ig = { c: reality.insta.connected ? 1 : 0, v: reality.insta.valid ? 1 : 0 };
  if (reality.agents !== undefined) compact.a = reality.agents;
  if (reality.tasks !== undefined) compact.t = reality.tasks;
  if (reality.skills !== undefined) compact.s = reality.skills;

  return `[SYSTEM_TRUTH: ${JSON.stringify(compact)}]`;
}

/**
 * Splits text into manageable chunks for the intent extractor.
 */
function splitIntoChunks(text: string, maxLength = 200): string[] {
  if (!text || typeof text !== 'string') return [];
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
      model: getActiveModel(),
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
 * Only validates create_agent and dm_send — all other tool_calls pass through.
 */
function isTaskComplete(task: any): boolean {
  if (!task) return false;
  if (!task.data?.tool) return true; // No tool specified = conversation, always pass

  // Only strictly validate these high-risk operations, everything else passes
  const strictValidation: Record<string, string[]> = {
    create_agent: ['agentName', 'goal'],
    dm_send: ['username', 'message'],
  };

  const tool = task.data?.tool || '';
  const required = strictValidation[tool] || []; // manage_agent, code_executor, etc = no strict check
  if (required.length === 0) return true;

  const args = task.data?.args || {};
  return required.every((field) => args[field] !== undefined && args[field] !== '');
}

// ── Hybrid system prompt — prioritizing base rules > workspace context ─────
function buildSystemPrompt(enriched: AgentContext, currentState: any = {}, skillContext?: string): string {
  const store = getAgentStore();
  const agentsMap = store?.agents || {};
  const agentList = Object.values(agentsMap).map((a: any) => {
    const lastLog = a.logs?.slice(-1)[0] || 'No activity';
    const statusIcon = a.status === 'running' ? '🟢' : a.status === 'error' ? '🔴' : '🟡';
    return `${statusIcon} ${a.name} [${a.status}] → ${a.goal} | Last: ${lastLog}`;
  }).join('\n');

  const skillBlock = skillContext ? `\n\n[ACTIVE_SKILL_CONTEXT]\n${skillContext}\n` : '';

  // Dynamically load tools
  const toolsList = ALL_TOOLS.map(t => `- ${t.id} → ${t.description}`).join('\n');

  // Dynamically load skills
  let skillsList = '';
  try {
    const skillsDir = path.join(process.cwd(), 'src', 'brain', 'skills');
    if (fs.existsSync(skillsDir)) {
      const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
      skillsList = skillFiles.map(f => `- ${f.replace('.md', '')}`).join('\n');
    }
  } catch (err) {
    skillsList = '- (Error loading skills)';
  }

  return `You are Jenny — the Orchestrator Brain of OpenClaw, a multi-agent AI operating system.

You are NOT a chatbot. You are a living system brain.
Your job is to: observe → reason → propose → execute.
${skillBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 CORE BEHAVIOR: ORCHESTRATOR MINDSET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before responding to any request, you MUST internally reason through:

1. OBSERVE — What does the system currently look like?
   - Are agents running or idle?
   - Are there pending tasks?
   - Which skills are available?
   - Which channels are connected?

2. REASON — What is the user actually trying to achieve?
   - Look past the surface request
   - If they say "monitor my DMs" → they want proactive replies, not manual checking
   - Match available skills to the objective

3. PROPOSE — Surface your reasoning to the user
   - Tell them WHAT you're going to use: "I'll use the agent_creator skill + instagram_dm_reader tool"
   - Tell them WHY: "because this requires continuous polling, not a one-shot reply"
   - Suggest things they haven't asked for yet if relevant

4. EXECUTE — Once confirmed, act immediately
   - No re-explaining, no re-planning
   - Output the JSON action blob and proceed
   - Confirm what was done with a clear status report

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 RESPONSE STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Hinglish persona: smart, direct, slightly playful
- Always show your thinking briefly: "Maine dekha ki... isliye main suggest kar rahi hoon..."
- When you identify a skill match: name it explicitly
- When you identify a tool: name it explicitly
- When recommending an agent: explain what it will DO, not just what it IS
- Never give generic replies like "main help kar sakti hoon" — be specific

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 AVAILABLE TOOLKIT (REAL ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOLS (executable):
${toolsList}

NEVER invent tools that don't exist above.
NEVER assign tools to agents that aren't in this list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 AVAILABLE SKILLS (INSTALLED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Skills are in /brain/skills/ — only use what exists:
${skillsList || '- No skills installed.'}

NEVER assign skills that are not in this list.
If a needed skill doesn't exist, use code_executor or install_skill to create it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ ACTION MODES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLANNING (no JSON):
- Default mode for new requests
- Show your reasoning + skill/tool selection + proposed plan
- End with a clear question: "Shall I proceed?" or "Confirm karu?"

EXECUTION (JSON only, no text outside JSON):
- Triggered when user says: yes / go ahead / kar de / theek hai / confirm / haan / proceed
- DO NOT repeat the plan — just execute and confirm done

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ TOOL EXECUTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. When executing, output ONLY a single JSON object. No text before or after it.
2. You MUST use a tool from the TOOLS list. Skills are NOT tools — never use a skill name as the tool value.
3. Tool call JSON format:
{"action":"tool_call","data":{"tool":"<tool_id>","args":{<args>}},"reply":"<what you did>"}

CRITICAL EXAMPLES — memorize these:
• Delete an agent:    {"action":"tool_call","data":{"tool":"manage_agent","args":{"operation":"delete_agent","target_agent":"DM_Master_V2"}},"reply":"Deleting agent DM_Master_V2..."}
• Create tool+skill: {"action":"tool_call","data":{"tool":"code_executor","args":{"operation":"create_feature","name":"result_fetcher","description":"Fetches final agent results"}},"reply":"Creating tool and skill..."}
• Search the web:    {"action":"tool_call","data":{"tool":"search_web","args":{"query":"your search"}},"reply":"Searching..."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION (casual, no JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- For greetings, small talk, status questions
- Stay in persona but be helpful and smart

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AGENT CREATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When creating an agent:
1. Select ONLY real skills from the installed list above
2. Select ONLY real tools from the toolkit above
3. Output JSON in EXECUTION mode:
{"action":"create_agent","data":{"args":{"agentName":"...","name":"...","goal":"...","role":"...","tools":["instagram_dm_reader"],"skills":["agent_creator","system_awareness"],"channels":["instagram"],"pollingInterval":60000}},"reply":"Creating agent..."}

After creation, CONFIRM clearly:
"✅ Agent [name] created and deployed."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 CONNECTED PLATFORMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Instagram: Browser session (no API key needed)
- Discord: Connected
- Twitter/X: Connected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 AGENT DECISION LOOP (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If you see a [NOTIFICATION] from an agent in the message context, OR if \`get_agent_output\` reveals new unread DMs or suggested replies that haven't been shared with the user yet:
1. USE \`get_agent_output(agent_id)\` if you haven't already to see the full details.
2. IMMEDIATELY PRESENT the findings (e.g., Unread DMs) and any suggested replies to the user.
3. CLEARLY ASK for a decision: "Option 1, 2, 3 selection, or Abandon?"
4. IF USER SELECTS A SUGGESTION: Use \`agent_command(agent_id, "execute", {"text": "exact reply"})\`.
5. IF USER SAYS 'ABANDON': Use \`agent_command(agent_id, "abandon")\`.

Jenny must never send the DM herself if an agent is already handling that conversation; she must always use \`agent_command\` to tell the agent to do it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👁️ CURRENT SYSTEM STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVE AGENTS:
${agentList || 'No agents running — system is idle.'}

WORKSPACE:
${enriched.workspacePrompt || 'Default workspace active.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 HARD RULES (NEVER VIOLATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NEVER send DMs without explicit user approval
- NEVER make up tools or skills not in the lists above
- NEVER stop agent creation midway — run the full pipeline
- NEVER expose raw JSON in planning or conversation mode
- NEVER repeat yourself on confirmed actions — just execute
- NEVER ask "shall I proceed?" after the user already said yes
- ALWAYS name the skill and tool you're choosing and explain why`;
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
  images?: string[],
  onSentence?: (sentence: string) => void
): Promise<OrchestratorResult> {
  // ── 0. Intent & Tasking (Conditional) ──────────────────────────────────
  const intent = detectIntentType(message);
  let activeTaskId: string | undefined;

  if (shouldCreateTask(intent)) {
    const taskType = intent === 'agent_creation' ? 'create_agent' : 'execution';
    const newTask = await createTask({
      type: taskType,
      name: `${taskType.toUpperCase()}: ${message.substring(0, 25)}`,
      source: 'orchestrator',
      status: 'created'
    });
    activeTaskId = newTask.id;
    // Advance to processing immediately for lifecycle enforcement
    await updateTask(activeTaskId, { status: 'processing' });
  }

  // ── 2. Casual Check (Highest Priority — skip skills entirely) ───────────────
  if (intent === 'casual') {
    const casualPrompt = `You are Jenny AI. The user is just saying hi or being casual. 
    Respond in your fun, flirty, Hinglish persona. 
    Keep it short and sweet. NO JSON. NO TOOLS.`;

    const reply = onSentence 
      ? await ollamaChatWithSentenceCallback(
          { messages: [{ role: 'system', content: casualPrompt }, ...history.slice(-2), { role: 'user', content: message }], model: getActiveModel(), temperature: 0.8 },
          (s) => onSentence(s)
        )
      : await ollamaChat({
          messages: [{ role: 'system', content: casualPrompt }, ...history.slice(-2), { role: 'user', content: message }],
          model: getActiveModel(),
          temperature: 0.8,
        });

    return {
      action: 'conversation',
      data: {},
      reply: reply.trim(),
      taskId: activeTaskId
    };
  }

  // ── DETERMINISTIC COMMAND INTERCEPT ─────────────────────────────────────────
  // For explicit structural commands, we bypass the LLM entirely.
  // Small models (4B) reliably fail to produce correct JSON for these operations.
  // We parse the user's intent directly and synthesize the correct action.
  const msgLower = message.toLowerCase().trim();

  // ── Delete Agent ──────────────────────────────────────────────────────────
  // Supports: "delete agent X", "delete X", "remove agent X", "remove X"
  const deleteMatch = message.match(/(?:delete|remove)\s+(?:agent\s+)?(.+)/i);
  if (deleteMatch) {
    const rawName = deleteMatch[1].trim();
    const store = getAgentStore();
    const agents = store?.agents || {};

    // Normalize: lowercase, strip spaces/underscores/hyphens
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '');
    const normalizedInput = normalize(rawName);

    // Score all agents — exact wins, longer overlap beats shorter
    const scored = Object.entries(agents).map(([key, agent]: [string, any]) => {
      const n = normalize(agent.name || '');
      let score = 0;
      if (n === normalizedInput) score = 200;              // exact match: highest
      else if (n.startsWith(normalizedInput)) score = 100; // input is prefix of name
      else if (normalizedInput.startsWith(n)) score = n.length; // name is prefix of input (penalise short names)
      else if (n.includes(normalizedInput)) score = 60;   // input is substring of name
      else if (normalizedInput.includes(n)) score = n.length - 10; // name is substring of input (penalise)
      return { key, agent, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    const best = scored[0];

    if (!best) {
      const displayNames = Object.values(agents).map((a: any) => a.name || '(unknown)').join(', ');
      return {
        action: 'conversation', data: {},
        reply: `Maine check kiya — "${rawName}" naam ka koi agent nahi mila. Available agents: **${displayNames || 'none'}**. Naam dobara check karo? 🔍`,
        taskId: activeTaskId
      };
    }

    const matchedKey = best.key;
    const matchedAgent = best.agent;

    // Queue a pending_action so the route's confirm handler fires manage_agent
    setPendingAction({ type: 'agent_delete', data: { agentId: matchedKey } });
    return {
      action: 'conversation', data: {},
      reply: `⚠️ **Confirm Deletion**\n\nAgent **${matchedAgent.name || matchedKey}** ko permanently delete karna chahte ho? Yeh action undo nahi hoga.\n\nType "yes" or "confirm" to proceed.`,
      taskId: activeTaskId
    };
  }

  // ── Create Tool/Skill/Feature ──────────────────────────────────────────────
  const createFeatureMatch = message.match(/create\s+(?:a\s+)?(?:new\s+)?(?:tool\s+and\s+skill|skill\s+and\s+tool|feature)\s+(?:called\s+)?(.+)/i);
  const createSkillMatch = message.match(/create\s+(?:a\s+)?(?:new\s+)?skill\s+(?:called\s+|for\s+|named\s+)?(.+)/i);
  const createToolMatch = message.match(/create\s+(?:a\s+)?(?:new\s+)?tool\s+(?:called\s+|for\s+|named\s+)?(.+)/i);

  if (createFeatureMatch) {
    const desc = createFeatureMatch[1].trim();
    const name = desc.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
    return {
      action: 'tool_call',
      data: { tool: 'code_executor', args: { operation: 'create_feature', name, description: desc, task_id: activeTaskId } },
      reply: `🛠️ Creating tool + skill for "${desc}"...`,
      taskId: activeTaskId
    };
  }

  if (createSkillMatch && !createToolMatch) {
    const desc = createSkillMatch[1].trim();
    const name = desc.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
    return {
      action: 'tool_call',
      data: { tool: 'code_executor', args: { operation: 'create_skill', name, description: desc, task_id: activeTaskId } },
      reply: `📋 Creating skill "${name}"...`,
      taskId: activeTaskId
    };
  }

  if (createToolMatch) {
    const desc = createToolMatch[1].trim();
    const name = desc.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
    return {
      action: 'tool_call',
      data: { tool: 'code_executor', args: { operation: 'create_tool', name, description: desc, task_id: activeTaskId } },
      reply: `🔧 Creating tool "${name}"...`,
      taskId: activeTaskId
    };
  }

  // ── Restart Agent ─────────────────────────────────────────────────────────
  const restartMatch = message.match(/restart\s+agent\s+(.+)/i);
  if (restartMatch) {
    const rawName = restartMatch[1].trim();
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '');
    const normalizedInput = normalize(rawName);
    const store = getAgentStore();
    const matchedEntry = Object.entries(store?.agents || {}).find(([, agent]: [string, any]) => {
      const n = normalize(agent.name || '');
      return n === normalizedInput || n.includes(normalizedInput) || normalizedInput.includes(n);
    });
    if (!matchedEntry) {
      const displayNames = Object.values(store?.agents || {}).map((a: any) => a.name || '(unknown)').join(', ');
      return { action: 'conversation', data: {}, reply: `Agent "${rawName}" nahi mila. Available: **${displayNames}**`, taskId: activeTaskId };
    }
    const [matchedKey, matchedAgent] = matchedEntry as [string, any];
    return {
      action: 'tool_call',
      data: { tool: 'manage_agent', args: { operation: 'restart_agent', target_agent: matchedKey, task_id: activeTaskId } },
      reply: `🔄 Restarting agent "${(matchedAgent as any).name || matchedKey}"...`,
      taskId: activeTaskId
    };
  }
  // ── END DETERMINISTIC INTERCEPT ───────────────────────────────────────────

  let skillContext = '';
  try {
    let focusMessage = message;
    if (message.length < 20 && history.length > 0) {
      // If user just said "yes" or "go ahead", use the assistant's previous context to keep skills loaded
      const lastAsst = history.slice(-1)[0];
      if (lastAsst?.role === 'assistant') {
        focusMessage = lastAsst.content + ' ' + message;
      }
    }
    const matchedSkills: SkillMatch[] = await matchSkills(focusMessage);
    skillContext = buildSkillContext(matchedSkills);
  } catch (skillErr) {
    console.error('[Orchestrator] Skills pre-pass failed (non-fatal):', skillErr);
  }

  // ── Reality Hydration (Parallel) ──────────────────────────────────────────
  const reality = activeTaskId ? await preProcessReality(intent, activeTaskId) : {};
  const compressedTruth = compressTruth(reality);

  // ── 3. Extract current slot state from last assistant JSON ────────────────
  let currentState: any = {};
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

  const systemPrompt = buildSystemPrompt(enriched, currentState, skillContext || undefined);
  const isExecutionMode = /go ahead|execute|create (it|this)|yes|theek hai|haan|confirm|kar de|proceed|do it/i.test(message);

  // Inject System Truth as a brief system note (not mutating the const)
  const truthNote = compressedTruth
    ? `\n[SYSTEM_SNAPSHOT] ${compressedTruth}\nUse this snapshot to verify reality before responding.`
    : '';

  const cleaned = cleanInput(message);

  // ── STRUCTURE THE INTENT (only for very long messages) ────────────────────────────────────────────────
  let finalIntentObj = cleaned.length > 300 ? await extractIntent(cleaned) : null;

  if (cleaned.length > 300 && !finalIntentObj) {
    finalIntentObj = {
      goal: cleaned,
      features: [],
      rules: []
    };
  }

  let finalUserMessage = finalIntentObj
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

  if (isExecutionMode) {
    finalUserMessage += `\n\n[SYSTEM DIRECTIVE: EXECUTION GRANTED]\nThe user authorized execution. You MUST execute the correct action using rigorous JSON format.\nExample: {"action":"tool_call", "data":{"tool":"...", "args":{...}}, "reply":"..."}\nABSOLUTELY NO TEXT OUTSIDE JSON. OUTPUT ONLY RAW JSON.`;
  }

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt + truthNote },

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
    raw = onSentence
      ? await ollamaChatWithSentenceCallback(
          { messages, model: getActiveModel(), temperature: 0.3, num_predict: 2000 },
          (s) => onSentence(s)
        )
      : await ollamaChat({
          messages,
          model: getActiveModel(),
          temperature: 0.3,
          num_predict: 2000,
        });
  } catch (err) {
    console.error('[Orchestrator] Ollama call failed:', err);
    throw err;
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
  if (!parsed.reply?.trim()) parsed.reply = raw.trim() || 'Thoda sochna padega... kya exactly karna hai?';

  if (!parsed.action) parsed.action = 'conversation';
  if (!parsed.data) parsed.data = {};

  // ── CONFIRMATION MODE (Guard create_agent) ─────────────────────────────
  // Route both tool_call create_agent AND confirm_agent → create_agent for the chat route
  if (
    (parsed.action === 'tool_call' && (parsed.data as any).tool === 'create_agent') ||
    parsed.action === 'confirm_agent'
  ) {
    parsed.action = 'create_agent';
    // Ensure data.args exists with all needed agent fields
    const d = parsed.data as any;
    if (!d.args && !d.agentName && !d.name) {
      // If LLM returned flat data, wrap it in args
      parsed.data = { args: d };
    }
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

  parsed.taskId = activeTaskId;
  return parsed;
}
