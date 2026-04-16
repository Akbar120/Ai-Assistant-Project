import { NextRequest, NextResponse } from 'next/server';
import { clearChatHistory, readChatHistory, writeChatHistory } from '@/lib/chatHistory';
import type { ChatMessage } from '@/lib/chat-types';

export const runtime = 'nodejs';

export async function GET() {
  const messages = await readChatHistory();
  return NextResponse.json({ messages });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as { messages?: ChatMessage[] };
  const messages = body.messages ?? [];
  await writeChatHistory(messages);
  return NextResponse.json({ ok: true, messages });
}

export async function DELETE() {
  await clearChatHistory();
  return NextResponse.json({ ok: true, messages: [] });
}
