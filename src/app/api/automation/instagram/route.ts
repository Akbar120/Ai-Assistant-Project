import { NextRequest, NextResponse } from 'next/server';
import { instagramLogin, postToInstagram, clearSession, hasInstagramSession } from '@/lib/automation';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ connected: hasInstagramSession() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'login') {
    const result = await instagramLogin();
    return NextResponse.json(result);
  }

  if (action === 'post') {
    const { caption, mediaFile, type = 'feed' } = body;
    const result = await postToInstagram({ caption, mediaFile, type });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function DELETE() {
  clearSession('instagram');
  return NextResponse.json({ success: true });
}
