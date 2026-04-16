import { NextRequest, NextResponse } from 'next/server';
import { getLatestChatMessages } from '@/lib/chatHistory';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const afterId = request.nextUrl.searchParams.get('after');
  const messages = await getLatestChatMessages(afterId);
  return NextResponse.json({ messages });
}
