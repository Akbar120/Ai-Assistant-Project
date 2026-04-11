/**
 * DM ROUTER
 * ─────────────────────────────────────────────────────────────
 * Handles Instagram / Twitter / Discord DM logic with safety checks,
 * clarification, and stateful confirmation.
 */

export interface DmRouterInput {
  username: string;
  platform: 'instagram' | 'twitter' | 'discord';
  message: string;
  channelId?: string;
  hasFile?: boolean;
}

export interface DmRouterResult {
  status: 'clarify' | 'confirm' | 'execute' | 'error' | 'success';
  reply: string;
  data?: Partial<DmRouterInput>;
  error?: string;
}

// ─── In-Memory State Store ────────────────────────────────────────────────────
// Simple singleton to hold pending DMs for confirmation
let pendingDmStore: DmRouterInput | null = null;

/**
 * validateDM — Checks if we have enough info to propose a DM.
 * Implements clarification and attachment detection.
 */
export function validateDM(input: Partial<DmRouterInput>): DmRouterResult {
  const { username, platform, message, hasFile } = input;
  
  // Ensure we have a baseline from the existing store if available
  const current = pendingDmStore || { username: '', platform: 'instagram', message: '', hasFile: false };

  // Update store with whatever we have now
  pendingDmStore = {
    username: username || current.username,
    platform: (platform as any) || current.platform || 'instagram',
    message: message || current.message,
    hasFile: hasFile !== undefined ? !!hasFile : current.hasFile
  };

  const active = pendingDmStore;

  // 1. Check for missing target
  if (!active.username) {
    return {
      status: 'clarify',
      reply: 'Kisko DM karna hai? Naam ya @username batao! 😊'
    };
  }

  // 2. Check for missing message
  if (!active.message) {
    return {
      status: 'clarify',
      reply: `Kya message bhejna hai @${active.username} ko? 😊`,
      data: { username: active.username, platform: active.platform }
    };
  }

  // 3. Attachment Detection
  const attachmentKeywords = ['photo', 'image', 'pic', 'video', 'file', 'pdf', 'doc'];
  const mentionsAttachment = attachmentKeywords.some(kw => active.message.toLowerCase().includes(kw));

  if (mentionsAttachment && !active.hasFile) {
    return {
      status: 'clarify',
      reply: 'Aapne photo/file mention kiya hai. Attachment bhi bhejna hai? Agar haan, toh attachment upload karke reply karo, ya phir bolo "No attachment".',
      data: { username: active.username, platform: active.platform, message: active.message }
    };
  }

  // 4. If all good, propose confirmation
  return {
    status: 'confirm',
    reply: `⚠️ Confirm DM Details:

Recipient: @${active.username}
Platform: ${active.platform}
Message: "${active.message}"
Attachment: ${active.hasFile ? '✅ Attached' : '❌ None'}

Reply YES to confirm or NO to cancel.`
  };
}

/**
 * executePendingDM — Actually sends the message stored in memory.
 */
export async function executePendingDM(): Promise<DmRouterResult> {
  if (!pendingDmStore) {
    return { status: 'error', reply: 'No pending DM found to execute.', error: 'NO_PENDING_DM' };
  }

  const { username, platform, message, hasFile } = pendingDmStore;
  
  try {
    const endpoint = platform === 'discord' 
      ? 'http://localhost:3000/api/discord/post'
      : platform === 'instagram'
        ? 'http://localhost:3000/api/instagram/dm-send'
        : 'http://localhost:3000/api/twitter/dm-send';

    let body: any;
    let headers: any = {};

    if (platform === 'discord') {
      body = JSON.stringify({
        channelIds: [username],
        content: message,
        files: [] // File handling simplified for now
      });
      headers = { 'Content-Type': 'application/json' };
    } else {
      const fd = new FormData();
      fd.append('username', username);
      fd.append('message', message);
      body = fd;
    }

    const res = await fetch(endpoint, { method: 'POST', body, headers });
    const data = await res.json();

    if (data.success) {
      pendingDmStore = null; // Clear after success
      return { 
        status: 'success', 
        reply: `✅ DM sent to @${username} via ${platform}! 🎉\n\nAur kuch karna hai?` 
      };
    } else {
      return { 
        status: 'error', 
        reply: `❌ DM failed: **${data.error}**`,
        error: data.error 
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'error', reply: `❌ System error: ${error}`, error };
  }
}

/**
 * clearPendingDM — Cancels the current draft.
 */
export function clearPendingDM() {
  pendingDmStore = null;
}

/**
 * hasPendingDM — Check if we are in a confirmation state.
 */
export function getPendingDM() {
  return pendingDmStore;
}
