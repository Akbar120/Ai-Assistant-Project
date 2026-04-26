/**
 * TOOL: instagram_dm
 * Handles sending messages to Instagram, Twitter, or Discord.
 */

export interface DMArgs {
  username: string;
  platform: 'instagram' | 'twitter' | 'discord';
  message: string;
  threadUrl?: string; // NEW optional field bypasses profile search
}

export async function execute_instagram_dm(args: DMArgs, agentId?: string): Promise<{ success: boolean; reply: string; error?: string }> {
  const { username, platform, message, threadUrl } = args;
  const cleanUsername = username.replace(/^@/, '').trim();

  try {
    const endpoint = platform === 'discord'
      ? 'http://localhost:3000/api/discord/post'
      : platform === 'instagram'
        ? 'http://localhost:3000/api/instagram/dm-send'
        : 'http://localhost:3000/api/twitter/dm-send';

    let body: any;
    const headers: any = {};

    if (platform === 'discord') {
      body = JSON.stringify({ channelIds: [cleanUsername], content: message, files: [] });
      headers['Content-Type'] = 'application/json';
    } else {
      const fd = new FormData();
      fd.append('username', cleanUsername);
      fd.append('message', message);
      if (threadUrl) fd.append('threadUrl', threadUrl);
      body = fd;
    }

    const res = await fetch(endpoint, { method: 'POST', body, headers });
    const data = await res.json();

    if (data.success) {
      return {
        success: true,
        reply: `✅ DM sent to **@${cleanUsername}** via ${platform}! 🎉`
      };
    } else {
      return {
        success: false,
        reply: `❌ DM failed: ${data.error || 'Unknown error'}`,
        error: data.error
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, reply: `❌ System error: ${error}`, error };
  }
}
