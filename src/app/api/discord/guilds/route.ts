import { NextRequest, NextResponse } from 'next/server';
import { fetchGuilds, fetchChannels } from '@/lib/discord-bot';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const CONFIG_PATH = path.join(process.cwd(), 'sessions', 'discord-config.json');

function getToken(): string | null {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return cfg.token || null;
  } catch { return null; }
}

// GET /api/discord/guilds — fetch all guilds
export async function GET(req: NextRequest) {
  const token = getToken();
  if (!token) {
    return NextResponse.json({ error: 'Discord not configured' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const guildId = searchParams.get('guildId');

  if (guildId) {
    // Fetch channels for specific guild
    const channels = await fetchChannels(token, guildId);
    return NextResponse.json({ channels });
  }

  const guilds = await fetchGuilds(token);
  return NextResponse.json({ guilds });
}
