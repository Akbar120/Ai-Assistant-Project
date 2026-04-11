import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DISCORD_COOKIES_FILE = path.join(process.cwd(), 'sessions', 'discord-cookies.json');

export interface DMContact {
  username: string;
  displayName: string;
  avatarUrl?: string;
  lastMessage?: string;
  isUnread?: boolean;
  threadUrl?: string;
}

export async function GET() {
  if (!fs.existsSync(DISCORD_COOKIES_FILE)) {
    return NextResponse.json({ success: false, error: 'No Discord session. Please log in first.' }, { status: 401 });
  }

  const cookies = JSON.parse(fs.readFileSync(DISCORD_COOKIES_FILE, 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Navigate to Discord home / DMs
    await page.goto('https://discord.com/channels/@me', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // Wait for Discord app to load fully

    // Save debug screenshot
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'discord-dms.png') });
    } catch (_) {}

    // Extract recent DMs from the sidebar
    const contacts: DMContact[] = await page.evaluate(() => {
      const results: DMContact[] = [];
      const seen = new Set<string>();

      // Strategy: Discord typically has anchor tags for DMs in the sidebar
      // Most dependable selector: a[href^="/channels/@me/"]
      const dmLinks = document.querySelectorAll('a[href^="/channels/@me/"]');
      
      for (const link of Array.from(dmLinks)) {
        // Skip the "Friends", "Nitro", "Message Requests" generic tabs which are just /channels/@me
        const href = link.getAttribute('href');
        if (!href || href === '/channels/@me') continue;

        // Extract image
        const img = link.querySelector('img');
        const avatarUrl = img ? img.getAttribute('src') || undefined : undefined;

        // Extract name
        // Usually inside a div right next to the avatar
        // Discord's nesting is deep, but textContent of the link usually has the name, possibly with status
        let nameText = '';
        
        // Try to find the inner text container
        const allDivs = link.querySelectorAll('div');
        // Let's rely on aria-label or text bounds if possible.
        // A simple heuristic: remove leading/trailing whitespace, take the first non-empty block.
        // Or fetch elements with text.
        for (const el of Array.from(allDivs)) {
          if (el.children.length === 0 && el.textContent?.trim()) {
            // Probably the name or status
            const text = el.textContent.trim();
            if (text && !nameText) {
              nameText = text;
            }
          }
        }
        
        // Fallback: aria-label of the link itself
        const ariaLabel = link.getAttribute('aria-label') || '';
        let displayName = nameText || ariaLabel;

        const isUnread = ariaLabel.toLowerCase().includes('unread');

        // Clean up "aria-label" which often says "User, 1 unread ping"
        if (displayName && ariaLabel) {
           displayName = ariaLabel.split(',')[0].trim();
        }

        if (displayName) {
          if (seen.has(displayName)) continue;
          seen.add(displayName);

          results.push({
            username: displayName.toLowerCase().replace(/\W+/g, ''),
            displayName: displayName,
            avatarUrl: avatarUrl || undefined,
            lastMessage: isUnread ? 'Unread message' : 'Seen',
            isUnread,
            threadUrl: 'https://discord.com' + href,
          });
        }

        if (results.length >= 25) break; 
      }

      return results;
    });

    await browser.close();

    return NextResponse.json({ success: true, contacts, count: contacts.length });
  } catch (err) {
    try { await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'discord-dms-error.png') }); } catch (_) {}
    await browser.close();
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
