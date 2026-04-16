import { NextRequest, NextResponse } from 'next/server';
import { appendChatMessages } from '@/lib/chatHistory';
import type { ChatMessage } from '@/lib/chat-types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { message?: ChatMessage; messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages = (body?.messages ?? (body?.message ? [body.message] : [])).filter(
    (m): m is ChatMessage => !!m && typeof m === 'object' && !!m.id && !!m.role
  );

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, messages: [] });
  }

  const history = await appendChatMessages(messages);
  return NextResponse.json({ ok: true, messages: history });
}
