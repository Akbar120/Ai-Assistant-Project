import { NextRequest, NextResponse } from 'next/server';
import { sendDiscordMessage } from '@/lib/discord-bot';
import { postToTwitter } from '@/lib/automation';
import { postToInstagram } from '@/lib/automation';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

const DISCORD_CONFIG_PATH = path.join(process.cwd(), 'sessions', 'discord-config.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const caption = formData.get('caption') as string;
  const platforms = JSON.parse(formData.get('platforms') as string || '[]');
  const discordConfig = JSON.parse(formData.get('discordConfig') as string || 'null');
  const files: File[] = [];
  const savedFilePaths: string[] = [];

  // Save uploaded files
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('file_') && value instanceof File) {
      files.push(value);
      const filename = `${uuidv4()}-${value.name}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const bytes = await value.arrayBuffer();
      fs.writeFileSync(filepath, Buffer.from(bytes));
      savedFilePaths.push(filepath);
    }
  }

  const results: Record<string, { success: boolean; error?: string }> = {};

  // Post to Discord
  if (platforms.includes('discord')) {
    if (!fs.existsSync(DISCORD_CONFIG_PATH)) {
      results.discord = { success: false, error: 'Discord not configured' };
    } else {
      const cfg = JSON.parse(fs.readFileSync(DISCORD_CONFIG_PATH, 'utf-8'));
      const channels = discordConfig?.channels || [];

      if (channels.length === 0) {
        results.discord = { success: false, error: 'No Discord channels selected' };
      } else {
        let allSuccess = true;
        for (const channelId of channels) {
          const res = await sendDiscordMessage(cfg.token, channelId, caption, savedFilePaths);
          if (!res.success) allSuccess = false;
        }
        results.discord = { success: allSuccess };
      }
    }
  }

  // Post to Twitter/X
  if (platforms.includes('twitter')) {
    const res = await postToTwitter({ text: caption, mediaFiles: savedFilePaths });
    results.twitter = { success: res.success, error: res.error };
  }

  // Post to Instagram
  if (platforms.includes('instagram')) {
    if (savedFilePaths.length === 0) {
      results.instagram = { success: false, error: 'Instagram requires at least one image or video' };
    } else {
      const res = await postToInstagram({ caption, mediaFile: savedFilePaths[0], type: 'feed' });
      results.instagram = { success: res.success, error: res.error };
    }
  }

  const anySuccess = Object.values(results).some((r) => r.success);
  return NextResponse.json({ success: anySuccess, results });
}
