import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 120;

const INSTAGRAM_COOKIES_FILE = path.join(process.cwd(), 'sessions', 'instagram-cookies.json');

interface DMContact {
  username: string;
  displayName: string;
  avatarUrl?: string;
  lastMessage?: string;
  isGroup?: boolean;
  isUnread: boolean;
  threadUrl: string;
  threadId?: string;
  messages?: string[];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deepRead = url.searchParams.get('deepRead') !== 'false';

  if (!fs.existsSync(INSTAGRAM_COOKIES_FILE)) {
    return NextResponse.json({ success: false, error: 'No Instagram session. Please log in first.' }, { status: 401 });
  }

  const cookies = JSON.parse(fs.readFileSync(INSTAGRAM_COOKIES_FILE, 'utf-8'));

  // Extract key cookies
  const sessionId = cookies.find((c: any) => c.name === 'sessionid')?.value;
  const csrftoken = cookies.find((c: any) => c.name === 'csrftoken')?.value;

  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'No valid session' }, { status: 401 });
  }

  // Try using Instagram's internal API directly
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Navigate to Instagram to establish session
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Dismiss any popups
    for (const t of ['Not Now', 'Not now', 'Cancel', 'Allow', 'Not Now ']) {
      const btn = page.getByRole('button', { name: new RegExp(`^${t}$`, 'i') });
      if (await btn.count() > 0) await btn.first().click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    // Navigate to DM inbox
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(12000);

    // Take screenshot
    await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'ig-dms-latest.png') });

    // Check what's in the DOM
    const domCheck = await page.evaluate(() => {
      // Find all potential thread containers (Instagram uses div[role="button"] for threads)
      const threadElements = Array.from(document.querySelectorAll('div[role="button"]'));
      
      const threads: any[] = threadElements
        .filter(el => {
          // Check for "Unread" text which is usually present for unread threads (accessibility)
          // or check for the blue dot via background color
          const hasUnreadText = el.textContent?.includes('Unread');
          const hasBlueDot = !!el.querySelector('div[style*="background-color: rgb(0, 149, 246)"]');
          const isBold = !!el.querySelector('span[style*="font-weight: 600"]');
          return hasUnreadText || hasBlueDot || isBold;
        })
        .map(el => {
          // Try to find the username.
          const spans = Array.from(el.querySelectorAll('span'));
          // Filter out spans that are purely status indicators
          const possibleNames = spans
            .map(s => s.textContent?.trim() || '')
            .filter(t => t && t !== 'Active' && t !== 'Unread' && t.length > 2);
          
          const name = possibleNames[0] || 'Unknown';
          const previewSpan = spans.find(s => s.textContent?.length && s.textContent.length > 5 && s.textContent !== name && !s.textContent.includes('Unread'));
          const preview = previewSpan?.textContent?.trim() || '';
          
          const aTag = el.querySelector('a') || el.closest('a');
          const href = aTag ? aTag.getAttribute('href') : `/direct/t/${name}`;
          
          return {
            text: el.textContent?.trim().substring(0, 100),
            name: name,
            preview: preview,
            isUnread: true,
            href: href 
          };
        });

      return {
        unreadThreads: threads,
        count: threads.length,
        totalElements: threadElements.length
      };
    });

    console.log('[DM Reader] DOM Check:', JSON.stringify(domCheck, null, 2));
    fs.writeFileSync(path.join(process.cwd(), 'sessions', 'domCheck.json'), JSON.stringify(domCheck, null, 2));

    const threadLinks = domCheck.unreadThreads;
    console.log(`[DM Reader] Thread links found: ${threadLinks.length}`);

    const contacts: DMContact[] = [];

    // Process each thread
    for (let i = 0; i < threadLinks.length && i < 5; i++) {
      const link = threadLinks[i];
      try {
        console.log(`[DM Reader] Processing unread thread: ${link.name}`);

        // Click the thread directly in the inbox
        console.log(`[DM Reader] Clicking thread for: ${link.name}`);
        const clicked = await page.evaluate((targetName) => {
          const elements = Array.from(document.querySelectorAll('div[role="button"]'));
          const target = elements.find(el => el.textContent?.includes(targetName));
          if (target) {
            (target as HTMLElement).click();
            return true;
          }
          return false;
        }, link.name);

        if (!clicked) {
          console.log(`[DM Reader] Failed to click thread for ${link.name}`);
          continue;
        }

        await page.waitForTimeout(6000); // Wait for thread to load

        const threadUrl = page.url();
        const threadId = threadUrl.split('/direct/t/')[1]?.replace('/', '');

        if (!threadId || threadUrl.includes('inbox')) {
          console.log(`[DM Reader] Navigation failed, still on inbox for ${link.name}. URL: ${threadUrl}`);
          continue;
        }

        console.log(`[DM Reader] Successfully navigated to thread: ${threadId}`);

        // Scroll to load messages
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(2000);

        // Take thread screenshot
        await page.screenshot({ path: path.join(process.cwd(), 'sessions', `ig-thread-${threadId}.png`) });

        // Get messages
        const messages = await page.evaluate(() => {
          const junk = [
            'sent a gif', 'sent a photo', 'sent a video', 'sent a message',
            'sent an attachment', 'liked', 'typing', 'seen', 'reacted to'
          ];
          const messages: string[] = [];
          const seen = new Set<string>();

          // Try div[dir="auto"] - Instagram's text container
          const textNodes = document.querySelectorAll('div[dir="auto"]');
          for (const node of textNodes) {
            const text = (node.textContent || '').trim();
            if (text.length < 2 || text.length > 500) continue;
            if (['Reply', 'Forward', 'React', 'Like', 'Copy', 'Unsend', 'Info'].includes(text)) continue;
            // Include media messages so the agent knows something was sent
            if (junk.some(j => text.toLowerCase() === j.toLowerCase())) continue; // only skip exact matches
            if (text.match(/^\d+\s*(minute|hour|day|yesterday|s|ago)/i)) continue;
            if (seen.has(text)) continue;

            seen.add(text);
            messages.push(text);
          }

          return messages;
        });

        if (messages.length > 0) {
          const cleanMessages = messages.filter((m: string) => {
            const junk = ['sent a ', 'liked', 'typing', 'seen', 'reacted', 'forwarded'];
            return !junk.some((j: string) => m.toLowerCase().startsWith(j)) && m.length > 1;
          });

          const finalMessages = cleanMessages.length > 0 ? cleanMessages : [link.preview || 'Sent an attachment'];

          contacts.push({
            username: (link as any).name || (link as any).text?.replace('@', '').trim() || threadId,
            threadId: threadId,
            displayName: (link as any).name || threadId,
            lastMessage: finalMessages[finalMessages.length - 1],
            messages: finalMessages,
            isUnread: (link as any).isUnread,
            threadUrl
          });

          console.log(`[DM Reader] Got ${finalMessages.length} messages from ${threadId}`);
        } else {
          // Fallback: Use the preview from the inbox if no messages found in thread
          contacts.push({
            username: (link as any).name || threadId,
            threadId: threadId,
            displayName: (link as any).name || threadId,
            lastMessage: link.preview || 'Media/Attachment',
            messages: [link.preview || 'Media/Attachment'],
            isUnread: true,
            threadUrl
          });
          console.log(`[DM Reader] No text nodes found in thread for ${threadId}. Using preview.`);
        }
      } catch (e) {
        console.log(`[DM Reader] Error:`, e);
      }
    }

    await browser.close();

    const finalContacts = contacts.filter(c => c.lastMessage);
    console.log(`[DM Reader] Returning ${finalContacts.length} contacts`);

    return NextResponse.json({
      success: true,
      contacts: finalContacts,
      count: finalContacts.length,
      debug: {
        threadsFound: threadLinks.length,
        threadsChecked: threadLinks.length
      }
    });

  } catch (err) {
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'sessions', 'ig-dms-error.png') });
    } catch (_) {}
    await browser.close();
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.log(`[DM Reader] Error:`, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}