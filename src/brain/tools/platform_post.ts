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
    const fd = new FormData();
    fd.append('caption', caption);
    fd.append('platforms', JSON.stringify(platforms));
    fd.append('discordConfig', JSON.stringify(null));
    if (schedule) fd.append('schedule', schedule);

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
