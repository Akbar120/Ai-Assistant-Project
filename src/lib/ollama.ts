// Ollama client — optimized for low-latency voice responses
// Defaults to http://localhost:11434

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
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
  // Speed-tuned generation params
  num_predict?: number; // max tokens to generate
  top_k?: number;       // reduces sampling space
  top_p?: number;
  repeat_penalty?: number;
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
        temperature: options.temperature ?? 0.3,
        // Speed optimizations — keeps JSON responses short and fast
        num_predict: options.num_predict ?? 512,
        top_k: options.top_k ?? 20,        // smaller = faster sampling
        top_p: options.top_p ?? 0.85,
        repeat_penalty: options.repeat_penalty ?? 1.1,
        // Disable mirostat for speed
        mirostat: 0,
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
 * Stream Ollama response — yields text chunks as they arrive.
 * Used for sentence-level TTS pipelining.
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
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.num_predict ?? 512,
        top_k: options.top_k ?? 20,
        top_p: options.top_p ?? 0.85,
        repeat_penalty: options.repeat_penalty ?? 1.1,
        mirostat: 0,
      },
    }),
  });

  if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);

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
      } catch {}
    }
  }
}

/**
 * Stream chat and collect full text, calling onChunk for each token.
 * Fires onSentence when a complete sentence boundary is detected.
 * This enables TTS to start speaking the first sentence while the
 * model is still generating the rest.
 */
export async function ollamaChatWithSentenceCallback(
  options: OllamaChatOptions,
  onSentence: (sentence: string, isFirst: boolean) => void
): Promise<string> {
  const SENTENCE_END = /[.!?।\n]/;
  let buffer = '';
  let fullText = '';
  let sentenceCount = 0;

  for await (const chunk of ollamaChatStream(options)) {
    buffer += chunk;
    fullText += chunk;

    // Look for sentence boundaries
    let lastBoundary = -1;
    for (let i = 0; i < buffer.length; i++) {
      if (SENTENCE_END.test(buffer[i])) {
        // Don't split on decimal numbers (2.5) or abbreviations
        const nextChar = buffer[i + 1];
        if (buffer[i] === '.' && nextChar && /\d/.test(nextChar)) continue;
        lastBoundary = i;
      }
    }

    if (lastBoundary > 0) {
      const sentence = buffer.slice(0, lastBoundary + 1).trim();
      buffer = buffer.slice(lastBoundary + 1);

      if (sentence.length > 3) {
        onSentence(sentence, sentenceCount === 0);
        sentenceCount++;
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim().length > 3) {
    onSentence(buffer.trim(), sentenceCount === 0);
  }

  return fullText;
}

export async function checkOllamaStatus(): Promise<{ running: boolean; models: string[] }> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return { running: false, models: [] };
    const data = await resp.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

export async function pullOllamaModel(model: string): Promise<void> {
  await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
  });
}

export const SYSTEM_PROMPT = `You are Jenny, an intelligent Hinglish AI assistant. Keep replies SHORT (2-3 sentences) for voice. Always respond ONLY with valid JSON.`;
