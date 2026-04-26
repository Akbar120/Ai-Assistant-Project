/**
 * MODE MANAGER — Jenny's 5-Mode Hard State Machine
 * ─────────────────────────────────────────────────────────────
 * Modes:
 *   conversation  → casual chat
 *   planning      → clarifying / structuring a task
 *   analyze       → inspecting tools/skills, deciding execution path
 *   confirmation  → presenting full plan + permissions, awaiting approval
 *   execution     → running approved tools/skills (system only)
 *
 * ALLOWED TRANSITIONS ONLY:
 *   conversation → planning | analyze
 *   planning     → analyze | confirmation
 *   analyze      → planning | confirmation
 *   confirmation → execution | planning
 *   execution    → conversation   (ONLY after task completes)
 *
 * Intent classification is DETERMINISTIC (no LLM).
 * The LLM is NEVER used for mode decisions.
 */

import { OllamaMessage } from '@/lib/ollama';

// ── Types ─────────────────────────────────────────────────────────────────────
export type JennyMode = 'conversation' | 'planning' | 'analyze' | 'confirmation' | 'execution';

export interface IntentClassification {
  intent_type: JennyMode;
  confidence: number;
  reason: string;
  target: string;
  requires_tools: boolean;
  requires_approval: boolean;
  is_task: boolean;
  ambiguity: boolean;
}

// ── Allowed transition table ──────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<JennyMode, JennyMode[]> = {
  conversation:  ['planning', 'analyze'],
  planning:      ['analyze', 'confirmation', 'conversation'],
  analyze:       ['planning', 'confirmation', 'conversation'],
  confirmation:  ['execution', 'planning', 'conversation'],
  execution:     ['conversation'],
};

// ── In-memory state ───────────────────────────────────────────────────────────
let currentMode: JennyMode = 'conversation';
let modeLocked    = false;
let pendingAnalysis = '';
let pendingPlan     = '';
let approvedPlan    = '';
let modeEnteredAt   = Date.now();
let executionApproved = false; // 🔥 Global execution approval flag
let planningStage: 'interactive' | 'finalized' = 'interactive'; // Two-stage planning

// ── Getters ───────────────────────────────────────────────────────────────────
export const getCurrentMode     = (): JennyMode => currentMode;
export const isModeLocked       = () => modeLocked;
export const getPendingPlan     = () => pendingPlan;
export const getApprovedPlan    = () => approvedPlan;
export const getPendingAnalysis = () => pendingAnalysis;
export const isExecutionApproved = () => executionApproved; // 🔥 Check if execution was approved
export const getPlanningStage   = (): 'interactive' | 'finalized' => planningStage;

export function setPlanningStage(stage: 'interactive' | 'finalized') {
  planningStage = stage;
  console.log(`[ModeManager] 🧠 Planning stage → ${stage}`);
}

// ── State stores ──────────────────────────────────────────────────────────────
export function storePendingAnalysis(text: string) { pendingAnalysis = text; }
export function storePendingPlan(text: string)     { pendingPlan = text; }

export function approvePlan() {
  approvedPlan    = pendingPlan || pendingAnalysis;
  pendingPlan     = '';
  pendingAnalysis = '';
  executionApproved = true; // 🔥 CRITICAL: Mark execution as approved
}

export function resetAfterExecution() {
  approvedPlan    = '';
  pendingPlan     = '';
  pendingAnalysis = '';
  executionApproved = false; // 🔥 RESET: Clear approval
  planningStage   = 'interactive'; // Reset planning sub-stage
  modeLocked      = false;
  _forceMode('conversation');
}

/** Complete system reset — clears all memory and locks */
export function resetAll() {
  approvedPlan    = '';
  pendingPlan     = '';
  pendingAnalysis = '';
  executionApproved = false;
  planningStage   = 'interactive'; // Reset planning sub-stage
  modeLocked      = false;
  _forceMode('conversation');
}

// ── Transition enforcer ───────────────────────────────────────────────────────
export function transition(to: JennyMode): JennyMode {
  if (to === currentMode) return currentMode;
  const allowed = ALLOWED_TRANSITIONS[currentMode] ?? [];
  if (!allowed.includes(to)) {
    console.warn(`[ModeManager] ❌ BLOCKED ${currentMode} → ${to}. Allowed: [${allowed.join(', ')}]`);
    return currentMode;
  }
  console.log(`[ModeManager] ✅ ${currentMode} → ${to}`);
  currentMode  = to;
  modeLocked   = true;
  modeEnteredAt = Date.now();
  return currentMode;
}

