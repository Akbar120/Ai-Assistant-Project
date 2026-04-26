import fs from 'fs';
import path from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
const MODEL_FILE = path.join(process.cwd(), 'src', 'data', 'active_model.json');

export function getActiveModel(): string {
  try {
    const data = fs.readFileSync(MODEL_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return (parsed?.model && typeof parsed.model === 'string') ? parsed.model : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setActiveModel(model: string): void {
  try {
    const dir = path.dirname(MODEL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MODEL_FILE, JSON.stringify({ model }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Ollama] Failed to persist active model:', err);
  }
}
