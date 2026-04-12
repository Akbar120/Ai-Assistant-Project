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

export type OrchestratorAction = 'conversation' | 'dm' | 'post' | 'caption' | 'schedule' | 'ask_platform' | 'learn_knowledge';

export interface OrchestratorResult {
  action: OrchestratorAction;
  data: Record<string, unknown>;
  reply: string;
}

// ── Compact system prompt — fewer tokens = faster TTFT ─────────────────────
function buildSystemPrompt(enriched: EnrichedInput, currentState: any = {}): string {
  const knowledge = getKnowledge();
  const corrections = Object.entries(knowledge.nameCorrections)
    .map(([m, c]) => `${m}->${c}`)
    .join(', ');

  const mentions = enriched.context.mentions
    .map(m => m.type === 'user'
      ? `@${m.value}${m.platform ? ` on ${m.platform}` : ''}`
      : `#${m.value}${m.resolvedId ? `(${m.resolvedId})` : ''} on discord`)
    .join(', ');

  // Only include non-empty state fields
  const stateStr = Object.keys(currentState).length > 0
    ? JSON.stringify(currentState)
    : '{}';

  return `You are Jenny, a Hinglish AI social media assistant. Always reply with ONLY valid JSON: {"action":"...","data":{...},"reply":"..."}

CURRENT_SLOTS: ${stateStr}
ACTIONS: conversation|dm|post|caption|schedule|ask_platform|learn_knowledge
${mentions ? `MENTIONS: ${mentions}` : ''}
${enriched.context.hasFile ? 'FILE: attached' : ''}
${corrections ? `NAME_FIXES: ${corrections}` : ''}

RULES:
- dm action: data={"username":"...","platform":"instagram|twitter|discord","message":"...","confirmed":false}
- post action: data={"caption":"...","platforms":["instagram"]}
- NEVER put intent as message (e.g. "dm karna hai X" → username=X, message=null)
- Keep CURRENT_SLOTS unless user explicitly changes them
- Normalize names: Sohail(not sohel), use NAME_FIXES above
- When all dm slots filled, reply field must contain confirmation block starting with "⚠️ Confirm DM"
- conversation action: be fun, flirty in Hinglish, SHORT replies (2-3 sentences max for voice)
- For voice/TTS: keep replies concise and natural-sounding`;
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
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

export async function orchestrate(
  message: string,
  history: OllamaMessage[],
  enriched: EnrichedInput,
  images?: string[]
): Promise<OrchestratorResult> {
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

  const systemPrompt = buildSystemPrompt(enriched, currentState);

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    // Reduced from 10 to 6 history messages — major latency win
    ...history.slice(-6),
    {
      role: 'user',
      content: message,
      images: images?.length ? images : undefined,
    },
  ];

  let raw = '';
  try {
    raw = await ollamaChat({
      messages,
      model: DEFAULT_MODEL,
      temperature: 0.3, // Lower = faster + more deterministic JSON
    });
  } catch (err) {
    console.error('[Orchestrator] Ollama call failed:', err);
    throw err;
  }

  // ── Parse JSON ──────────────────────────────────────────────────────────
  let parsed = extractJSON(raw);

  if (!parsed) {
    parsed = { action: 'conversation', data: {}, reply: raw.trim() };
  }

  // Guarantee safe output
  if (!parsed.reply?.trim()) parsed.reply = raw.trim() || 'Main sun rahi hoon 😊';
  if (!parsed.action) parsed.action = 'conversation';
  if (!parsed.data) parsed.data = {};

  const validActions: OrchestratorAction[] = [
    'conversation', 'dm', 'post', 'caption', 'schedule', 'ask_platform', 'learn_knowledge',
  ];
  if (!validActions.includes(parsed.action)) parsed.action = 'conversation';

  return parsed;
}
