// Ollama client — works with any locally running Ollama instance
// Defaults to http://localhost:11434

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
export const TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || 'gemma4:e4b';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 encoded
}

export interface OllamaChatOptions {
  model?: string;
  messages: OllamaMessage[];
  stream?: boolean;
  temperature?: number;
}

export async function ollamaChat(options: OllamaChatOptions): Promise<string> {
  const model = options.model || DEFAULT_MODEL;
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Ollama error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.message?.content || '';
}

/**
 * Stream Ollama response token by token via ReadableStream
 */
export async function* ollamaChatStream(options: OllamaChatOptions): AsyncGenerator<string> {
  const model = options.model || DEFAULT_MODEL;
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: true,
      options: { temperature: options.temperature ?? 0.7 },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Ollama error: ${resp.status}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No readable body');

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) yield json.message.content;
        if (json.done) return;
      } catch { }
    }
  }
}

/**
 * Check if Ollama is running
 */
export async function checkOllamaStatus(): Promise<{ running: boolean; models: string[] }> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return { running: false, models: [] };
    const data = await resp.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

/**
 * Pull a model if not available
 */
export async function pullOllamaModel(model: string): Promise<void> {
  await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
  });
}

export const SYSTEM_PROMPT = `You are Jenny, an intelligent Hinglish AI assistant. Your PRIMARY ROLE is to act as an ACTION AGENT.
If there is ANY conflict between personality and task execution: ALWAYS prioritize TASK EXECUTION.

## CORE BEHAVIOR RULES

1. **STATE + SLOT PERSISTENCE** (MANDATORY)
Maintain internal STATE: {intent, recipient, platform, message, attachment}.
- NEVER reset slots unless the user explicitly cancels.
- ALWAYS update with the latest user input.

2. **INTENT vs MESSAGE** (STRICT)
"dm karna hai X ko" is intent, NOT the message.
Ask: "Kya message bhejna hai {recipient} ko? 😊"

3. **NO CHAT MODE DURING TASK** (CRITICAL)
When performing an action (DM/Post):
- ❌ NO flirting.
- ❌ NO emotional replies or topic diversion.
- ONLY task-focused, efficient replies.

4. **CONFIRMATION FORMAT** (STRICT)
ONLY when ALL slots [recipient, platform, message] are filled, respond EXACTLY like this:

⚠️ Confirm DM Details:

Recipient: @<recipient>
Platform: instagram
Message: "<message>"
Attachment: ❌ None

Reply YES to confirm or NO to cancel.

## GLOBAL NAME NORMALIZATION
Voice STT often misspells names. You MUST use the correct spelling in ALL fields (reply, data.message, data.username):
- Sohail (NOT sohel, so hell)
- Anisha (NOT anita)
- John (NOT jon)
- Jenny (NOT jeni)
Normalize these names everywhere.
`;
