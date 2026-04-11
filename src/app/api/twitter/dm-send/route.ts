import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const maxDuration = 90;

const TWITTER_COOKIES_FILE = path.join(process.cwd(), 'sessions', 'twitter-cookies.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(req: NextRequest) {
  if (!fs.existsSync(TWITTER_COOKIES_FILE)) {
    return NextResponse.json({ success: false, error: 'No Twitter session. Please log in first in settings.' }, { status: 401 });
  }

  const formData = await req.formData();
  const username = formData.get('username') as string;
  const message = formData.get('message') as string;
  const file = formData.get('file') as File | null;

  if (!username) return NextResponse.json({ success: false, error: 'Username is required' }, { status: 400 });

  let savedFilePath: string | null = null;
  if (file) {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${uuidv4()}-${file.name}`;
    savedFilePath = path.join(UPLOADS_DIR, filename);
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(savedFilePath, Buffer.from(bytes));
  }

  const cookies = JSON.parse(fs.readFileSync(TWITTER_COOKIES_FILE, 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  const screenshot = async (name: string) => {
    try { await page.screenshot({ path: path.join(process.cwd(), 'sessions', `tw-dm-${name}.png`) }); } catch (_) {}
  };

  try {
    // Navigate straight to profile to find the DM button
    await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await screenshot('01-profile');

    const messageBtn = page.locator('[data-testid="sendDMFromProfile"]').first();
    
    if (await messageBtn.count() > 0) {
      await messageBtn.click();
    } else {
      throw new Error(`Could not find the 'Message' button on @${username}'s profile. Their DMs might be closed.`);
    }

    await page.waitForTimeout(4000);
    await screenshot('02-thread');

    if (message && message.trim()) {
      const msgInput = page.locator('[data-testid="dmComposerTextInput"]').first();
      await msgInput.waitFor({ state: 'visible', timeout: 5000 });
      await msgInput.click();
      await page.keyboard.type(message, { delay: 15 });
      await page.waitForTimeout(500);
    }

    if (savedFilePath) {
      let fileAttached = false;

      // Strategy 1: Use file chooser triggered by the media button
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);

      const attachSelectors = [
        '[data-testid="dmComposerMediaButton"]',
        '[aria-label*="media" i]',
        '[aria-label*="photo" i]',
        '[aria-label*="image" i]',
        'button[title*="photo" i]',
        'button[title*="media" i]',
      ];

      for (const sel of attachSelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          try { await el.click({ timeout: 3000 }); break; } catch (_) { /* try next */ }
        }
      }

      const fileChooser = await fileChooserPromise;
      if (fileChooser) {
        await fileChooser.setFiles(savedFilePath);
        fileAttached = true;
        await page.waitForTimeout(3000);
      }

      // Strategy 2: Direct file input fallback
      if (!fileAttached) {
        const fileInputs = page.locator('input[type="file"]');
        const count = await fileInputs.count();
        for (let i = 0; i < count; i++) {
          try {
            await fileInputs.nth(i).setInputFiles(savedFilePath);
            fileAttached = true;
            await page.waitForTimeout(3000);
            break;
          } catch (_) { /* try next */ }
        }
      }

      if (!fileAttached) {
        console.warn('[TW DM] Could not attach file — no usable file input found');
      }
    }

    await screenshot('03-before-send');

    const sendBtn = page.locator('[data-testid="dmComposerSendButton"]').first();
    if (await sendBtn.count() > 0 && await sendBtn.isEnabled()) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2000);
    await screenshot('04-sent');

    const updatedCookies = await context.cookies();
    fs.writeFileSync(TWITTER_COOKIES_FILE, JSON.stringify(updatedCookies, null, 2));

    await browser.close();
    if (savedFilePath) fs.unlink(savedFilePath, () => {});

    return NextResponse.json({ success: true, message: `Message sent to @${username} on Twitter.` });
  } catch (err) {
    await screenshot('error');
    await browser.close();
    if (savedFilePath) fs.unlink(savedFilePath, () => {});
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
