import { NextRequest, NextResponse } from 'next/server';
import { validateDiscordToken, fetchGuilds, getBotInviteUrl } from '@/lib/discord-bot';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const CONFIG_PATH = path.join(process.cwd(), 'sessions', 'discord-config.json');

// GET — fetch saved config
export async function GET() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return NextResponse.json({ configured: false });
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return NextResponse.json({ configured: true, botName: cfg.botName, clientId: cfg.clientId });
  } catch {
    return NextResponse.json({ configured: false });
  }
}

// POST — save bot token and validate
export async function POST(req: NextRequest) {
  const { token, clientId } = await req.json();

  if (!token) {
    return NextResponse.json({ error: 'Bot token is required' }, { status: 400 });
  }

  // Validate the token
  const validation = await validateDiscordToken(token);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error || 'Invalid bot token' }, { status: 400 });
  }

  // Save config
  const config = { token, clientId: clientId || '', botName: validation.botName };
  if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  // Fetch initial guilds
  let guilds: { id: string; name: string; icon: string | null }[] = [];
  try {
    guilds = await fetchGuilds(token);
  } catch {}

  const inviteUrl = clientId ? getBotInviteUrl(clientId) : null;

  return NextResponse.json({
    success: true,
    botName: validation.botName,
    guilds,
    inviteUrl,
  });
}

// DELETE — remove discord config
export async function DELETE() {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  return NextResponse.json({ success: true });
}
