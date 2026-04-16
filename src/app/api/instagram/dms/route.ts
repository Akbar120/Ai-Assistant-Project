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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deepRead = url.searchParams.get('deepRead') === 'true';

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
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    for (const t of ['Not Now', 'Not now', 'Cancel']) {
      const btn = page.getByRole('button', { name: t, exact: true });
      if (await btn.count() > 0) await btn.first().click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    const contacts: DMContact[] = await page.evaluate(() => {
      const results: DMContact[] = [];
      const seen = new Set<string>();
      
      // Blacklist of system placeholders that don't count as "real" text
      const JUNK_PATTERNS = [
        'sent a gif', 'sent a message', 'sent a photo', 'sent a video', 
        'sent an attachment', 'shared a profile', 'shared a story',
        'shared a post', 'shared a reel', 'reacted to your',
        'sent a sticker', 'sent an audio', 'note'
      ];

      // Specifically target main list to avoid top horizontal Notes bar
      const listItems = document.querySelectorAll('div[role="button"]:not([aria-label*="Note"])');
      
      for (const item of Array.from(listItems)) {
        // Skip horizontal layout items (Instagram Notes)
        const parent = item.parentElement;
        if (parent) {
          const style = window.getComputedStyle(parent);
          if (style.display === 'flex' && style.flexDirection === 'row') continue;
        }
        if (item.closest('ul') || item.clientWidth < 100) continue;

        const img = item.querySelector('img');
        if (!img) continue;

        const spans = Array.from(item.querySelectorAll('span'));
        const textContents: string[] = [];

        for (const span of spans) {
          const text = (span.textContent || '').trim();
          if (text && !textContents.includes(text)) {
            textContents.push(text);
          }
        }

        if (textContents.length > 0) {
          const displayName = textContents[0];
          let lastMsg = '';
          if (textContents.length > 1) {
             const potentialMsg = textContents[1].split('·')[0].trim();
             lastMsg = potentialMsg.length > 40 ? potentialMsg.substring(0, 40) + '…' : potentialMsg;
          }

          // Filter out obvious junk from the inbox list
          const isJunk = JUNK_PATTERNS.some(p => lastMsg.toLowerCase().includes(p));
          if (isJunk) lastMsg = ''; // Clear it out so deepRead might try to find something better or we skip it

          const alt = img.getAttribute('alt') || '';
          const match = alt.match(/^(.+?)(?:'s profile picture|'s)$/);
          let username = match ? match[1].trim() : displayName.toLowerCase().replace(/\s+/g, '_');

          if (seen.has(username)) continue;
          seen.add(username);

          let isUnread = false;
          const allDivs = Array.from(item.querySelectorAll('div'));
          const hasBlueDot = allDivs.some(d => {
             const style = window.getComputedStyle(d);
             return style.backgroundColor === 'rgb(0, 149, 246)' && style.width !== '0px' && parseInt(style.width) <= 16;
          });
          
          const isBold = spans.some(s => {
             const fw = window.getComputedStyle(s).fontWeight;
             return fw === '600' || fw === '700' || fw === 'bold';
          });
          
          if (hasBlueDot || (isBold && lastMsg)) {
             isUnread = true;
          }

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

          if (!threadUrl) threadUrl = 'https://www.instagram.com/direct/inbox/';

          // Only add if it's potentially unread and has text, or we'll deep read it later
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

    // ── Deep Read: Enter Threads and extract text ──
    if (deepRead) {
      const topUnread = contacts.filter(c => c.isUnread && c.threadUrl !== 'https://www.instagram.com/direct/inbox/').slice(0, 3);
      
      for (const contact of topUnread) {
         try {
           await page.goto(contact.threadUrl as string, { waitUntil: 'domcontentloaded' });
           await page.waitForTimeout(3000); 

           const chatSnippet = await page.evaluate(() => {
             const JUNK_PATTERNS = [
               'sent a gif', 'sent a message', 'sent a photo', 'sent a video', 
               'sent an attachment', 'shared a profile', 'shared a story',
               'shared a post', 'shared a reel', 'reacted to your',
               'sent a sticker', 'sent an audio'
             ];

             const messageNodes = Array.from(document.querySelectorAll('div[dir="auto"]'));
             const texts = messageNodes
                 .map(n => n.textContent?.trim() || '')
                 .filter(t => {
                    const low = t.toLowerCase();
                    return t.length > 0 && 
                           !low.includes('liked') && 
                           t !== 'Reply' && 
                           t !== 'Forward' &&
                           !JUNK_PATTERNS.some(p => low.includes(p));
                 })
                 .slice(-5); 
             
             if (texts.length > 0) {
                 return texts.join(' | ');
             }
             return null;
           });

           if (chatSnippet) {
              contact.lastMessage = chatSnippet;
           } else {
              // If no real text found, it was just attachments
              contact.isUnread = false; // "Mark" as ignored by removing unread status for this tool's response
              contact.lastMessage = undefined;
           }
         } catch (e) {
           console.log("Deep read error for", contact.username);
         }
      }
    }

    await browser.close();
    // Filter out contacts that ended up with no real message after deep read
    const finalContacts = contacts.filter(c => c.lastMessage && c.lastMessage.length > 0);
    return NextResponse.json({ success: true, contacts: finalContacts, count: finalContacts.length });

  } catch (err) {
    try { await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'ig-dms-error.png') }); } catch (_) {}
    await browser.close();
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
