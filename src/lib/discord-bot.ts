import { Client, GatewayIntentBits, TextChannel, ChannelType } from 'discord.js';

let discordClient: Client | null = null;

export function getDiscordClient(token: string): Client {
  if (discordClient && discordClient.isReady()) {
    return discordClient;
  }
  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });
  discordClient.login(token).catch(console.error);
  return discordClient;
}

export async function destroyDiscordClient() {
  if (discordClient) {
    await discordClient.destroy();
    discordClient = null;
  }
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  memberCount?: number;
}

export interface Channel {
  id: string;
  name: string;
  type: string;
  guildId: string;
}

/**
 * Fetch all guilds (servers) accessible to the bot
 */
export async function fetchGuilds(token: string): Promise<Guild[]> {
  const client = getDiscordClient(token);

  // Wait until ready
  if (!client.isReady()) {
    await new Promise<void>((resolve) => {
      client.once('ready', () => resolve());
      setTimeout(() => resolve(), 10000);
    });
  }

  return client.guilds.cache.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL() ?? null,
    memberCount: g.memberCount,
  }));
}

/**
 * Fetch text channels for a guild
 */
export async function fetchChannels(token: string, guildId: string): Promise<Channel[]> {
  const client = getDiscordClient(token);

  if (!client.isReady()) {
    await new Promise<void>((resolve) => {
      client.once('ready', () => resolve());
      setTimeout(() => resolve(), 10000);
    });
  }

  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  return channels
    .filter((c) => c !== null && c.type === ChannelType.GuildText)
    .map((c) => ({
      id: c!.id,
      name: (c as TextChannel).name,
      type: 'text',
      guildId,
    }));
}

/**
 * Send a message to a Discord channel
 */
export async function sendDiscordMessage(
  token: string,
  channelId: string,
  content: string,
  files?: string[],
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = getDiscordClient(token);

    if (!client.isReady()) {
      await new Promise<void>((resolve) => {
        client.once('ready', () => resolve());
        setTimeout(() => resolve(), 10000);
      });
    }

    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      return { success: false, error: 'Channel not found or not text-based' };
    }

    const msg = await channel.send({
      content,
      files: files || [],
    });

    return { success: true, messageId: msg.id };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

/**
 * Validate a Discord bot token
 */
export async function validateDiscordToken(token: string): Promise<{ valid: boolean; botName?: string; error?: string }> {
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!resp.ok) {
      return { valid: false, error: `Invalid token (${resp.status})` };
    }
    const data = await resp.json();
    return { valid: true, botName: data.username };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { valid: false, error };
  }
}

/**
 * Generate the OAuth2 URL to add the bot to a server
 */
export function getBotInviteUrl(clientId: string): string {
  const permissions = '2048'; // SEND_MESSAGES permission
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot`;
}
