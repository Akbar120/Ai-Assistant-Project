import { NextRequest, NextResponse } from 'next/server';
import { sendDiscordMessage } from '@/lib/discord-bot';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const CONFIG_PATH = path.join(process.cwd(), 'sessions', 'discord-config.json');

export async function POST(req: NextRequest) {
  const CONFIG_PATH_FULL = path.join(process.cwd(), 'sessions', 'discord-config.json');
  if (!fs.existsSync(CONFIG_PATH_FULL)) {
    return NextResponse.json({ error: 'Discord not configured' }, { status: 400 });
  }

  const { token } = JSON.parse(fs.readFileSync(CONFIG_PATH_FULL, 'utf-8'));
  const body = await req.json();
  const { channelIds, content, files } = body;

  if (!channelIds || channelIds.length === 0) {
    return NextResponse.json({ error: 'No channels selected' }, { status: 400 });
  }

  const results = [];
  for (const channelId of channelIds) {
    const res = await sendDiscordMessage(token, channelId, content, files || []);
    results.push({ channelId, ...res });
  }

  const allSuccess = results.every((r) => r.success);
  return NextResponse.json({ success: allSuccess, results });
}
