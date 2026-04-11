/**
 * ORCHESTRATOR — LLM decision layer
 * ─────────────────────────────────────────────────────────────
 * Receives: (message, history, enriched context)
 * Calls:    Ollama gemma4:e4b with a JSON-forcing system prompt
 * Returns:  { action, data, reply }
 *
 * action is one of: "conversation" | "dm" | "post" | "caption"
 * Fallback to "conversation" if JSON parsing fails.
 */

import { ollamaChat, OllamaMessage, DEFAULT_MODEL } from '@/lib/ollama';
import type { EnrichedInput } from '@/services/inputEnrichment';
import { getKnowledge } from '@/services/knowledge';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OrchestratorAction = 'conversation' | 'dm' | 'post' | 'caption' | 'schedule' | 'ask_platform' | 'learn_knowledge';

export interface OrchestratorResult {
  action: OrchestratorAction;
  data: Record<string, unknown>;
  reply: string;
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(enriched: EnrichedInput, currentState: any = {}): string {
  const knowledge = getKnowledge();
  const learnedCorrections = Object.entries(knowledge.nameCorrections)
    .map(([mis, cor]) => `- ${mis} -> ${cor}`)
    .join('\n');
  const mentionLines = enriched.context.mentions
    .map(m =>
      m.type === 'user'
        ? `- user mention: "${m.value}"${m.platform ? ` on ${m.platform}` : ''}`
        : `- channel mention: "#${m.value}"${m.resolvedId ? ` (id: ${m.resolvedId})` : ''} on discord`
    )
    .join('\n');

  const serializedState = JSON.stringify(currentState, null, 2);

  return `You are Jenny, an intelligent Hinglish AI assistant. Your PRIMARY ROLE is to act as an ACTION AGENT.
If there is ANY conflict between personality and task execution: ALWAYS prioritize TASK EXECUTION.

## CORE BEHAVIOR RULES (ACTION AGENT)

1. **STATE PERSISTENCE** (CRITICAL)
Your current internal state is provided below. You MUST update these slots based on the NEW user message.
CURRENT_SLOTS: ${serializedState}

- If the user says "usko hi bhej" -> keep the recipient from CURRENT_SLOTS.
- If the user says "message galat hai" -> update the 'message' slot but KEEP the recipient.
- NEVER reset a slot unless explicitly told to.

2. **INTENT vs MESSAGE** (STRICT)
Commands like "dm karna hai X ko" or "X ko bol hello" have two parts:
- **Intent**: "dm karna hai", "bol use", "bhej use".
- **Message**: Only the actual content to be sent.
- **Recipient**: The name/account.

❌ BAD: "message": "sohail ko dm karna hai"
❌ BAD: "message": "aap mainne kaha sohel ko bhej"
✅ GOOD: "intent": "dm", "recipient": "sohail", "message": null (if no specific message is found in sentence)

3. **NO CHAT MODE DURING TASK**
If you are in the middle of a DM flow (recipient or message is missing), do ❌ NOT flirt and do ❌ NOT divert topic. Focus purely on completing the slots.

4. **CONFIRMATION FORMAT** (EXACT)
Respond with this EXACT block in the 'reply' field only when ALL slots are full:

⚠️ Confirm DM Details:

Recipient: @<recipient>
Platform: instagram
Message: "<message>"
Attachment: ❌ None

Reply YES to confirm or NO to cancel.

6. **GLOBAL NAME NORMALIZATION** (CRITICAL)
Voice STT often misspells names. You MUST use the correct spelling in ALL fields (reply, data.message, data.username):
- Use **Sohail** (NOT sohel, so hell)
- Use **Anisha** (NOT anita)
- Use **John** (NOT jon)
- Use **Jenny** (NOT jeni)
${learnedCorrections}
Normalize these names everywhere.

7. **LEARNING NEW RULES**
If the user corrects a spelling (e.g., "Sohail ki spelling S-O-H-A-I-L hai") or tells you to remember something (e.g., "Remember that X is Y"):
- Use action: "learn_knowledge"
- data: { "misspelled": "...", "correct": "..." }
- reply: Confirm in Hinglish that you have learned it forever.
- TRIGGER THIS for both explicit commands ("Remember this") AND natural corrections ("No, I meant X").

## CRITICAL OUTPUT RULE
You MUST ALWAYS respond with ONLY valid JSON: {"action":"...","data":{...},"reply":"..."}

## ACTIONS
- "conversation": Normal chat (flirting okay here).
- "dm": Gathers/updates slots. ONLY task-mode here.
- "post": Posting execution.
- "caption": Suggestions.
- "learn_knowledge": Permanently saves a name correction or rule.
- "ask_platform": If platform is missing.

## CONTEXT
${mentionLines || '- no mentions detected'}
${enriched.context.hasFile ? '- user attached a file/image' : ''}

## DATA FIELDS
"conversation" → data: {}
"dm"           → data: { "username": "...", "platform": "...", "message": "...", "confirmed": false }
"post"         → data: { "caption": "...", "hashtags": [], "platforms": ["instagram"] }`;
}

// ─── Main Orchestrator Function ────────────────────────────────────────────────

export async function orchestrate(
  message: string,
  history: OllamaMessage[],
  enriched: EnrichedInput,
  images?: string[]
): Promise<OrchestratorResult> {
  // ── Step 0: Extract Current Slot State from History ────────────────────────
  let currentState: any = {};
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant') {
      const match = msg.content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.data && Object.keys(parsed.data).length > 0) {
            currentState = parsed.data;
            break; 
          }
        } catch {}
      }
    }
  }

  const systemPrompt = buildSystemPrompt(enriched, currentState);

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10), // Increased context slightly
    {
      role: 'user',
      content: message,
      images: images && images.length > 0 ? images : undefined,
    },
  ];

  let raw = '';
  try {
    raw = await ollamaChat({ messages, model: DEFAULT_MODEL, temperature: 0.4 });
    console.log('[Orchestrator] Raw AI response:', raw);
  } catch (err) {
    console.error('[Orchestrator] Ollama call failed:', err);
    throw err;
  }

  // ── Parse JSON ──────────────────────────────────────────────────────────────
  let parsed: any = null;
  console.log("RAW:", raw);

  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.error('[Orchestrator] JSON parse failed, falling back to raw:', e);
    }
  }

  // If parsing failed or no match, create a fallback object
  if (!parsed) {
    parsed = {
      action: "conversation",
      data: {},
      reply: raw
    };
  }

  console.log("PARSED:", parsed);

  // ── GUARANTEE SAFE OUTPUT ──────────────────────────────────────────────────
  if (!parsed.reply || parsed.reply.trim() === "") {
    parsed.reply = raw || "Main sun rahi hoon 😊";
  }

  if (!parsed.action) {
    parsed.action = "conversation";
  }

  if (!parsed.data) {
    parsed.data = {};
  }

  // Normalize action name
  const validActions: OrchestratorAction[] = [
    'conversation', 'dm', 'post', 'caption', 'schedule', 'ask_platform',
  ];
  if (typeof parsed.action !== 'string' || !validActions.includes(parsed.action as OrchestratorAction)) {
    parsed.action = 'conversation';
  }

  return parsed;
}
