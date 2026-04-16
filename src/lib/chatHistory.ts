import fs from 'fs/promises';
import path from 'path';
import type { ChatMessage } from '@/lib/chat-types';

const CHAT_DIR = path.join(process.cwd(), 'src/data/chat');
const CHAT_HISTORY_FILE = path.join(CHAT_DIR, 'history.json');

async function ensureChatDir() {
  await fs.mkdir(CHAT_DIR, { recursive: true });
}

export async function readChatHistory(): Promise<ChatMessage[]> {
  await ensureChatDir();

  try {
    const raw = await fs.readFile(CHAT_HISTORY_FILE, 'utf-8');
    const messages = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

export async function writeChatHistory(messages: ChatMessage[]) {
  await ensureChatDir();
  await fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(messages, null, 2), 'utf-8');
}

export async function appendChatMessages(incoming: ChatMessage[]) {
  const history = await readChatHistory();
  const seen = new Set(history.map((message) => message.id));
  const next = [...history];

  for (const message of incoming) {
    if (!message?.id || seen.has(message.id)) continue;
    
    // Auto-generate hash if missing (Fix 2)
    if (!message.hash) {
      message.hash = (message.content || '').trim();
    }

    next.push(message);
    seen.add(message.id);
  }

  await writeChatHistory(next);
  return next;
}

export async function clearChatHistory() {
  await writeChatHistory([]);
}

export async function getLatestChatMessages(afterId?: string | null) {
  const history = await readChatHistory();

  if (!afterId) {
    return history.slice(-20);
  }

  const index = history.findIndex((message) => message.id === afterId);
  if (index === -1) {
    return history.slice(-20);
  }

  return history.slice(index + 1);
}
