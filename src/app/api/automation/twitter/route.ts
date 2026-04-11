import { NextRequest, NextResponse } from 'next/server';
import { twitterLogin, postToTwitter, clearSession, hasTwitterSession } from '@/lib/automation';

export const runtime = 'nodejs';

// GET — check session status
export async function GET() {
  return NextResponse.json({ connected: hasTwitterSession() });
}

// POST — login or post
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'login') {
    const result = await twitterLogin();
    return NextResponse.json(result);
  }

  if (action === 'post') {
    const { text, mediaFiles } = body;
    const result = await postToTwitter({ text, mediaFiles });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// DELETE — disconnect
export async function DELETE() {
  clearSession('twitter');
  return NextResponse.json({ success: true });
}
