import cron from 'node-cron';
import { createPocketBase } from './pocketbase';
import { sendDiscordMessage } from './discord-bot';
import { postToTwitter, postToInstagram } from './automation';
import path from 'path';

let schedulerInitialized = false;

export function initScheduler() {
  if (schedulerInitialized) return;
  schedulerInitialized = true;

  console.log('[Scheduler] Starting scheduler — checking every minute');

  cron.schedule('* * * * *', async () => {
    const pb = createPocketBase();

    try {
      const now = new Date().toISOString();
      const records = await pb.collection('scheduled_posts').getList(1, 50, {
        filter: `status = "pending" && scheduled_at <= "${now}"`,
      });

      if (records.items.length === 0) return;

      console.log(`[Scheduler] Found ${records.items.length} due posts`);

      for (const post of records.items) {
        await processScheduledPost(pb, post);
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  });
}

async function processScheduledPost(pb: ReturnType<typeof createPocketBase>, post: Record<string, unknown>) {
  try {
    // Mark as processing
    await pb.collection('scheduled_posts').update(post.id as string, { status: 'processing' });

    const platforms = (post.platforms as string[]) || [];
    const caption = post.caption as string || '';
    const mediaFiles = (post.media_files as string[]) || [];
    const results: Record<string, boolean> = {};

    for (const platform of platforms) {
      if (platform === 'discord') {
        const config = post.discord_config as { token: string; channels: string[] } | undefined;
        if (config?.token && config?.channels) {
          for (const channelId of config.channels) {
            const res = await sendDiscordMessage(config.token, channelId, caption, mediaFiles);
            results.discord = res.success;
          }
        }
      }

      if (platform === 'twitter') {
        const res = await postToTwitter({ text: caption, mediaFiles });
        results.twitter = res.success;
      }

      if (platform === 'instagram') {
        if (mediaFiles.length > 0) {
          const res = await postToInstagram({
            caption,
            mediaFile: path.join(process.cwd(), 'uploads', mediaFiles[0]),
            type: 'feed',
          });
          results.instagram = res.success;
        }
      }
    }

    const allSuccess = Object.values(results).every(Boolean);
    await pb.collection('scheduled_posts').update(post.id as string, {
      status: allSuccess ? 'posted' : 'partial',
      results: JSON.stringify(results),
      posted_at: new Date().toISOString(),
    });

    console.log(`[Scheduler] Post ${post.id} processed:`, results);
  } catch (err) {
    console.error(`[Scheduler] Failed to process post ${post.id}:`, err);
    await pb.collection('scheduled_posts').update(post.id as string, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
