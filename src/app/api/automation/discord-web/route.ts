import { NextRequest, NextResponse } from 'next/server';
import { discordLogin, clearSession, hasDiscordSession } from '@/lib/automation';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ connected: hasDiscordSession() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'login') {
    const result = await discordLogin();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function DELETE() {
  clearSession('discord');
  return NextResponse.json({ success: true });
}
