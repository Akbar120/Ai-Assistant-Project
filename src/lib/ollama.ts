// Ollama client — optimized for low-latency voice responses
// Defaults to http://localhost:11434

import fs from 'fs';
import path from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
export const TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || 'gemma4:e4b';

// ── Persistent Model Selection (file-based, survives serverless restarts) ──────
const MODEL_FILE = path.join(process.cwd(), 'src', 'data', 'active_model.json');

/**
 * Always reads from disk — no in-memory state.
 * Safe across Next.js serverless restarts, hot reloads, and concurrent requests.
 */
export function getActiveModel(): string {
  try {
    const data = fs.readFileSync(MODEL_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return (parsed?.model && typeof parsed.model === 'string') ? parsed.model : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

/**
 * Persists model selection to disk.
 */
export function setActiveModel(model: string): void {
  try {
    const dir = path.dirname(MODEL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MODEL_FILE, JSON.stringify({ model }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Ollama] Failed to persist active model:', err);
  }
}

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

export async function ollamaChatWithSentenceCallback(
  options: OllamaChatOptions,
  onSentence: (sentence: string, isFirst: boolean) => void
): Promise<string> {
  const SENTENCE_END = /[.!?।\n]/;
  let buffer = '';
  let fullText = '';
  let sentenceCount = 0;
  let isJsonMode = false;

  for await (const chunk of ollamaChatStream(options)) {
    buffer += chunk;
    fullText += chunk;
    
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
        onSentence(sentence, sentenceCount === 0);
        sentenceCount++;
      }
    }
  }

  // Flush remaining buffer if not json
  if (!isJsonMode && buffer.trim().length > 3) {
    onSentence(buffer.trim(), sentenceCount === 0);
  }

  return fullText;
}

export async function checkOllamaStatus(): Promise<{ running: boolean; models: string[]; error?: string }> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store' // Ensure we don't get cached "Off" state
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

export async function pullOllamaModel(model: string): Promise<void> {
  await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
  });
}

export const SYSTEM_PROMPT = `You are Jenny, an intelligent Hinglish AI assistant. Keep replies SHORT (2-3 sentences) for voice. Always respond ONLY with valid JSON.`;
