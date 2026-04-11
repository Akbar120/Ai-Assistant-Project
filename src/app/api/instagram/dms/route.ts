import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const INSTAGRAM_COOKIES_FILE = path.join(process.cwd(), 'sessions', 'instagram-cookies.json');

export interface DMContact {
  username: string;
  displayName: string;
  avatarUrl?: string;
  lastMessage?: string;
  isGroup?: boolean;
  isUnread?: boolean;
  threadUrl?: string;
}

export async function GET() {
  if (!fs.existsSync(INSTAGRAM_COOKIES_FILE)) {
    return NextResponse.json({ success: false, error: 'No Instagram session. Please log in first.' }, { status: 401 });
  }

  const cookies = JSON.parse(fs.readFileSync(INSTAGRAM_COOKIES_FILE, 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Navigate to Instagram DMs inbox
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    // Dismiss any popups (Not Now etc.)
    for (const t of ['Not Now', 'Not now', 'Cancel']) {
      const btn = page.getByRole('button', { name: t, exact: true });
      if (await btn.count() > 0) await btn.first().click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    // Save debug screenshot
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'ig-dms.png') });
    } catch (_) {}

    // Extract DM conversations from the inbox list
    // Instagram DMs page has a list of conversations - each has a link with the username
    const contacts: DMContact[] = await page.evaluate(() => {
      const results: DMContact[] = [];
      const seen = new Set<string>();

      // Strategy: Role-based buttons (Instagram's current DM list implementation)
      const listItems = document.querySelectorAll('div[role="button"]');
      
      for (const item of Array.from(listItems)) {
        const img = item.querySelector('img');
        if (!img) continue; // Skip buttons without avatars

        const spans = Array.from(item.querySelectorAll('span'));
        const textContents: string[] = [];

        for (const span of spans) {
          const text = (span.textContent || '').trim();
          if (text && !textContents.includes(text)) {
            textContents.push(text);
          }
        }

        if (textContents.length > 0) {
          // Typically: [ "Display Name", "Last message · 1h" ]
          const displayName = textContents[0];
          
          let lastMsg = '';
          if (textContents.length > 1) {
             const potentialMsg = textContents[1].split('·')[0].trim();
             lastMsg = potentialMsg.length > 40 ? potentialMsg.substring(0, 40) + '…' : potentialMsg;
          }

          // Try to extract exact username from avatar alt text (e.g., "username's profile picture")
          const alt = img.getAttribute('alt') || '';
          const match = alt.match(/^(.+?)(?:'s profile picture|'s)$/);
          let username = match ? match[1].trim() : '';
          
          if (!username) {
             username = displayName.toLowerCase().replace(/\s+/g, '_');
          }

          const key = username;
          if (seen.has(key)) continue;
          seen.add(key);

          // Check for unread indicators (blue dots or specific span classes often used for unread)
          // A very common indicator is a blue dot sibling, or aria-labels in child spans
          let isUnread = false;
          // Strategy 1: Check if any span has a blue-ish dot
          const allDivs = Array.from(item.querySelectorAll('div'));
          const hasBlueDot = allDivs.some(d => {
             const style = window.getComputedStyle(d);
             return style.backgroundColor === 'rgb(0, 149, 246)' && style.width !== '0px' && parseInt(style.width) <= 16;
          });
          
          // Strategy 2: Often the text is bolded if unread
          const isBold = spans.some(s => {
             const fw = window.getComputedStyle(s).fontWeight;
             return fw === '600' || fw === '700' || fw === 'bold';
          });
          
          if (hasBlueDot || isBold) {
             isUnread = true;
          }

          // Try to find thread link
          let threadUrl = '';
          let currentEl: HTMLElement | null = item as HTMLElement;
          while (currentEl && currentEl.tagName !== 'BODY') {
             if (currentEl.tagName === 'A') {
                const href = currentEl.getAttribute('href');
                if (href && href.includes('/direct/t/')) {
                   threadUrl = 'https://www.instagram.com' + href;
                   break;
                }
             }
             currentEl = currentEl.parentElement;
          }

          if (!threadUrl) {
             // Fallback
             threadUrl = 'https://www.instagram.com/direct/inbox/';
          }

          results.push({
            username,
            displayName,
            avatarUrl: img.getAttribute('src') || undefined,
            lastMessage: lastMsg || undefined,
            isUnread,
            threadUrl,
          });

          if (results.length >= 25) break; 
        }
      }

      return results;
    });

    await browser.close();

    return NextResponse.json({ success: true, contacts, count: contacts.length });
  } catch (err) {
    try { await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'ig-dms-error.png') }); } catch (_) {}
    await browser.close();
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