function _forceMode(mode: JennyMode) {
  currentMode  = mode;
  modeLocked   = false;
  modeEnteredAt = Date.now();
}

/** System-level override — ONLY for approval path and reset. Logs clearly. */
export function forceTransition(to: JennyMode): JennyMode {
  console.warn(`[ModeManager] ⚡ FORCE ${currentMode} → ${to} (system override)`);
  currentMode  = to;
  modeLocked   = false;
  modeEnteredAt = Date.now();
  return currentMode;
}

export function unlockMode() {
  modeLocked = false;
}

// ── DETERMINISTIC INTENT CLASSIFIER ──────────────────────────────────────────
//
// NO LLM. Pure rules. Always fires correctly.
// This replaces the LLM-based classifyIntent entirely.
//

/** Strong task action verbs — if present, it's a task */
const TASK_VERBS = [
  'post', 'publish', 'upload', 'share', 'send', 'dm', 'message',
  'create', 'build', 'make', 'write', 'generate', 'produce',
  'search', 'find', 'fetch', 'get', 'look up', 'research',
  'schedule', 'deploy', 'run', 'execute', 'start',
  'delete', 'remove', 'update', 'edit', 'change',
  'install', 'download', 'read', 'check', 'monitor',
  'suggest', 'recommend', 'propose', 'advise', 'plan',
  'karo', 'karna', 'banao', 'bhejo', 'dhundo', 'likho',
  'chalao', 'shuru', 'band', 'likho', 'bana',
];

/** Pure casual signals — greetings, reactions, acknowledgements */
const CASUAL_PATTERNS = [
  /^(hi+|hello+|hey+|namaste|salaam|yo|sup|wassup)[!.,\s]*$/i,
  /^(hm+|hmm+|ok+|okay|k|sure|thanks|thank you|nice|cool|great|good|wow|lol|haha)[!.,\s]*$/i,
  /^(who are you|what are you|tum kaun|aap kaun|what can you do|kya kar sakti)[?!.,\s]*$/i,
  /^(how are you|how r u|kaise ho|kya haal)[?!.,\s]*$/i,
  /^(bye|goodbye|alvida|see you|cya)[!.,\s]*$/i,
];

/** Filler-only messages — probably a continuation, not a new task */
const FILLER_ONLY = /^(uh+|um+|ah+|oh+|i see|got it|acha|accha|theek|haan|na|nahi)[!.,\s]*$/i;

