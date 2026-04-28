// Ollama client — optimized for low-latency voice responses
// Defaults to http://localhost:11434

const OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'gemma4:e4b';
export const TEXT_MODEL = 'gemma4:e4b';
export const VISION_MODEL = 'gemma4:e4b';

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
        num_predict: options.num_predict ?? 512,
        top_k: options.top_k ?? 20,
        top_p: options.top_p ?? 0.85,
        repeat_penalty: options.repeat_penalty ?? 1.1,
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

export async function ollamaChatWithSentenceCallback(
  options: OllamaChatOptions,
  onSentence: (sentence: string, isFirst: boolean, isThought?: boolean) => void
): Promise<string> {
  const SENTENCE_END = /[.!?।\n]/;
  let buffer = '';
  let fullText = '';
  let sentenceCount = 0;
  let isJsonMode = false;
  let inThinkMode = false; // 🔥 STATEFUL TRACKER
  for await (const chunk of ollamaChatStream(options)) {
    buffer += chunk;
    fullText += chunk;

    // 1. Update thinking state — Robust check for fragmented tags
    const lastThink = fullText.lastIndexOf('<think>');
    const lastEndThink = fullText.lastIndexOf('</think>');
    inThinkMode = lastThink !== -1 && lastThink > lastEndThink;
    
    // 2. FAST STREAM FOR THOUGHTS: Bypass sentence buffering for reasoning blocks
    if (inThinkMode || chunk.includes('<think>') || chunk.includes('</think>')) {
      onSentence(chunk, sentenceCount === 0, true);
      sentenceCount++;
      buffer = '';
      continue;
    }

    // Detect if LLM is outputting JSON tool call instead of conversation
    if (!isJsonMode && (fullText.trimStart().startsWith('{') || fullText.trimStart().startsWith('```json') || fullText.trimStart().startsWith('`json'))) {
      isJsonMode = true;
    }

    if (isJsonMode) continue;

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
        onSentence(sentence, sentenceCount === 0, inThinkMode);
        sentenceCount++;
      }
    }
  }

  // Flush remaining buffer if not json
  if (!isJsonMode && buffer.trim().length > 3) {
    onSentence(buffer.trim(), sentenceCount === 0, inThinkMode);
  }

  return fullText;
}

export async function checkOllamaStatus(): Promise<{ running: boolean; models: string[]; error?: string }> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, {
      cache: 'no-store'
    });
    if (!resp.ok) {
       return { running: false, models: [], error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    return { running: true, models };
  } catch (err: any) {
    return { running: false, models: [], error: err.message };
  }
}
