/**
 * INPUT ENRICHMENT LAYER
 * ─────────────────────────────────────────────────────────────
 * Takes raw user input, detects mentions / channel refs, and
 * returns a cleaned message + structured metadata.
 *
 * RULES:
 *  - NO AI calls here
 *  - NO action execution here
 *  - Prefer cached contact data passed in from the frontend
 */

export interface MentionMeta {
  type: 'user' | 'channel';
  value: string;
  platform?: string; // 'instagram' | 'twitter' | 'discord'
  resolvedId?: string; // channel id if discord
}

export interface EnrichedInput {
  message: string; // cleaned, normalised message
  context: {
    mentions: MentionMeta[];
    hasFile: boolean;
    rawInput: string;
  };
}

// Known platform keywords that follow @mention context
const PLATFORM_HINTS: Record<string, string> = {
  instagram: 'instagram',
  ig: 'instagram',
  insta: 'instagram',
  twitter: 'twitter',
  x: 'twitter',
  discord: 'discord',
};

/**
 * Optionally pass cached contacts from the frontend so we can
 * resolve usernames without triggering a new fetch.
 */
export interface CachedContacts {
  instagram?: Array<{ username: string; displayName: string }>;
  twitter?: Array<{ username: string; displayName: string }>;
  discord?: Array<{ id: string; name: string; type?: string }>;
}

/**
 * Primary enrichment function.
 *
 * @param rawInput  - The raw string the user typed / spoke
 * @param hasFile   - Whether a file is attached
 * @param cache     - Optionally pre-fetched contact/channel data
 */
export function enrichInput(
  rawInput: string,
  hasFile = false,
  cache: CachedContacts = {}
): EnrichedInput {
  const mentions: MentionMeta[] = [];
  let message = rawInput;

  // ── 1. Detect @username patterns ────────────────────────────────────────
  const mentionRegex = /@([a-zA-Z0-9_.]+)/g;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(rawInput)) !== null) {
    const raw = match[1].toLowerCase();

    // Check if this is an app name rather than a username
    if (PLATFORM_HINTS[raw]) {
      // e.g. @instagram → platform hint, not a user mention
      continue;
    }

    // Detect platform from surrounding context
    const afterMention = rawInput.slice(match.index + match[0].length);
    let platform: string | undefined;

    for (const [hint, plat] of Object.entries(PLATFORM_HINTS)) {
      const hintRe = new RegExp(`\\b(on\\s+)?${hint}\\b`, 'i');
      if (hintRe.test(afterMention) || hintRe.test(rawInput.slice(0, match.index))) {
        platform = plat;
        break;
      }
    }

    // Try to resolve from cache
    let resolvedUsername = raw;
    if (platform === 'instagram' && cache.instagram) {
      const found = cache.instagram.find(
        c => c.username.toLowerCase() === raw || c.displayName.toLowerCase() === raw
      );
      if (found) resolvedUsername = found.username;
    } else if (platform === 'twitter' && cache.twitter) {
      const found = cache.twitter.find(
        c => c.username.toLowerCase() === raw || c.displayName.toLowerCase() === raw
      );
      if (found) resolvedUsername = found.username;
    }

    mentions.push({ type: 'user', value: resolvedUsername, platform });
  }

  // ── 2. Detect #channel patterns ──────────────────────────────────────────
  // Matches #channel-name or #channel-name (-id) written by the mention system
  const channelRegex = /#([a-zA-Z0-9_-]+)(?:\s*\(-(\d+)\))?/g;
  while ((match = channelRegex.exec(rawInput)) !== null) {
    const channelName = match[1];
    const channelId = match[2]; // optional discord id

    // Resolve from Discord cache if available
    let resolvedId = channelId;
    if (!resolvedId && cache.discord) {
      const found = cache.discord.find(
        c => c.name.toLowerCase() === channelName.toLowerCase() && c.type === 'discord-channel'
      );
      if (found) resolvedId = found.id;
    }

    mentions.push({
      type: 'channel',
      value: channelName,
      platform: 'discord',
      resolvedId,
    });
  }

  // ── 3. Normalize message (no destructive stripping — keep raw text intact) ──
  // The message is passed as-is; the orchestrator/router can use `mentions` for
  // enriched routing. Only light whitespace normalisation is done.
  message = rawInput.trim().replace(/\s{2,}/g, ' ');

  return {
    message,
    context: {
      mentions,
      hasFile,
      rawInput,
    },
  };
}
