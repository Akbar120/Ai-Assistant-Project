import { NextRequest, NextResponse } from 'next/server';
import { checkOllamaStatus } from '@/lib/ollama';
import { hasTwitterSession, hasInstagramSession } from '@/lib/automation';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  const ollama = await checkOllamaStatus();

  const twitterConnected = hasTwitterSession();
  const instagramConnected = hasInstagramSession();

  // Read discord config from env or persisted file
  const discordConfigPath = path.join(process.cwd(), 'sessions', 'discord-config.json');
  let discordConnected = false;
  let discordBotName = null;
  if (fs.existsSync(discordConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(discordConfigPath, 'utf-8'));
      discordConnected = !!cfg.token;
      discordBotName = cfg.botName;
    } catch {}
  }

  return NextResponse.json({
    ollama,
    platforms: {
      discord: { connected: discordConnected, botName: discordBotName },
      twitter: { connected: twitterConnected },
      instagram: { connected: instagramConnected },
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Can be used to update settings
  return NextResponse.json({ ok: true });
}
