/**
 * TOOL: instagram_fetch
 * Scrapes the Instagram inbox to find unread messages.
 * Used by autonomous agents to monitoring social activity.
 */

export async function execute_instagram_fetch(): Promise<{ success: boolean; data?: any; reply: string; error?: string; hasUnread?: boolean }> {
  try {
    const res = await fetch('http://localhost:3000/api/instagram/dms?deepRead=true', { method: 'GET' });
    const data = await res.json();

    if (!data.success) {
      return { 
        success: false, 
        reply: `❌ Could not fetch Instagram DMs: ${data.error}`, 
        error: data.error 
      };
    }

    const unread = data.contacts.filter((c: any) => c.isUnread);
    
    if (unread.length === 0) {
      return {
        success: true,
        data: { unreadCount: 0 },
        reply: "Inbox check completed. No new (unread) messages found."
      };
    }

    // Sanitize message previews: strip non-ASCII and trim to avoid context poisoning
    const sanitize = (text: string) => (text || '').replace(/[^\x20-\x7E]/g, '').trim();

    const details = unread.map((c: any) => {
      const cleanMsg = sanitize(c.lastMessage);
      return `@${c.username}: "${cleanMsg || 'No message preview'}"`;
    }).join('\n');

    return {
      success: true,
      hasUnread: true,
      data: { unreadCount: unread.length, unread },
      reply: `📬 Found **${unread.length}** unread message(s):\n\n${details}`
    };

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, reply: `❌ System error during fetch: ${error}`, error };
  }
}
