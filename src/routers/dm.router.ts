/**
 * DM ROUTER — Clean stateful confirmation flow
 * ─────────────────────────────────────────────
 * Flow:
 *  orchestrator → dm action with {username, platform, message}
 *  → if all slots filled: set pendingDm + return confirm card (no double check)
 *  → user says YES → executePendingDM()
 *  → result reply goes back through orchestrator reply channel
 */

export interface DmRouterInput {
  username: string;
  platform: 'instagram' | 'twitter' | 'discord';
  message: string;
  channelId?: string;
  hasFile?: boolean;
}

export interface DmRouterResult {
  status: 'clarify' | 'confirm' | 'error' | 'success';
  reply: string;
  data?: Partial<DmRouterInput>;
  error?: string;
}

// ─── Singleton state ─────────────────────────────────────────────────────────
let pendingDmStore: DmRouterInput | null = null;

/**
 * buildConfirmCard
 * Returns a clean human-readable confirmation card string for the chat UI.
 */
function buildConfirmCard(dm: DmRouterInput): string {
  return `⚠️ **Confirm DM**

📬 **To:** @${dm.username}
📱 **Platform:** ${dm.platform.charAt(0).toUpperCase() + dm.platform.slice(1)}
💬 **Message:** "${dm.message}"
📎 **Attachment:** ${dm.hasFile ? '✅ Yes' : '❌ None'}

Reply **YES** to send or **NO** to cancel.`;
}

/**
 * handleDM
 *
 * Called by the chat route when orchestrator returns action = 'dm'.
 * Accepts the fields Jenny extracted. Validates for missing slots.
 * If all filled, stores as pending and returns confirm card immediately.
 */
export function handleDM(input: Partial<DmRouterInput>): DmRouterResult {
  // Merge with any existing pending state (for multi-turn slot filling)
  const current = pendingDmStore || { username: '', platform: 'instagram' as const, message: '', hasFile: false };

  const merged: DmRouterInput = {
    username: (input.username || current.username).replace(/^@/, '').trim(),
    platform: (input.platform as DmRouterInput['platform']) || current.platform || 'instagram',
    message: input.message || current.message,
    hasFile: input.hasFile !== undefined ? !!input.hasFile : current.hasFile,
  };

  // Validate required slots
  if (!merged.username) {
    return { status: 'clarify', reply: 'Kisko DM karna hai? Naam ya @username batao! 😊' };
  }

  if (!merged.message) {
    pendingDmStore = merged; // save username/platform while we wait for message
    return {
      status: 'clarify',
      reply: `Kya message bhejna hai **@${merged.username}** ko? 😊`,
      data: { username: merged.username, platform: merged.platform }
    };
  }

  // All slots filled — store and present confirm card (ONE step)
  pendingDmStore = merged;
  return {
    status: 'confirm',
    reply: buildConfirmCard(merged),
    data: merged,
  };
}

/**
 * executePendingDM — Sends the stored DM. Called after user confirms.
 */
export async function executePendingDM(): Promise<DmRouterResult> {
  if (!pendingDmStore) {
    return { status: 'error', reply: 'Koi pending DM nahi mili. Dobara bolein kisko bhejun?', error: 'NO_PENDING_DM' };
  }

  const { username, platform, message, hasFile } = pendingDmStore;

  try {
    const endpoint = platform === 'discord'
      ? 'http://localhost:3000/api/discord/post'
      : platform === 'instagram'
        ? 'http://localhost:3000/api/instagram/dm-send'
        : 'http://localhost:3000/api/twitter/dm-send';

    let body: any;
    const headers: any = {};

    if (platform === 'discord') {
      body = JSON.stringify({ channelIds: [username], content: message, files: [] });
      headers['Content-Type'] = 'application/json';
    } else {
      const fd = new FormData();
      fd.append('username', username);
      fd.append('message', message);
      body = fd;
    }

    const res = await fetch(endpoint, { method: 'POST', body, headers });
    const data = await res.json();

    pendingDmStore = null; // always clear after attempt

    if (data.success) {
      return {
        status: 'success',
        reply: `✅ DM sent to **@${username}** via ${platform.charAt(0).toUpperCase() + platform.slice(1)}! 🎉\n\nAur kuch karna hai?`
      };
    } else {
      return {
        status: 'error',
        reply: `❌ DM failed: **${data.error || 'Unknown error'}**\n\nCheck your account connection in Settings.`,
        error: data.error
      };
    }
  } catch (err) {
    pendingDmStore = null;
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'error', reply: `❌ System error: ${error}`, error };
  }
}

export function clearPendingDM() {
  pendingDmStore = null;
}

export function getPendingDM() {
  return pendingDmStore;
}

// Legacy alias so existing imports don't break
export const validateDM = handleDM;