export function classifyIntent(
  message: string,
  history: OllamaMessage[],
  ctx: {
    currentMode: JennyMode;
    hasPendingPlan: boolean;
    hasPendingApproval: boolean;
    hasPendingAnalysis: boolean;
  }
): IntentClassification {
  const clean = message.toLowerCase().trim();
  const wordCount = clean.split(/\s+/).length;

  // ── 1. Pure casual — always conversation ──────────────────────────────────
  if (CASUAL_PATTERNS.some(p => p.test(clean))) {
    return _cls('conversation', 0.97, 'casual greeting/reaction', false, false);
  }

  if (FILLER_ONLY.test(clean)) {
    return _cls('conversation', 0.90, 'filler word only', false, false);
  }

  // ── 2. Very short message with no task verb → conversation ────────────────
  if (wordCount <= 2 && !TASK_VERBS.some(v => clean.includes(v))) {
    return _cls('conversation', 0.80, 'short, no task verb', false, false);
  }

  // ── 3. Task verb present → always analyze ─────────────────────────────────
  const foundVerb = TASK_VERBS.find(v => {
    const re = new RegExp(`(^|\\s)${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|\\b)`, 'i');
    return re.test(clean);
  });

  if (foundVerb) {
    // Check if it's a PURE capability question, not a command that also asks for opinion
    // e.g. "what do you think" at the end is NOT a capability question — it's still a task
    const isCapabilityQuestion =
      /\b(can you|kya tum|kya aap|do you|are you able|tumhare paas)\b/i.test(clean) &&
      // Only block if there's NO creative/build intent — pure questioning
      !/\b(create|build|make|write|bana|banao|generate|develop|design|implement|skill|tool|agent)\b/i.test(clean);

    if (isCapabilityQuestion) {
      return _cls('conversation', 0.85, 'capability question, not a command', false, false);
    }

    return _cls('analyze', 0.92, `task verb detected: "${foundVerb}"`, true, false);
  }

  // ── 4. Technical or domain keywords → analyze ─────────────────────────────
  const DOMAIN_SIGNALS = [
    'instagram', 'twitter', 'discord', 'social media', 'platform',
    'agent', 'skill', 'tool', 'automation', 'bot',
    'image', 'photo', 'video', 'caption', 'hashtag',
    'campaign', 'schedule', 'cron', 'task', 'workflow',
    'logic', 'speed', 'performance', 'architecture', 'upgrade',
    'improve', 'fix', 'change', 'suggestion'
  ];

  const hasDomain = DOMAIN_SIGNALS.some(d => clean.includes(d));
  if (hasDomain && wordCount >= 4) {
    return _cls('analyze', 0.82, 'domain keyword in substantive message', true, false);
  }

  // ── 5. Question about existing work → conversation ─────────────────────────
  const isQuestion = /\?$/.test(clean.trim()) ||
    /^(what|why|how|when|where|who|which|explain|tell me|kya|kyun|kaise|kab|kaun|batao)\b/i.test(clean);
  if (isQuestion && !hasDomain && wordCount < 8) {
    return _cls('conversation', 0.83, 'short question without domain context', false, false);
  }

  // ── 6. Long descriptive message → likely task ─────────────────────────────
  if (wordCount >= 8) {
    return _cls('analyze', 0.75, 'long message likely contains a task', true, false);
  }

  // ── 7. Default: stay in conversation ──────────────────────────────────────
  return _cls('conversation', 0.72, 'no strong signal detected', false, false);
}

function _cls(
  intent: JennyMode,
  confidence: number,
  reason: string,
  is_task: boolean,
  ambiguity: boolean,
): IntentClassification {
  return {
    intent_type: intent,
    confidence,
    reason,
    target: '',
    requires_tools: is_task,
    requires_approval: intent === 'confirmation',
    is_task,
    ambiguity,
  };
}

// ── Resolve desired next mode ─────────────────────────────────────────────────
export function resolveNextMode(
  cls: IntentClassification,
  hasPendingPlan: boolean,
  hasPendingApproval: boolean,
  hasPendingAnalysis: boolean,
): JennyMode {
  const CONF = 0.70;

  if (cls.ambiguity || cls.confidence < CONF) {
    console.log(`[ModeManager] Low confidence (${cls.confidence}) or ambiguous — staying in ${currentMode}`);
    return currentMode;
  }

  // Task from conversation → always analyze first
  // Exception: if the message is long and conceptual (no specific platform/tool signal),
  // skip analyze and go straight to planning (collaborative mode)
  if (cls.is_task && currentMode === 'conversation') {
    const msg = cls.reason.toLowerCase();
    const hasConceptualSignal = (
      cls.confidence <= 0.80 || // lower confidence = more conceptual
      msg.includes('long message') ||
      msg.includes('domain keyword')
    );
    if (hasConceptualSignal) {
      console.log('[ModeManager] Conceptual task detected — routing directly to planning');
      return 'planning';
    }
    return 'analyze';
  }

  // 🔥 STICKY PLANNING MODE
  // If we are already in planning mode, ALWAYS stay in planning mode!
  // The only ways out of planning are:
  // 1. User says "abort" (handled in orchestrator Step 2)
  // 2. Plan finalizes and auto-advances to confirmation (handled in orchestrator Step 7)
  if (currentMode === 'planning') {
    return 'planning';
  }

  // Has pending work → push toward confirmation
  if (cls.is_task && currentMode === 'analyze' && (hasPendingPlan || hasPendingAnalysis)) {
    return 'confirmation';
  }

  // Confirmation requires something pending
  if (cls.intent_type === 'confirmation' && !hasPendingPlan && !hasPendingAnalysis && !hasPendingApproval) {
    return currentMode;
  }

  // Never let classifier set execution
  if (cls.intent_type === 'execution') return currentMode;

  return cls.intent_type;
}
