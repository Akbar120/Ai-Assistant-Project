/**
 * TOOL: platform_post
 * Handles publishing content to Instagram, Twitter, and Discord.
 */

export interface PostArgs {
  caption: string;
  platforms: string[];
  schedule?: string | null;
}

export async function execute_platform_post(args: PostArgs): Promise<{ success: boolean; reply: string; data?: any; error?: string }> {
  const { caption, platforms, schedule } = args;

  try {
    if (schedule) {
      // Route to Schedule API
      const res = await fetch('http://localhost:3000/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          platforms,
          scheduled_at: schedule,
          // Media not yet fully handled by scheduler without uploads, but for text it works
        }),
      });
      const data = await res.json();
      if (data.success) {
        return {
          success: true,
          reply: `🕐 Post scheduled for ${schedule} on ${platforms.join(', ')}!`,
          data: data.post
        };
      } else {
        return { success: false, reply: `❌ Failed to schedule post.` };
      }
    }

    const fd = new FormData();
    fd.append('caption', caption);
    fd.append('platforms', JSON.stringify(platforms));
    fd.append('discordConfig', JSON.stringify(null));

    const res = await fetch('http://localhost:3000/api/post', {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();
    
    if (data.success) {
      return {
        success: true,
        reply: `🚀 Post published to ${platforms.join(', ')}!`,
        data: data.results
      };
    } else {
      return {
        success: false,
        reply: `❌ Posting failed.`,
        error: data.error,
        data: data.results
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, reply: `❌ System error: ${error}`, error };
  }
}
