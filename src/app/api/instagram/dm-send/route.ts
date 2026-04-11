import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const maxDuration = 120;

const INSTAGRAM_COOKIES_FILE = path.join(process.cwd(), 'sessions', 'instagram-cookies.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(req: NextRequest) {
  if (!fs.existsSync(INSTAGRAM_COOKIES_FILE)) {
    return NextResponse.json({ success: false, error: 'No Instagram session. Please log in first.' }, { status: 401 });
  }

  const formData = await req.formData();
  const username = formData.get('username') as string;
  const message = formData.get('message') as string;
  const file = formData.get('file') as File | null;

  if (!username) return NextResponse.json({ success: false, error: 'Username is required' }, { status: 400 });

  // Save uploaded file if any
  let savedFilePath: string | null = null;
  let savedFileName: string | null = null;
  let savedFileMime: string | null = null;
  if (file) {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${uuidv4()}-${file.name}`;
    savedFilePath = path.join(UPLOADS_DIR, filename);
    savedFileName = file.name;
    savedFileMime = file.type;
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(savedFilePath, Buffer.from(bytes));
    console.log(`[IG DM] File saved: ${savedFilePath} (${file.type}, ${Math.round(file.size/1024)}KB)`);
  }

  const cookies = JSON.parse(fs.readFileSync(INSTAGRAM_COOKIES_FILE, 'utf-8'));

  // Use headless: false so OS file picker & clipboard APIs work reliably
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--start-minimized'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  const screenshot = async (name: string) => {
    try { await page.screenshot({ path: path.join(process.cwd(), 'sessions', `ig-dm-${name}.png`) }); } catch (_) {}
  };

  try {
    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await screenshot('01-inbox');

    // Dismiss any popups
    for (const t of ['Not Now', 'Not now', 'Cancel']) {
      const btn = page.getByRole('button', { name: t, exact: true });
      if (await btn.count() > 0) await btn.first().click().catch(() => {});
    }

    // Navigate to the conversation thread
    const threadBtn = page.locator('div[role="button"]').filter({ hasText: username }).first();
    if (await threadBtn.count() > 0) {
      await threadBtn.click();
    } else {
      const newMsgBtn = page.locator('svg[aria-label="New message"]').locator('..');
      if (await newMsgBtn.count() > 0) {
        await newMsgBtn.first().click();
        await page.waitForTimeout(1500);
        const searchInput = page.locator('input[placeholder="Search..."], input[name="queryBox"]').first();
        await searchInput.waitFor({ state: 'visible', timeout: 5000 });
        await searchInput.fill(username);
        await page.waitForTimeout(2000);
        const exactMatch = page.locator(`[role="option"], [role="listitem"]`).filter({ hasText: username }).first();
        const anyResult = page.locator(`[role="option"], [role="listitem"]`).first();
        if (await exactMatch.count() > 0) await exactMatch.click();
        else if (await anyResult.count() > 0) await anyResult.click();
        await page.waitForTimeout(1000);
        for (const label of ['Next', 'Chat', 'Open', 'Send']) {
          const btn = page.getByRole('button', { name: label });
          if (await btn.count() > 0) { await btn.first().click(); break; }
        }
      } else {
        throw new Error(`Could not find the conversation with @${username} in your inbox.`);
      }
    }

    await page.waitForTimeout(3000);
    await screenshot('02-thread-open');

    // ── ATTACH FILE FIRST (before typing message) ──────────────────────────────
    if (savedFilePath) {
      let fileAttached = false;
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(savedFilePath);

      console.log(`[IG DM] Attempting to attach file: ${savedFileName} (image=${isImage})`);
      await screenshot('03-before-attach');

      // ── Strategy 1: Promise.all(filechooser + click) — correct Playwright pattern
      const attachSelectors = [
        'svg[aria-label="Add Photo or Video"]',
        '[aria-label="Add Photo or Video"]',
        'svg[aria-label*="Photo" i]',
        'svg[aria-label*="photo" i]',
        'svg[aria-label*="media" i]',
        'div[role="button"][aria-label*="photo" i]',
        'div[role="button"][aria-label*="image" i]',
        '[aria-label*="attach" i]',
        'button[title*="photo" i]',
        'button[title*="image" i]',
        'button[title*="video" i]',
      ];

      for (const sel of attachSelectors) {
        if (fileAttached) break;
        const el = page.locator(sel).first();
        if (await el.count() === 0) continue;
        try {
          console.log(`[IG DM] Trying selector: ${sel}`);
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 4000 }),
            el.click({ timeout: 3000 }),
          ]);
          await fileChooser.setFiles(savedFilePath);
          fileAttached = true;
          console.log(`[IG DM] ✅ Strategy 1 succeeded via: ${sel}`);
          await page.waitForTimeout(3000);
        } catch (_) {
          // selector didn't trigger a file chooser — try next
        }
      }

      // ── Strategy 2: Make hidden file inputs visible via JS, then setInputFiles
      if (!fileAttached) {
        console.log('[IG DM] Strategy 2: direct file input manipulation...');
        try {
          await page.evaluate(() => {
            document.querySelectorAll('input[type="file"]').forEach((el) => {
              const input = el as HTMLInputElement;
              input.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;position:fixed!important;top:0!important;left:0!important;width:50px!important;height:50px!important;z-index:99999!important;';
            });
          });

          const fileInputs = page.locator('input[type="file"]');
          const count = await fileInputs.count();
          for (let i = 0; i < count; i++) {
            try {
              await fileInputs.nth(i).setInputFiles(savedFilePath);
              await page.evaluate((idx) => {
                const inputs = document.querySelectorAll('input[type="file"]');
                const input = inputs[idx] as HTMLInputElement;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }, i);
              fileAttached = true;
              console.log(`[IG DM] ✅ Strategy 2 succeeded on input[${i}]`);
              await page.waitForTimeout(3000);
              break;
            } catch (err: unknown) {
              console.log(`[IG DM] Input[${i}] failed: ${err instanceof Error ? err.message : err}`);
            }
          }
        } catch (e) {
          console.warn('[IG DM] Strategy 2 error:', e);
        }
      }

      // ── Strategy 3: Clipboard paste (most reliable for images)
      if (!fileAttached && isImage) {
        console.log('[IG DM] Strategy 3: clipboard paste for image...');
        try {
          const fileBuffer = fs.readFileSync(savedFilePath);
          const base64 = fileBuffer.toString('base64');
          const mime = savedFileMime || (savedFilePath.endsWith('.png') ? 'image/png' : 'image/jpeg');

          await page.evaluate(async ({ b64, mimeType }: { b64: string; mimeType: string }) => {
            const res = await fetch(`data:${mimeType};base64,${b64}`);
            const blob = await res.blob();
            const item = new ClipboardItem({ [mimeType]: blob });
            await navigator.clipboard.write([item]);
          }, { b64: base64, mimeType: mime });

          const msgInput = page.locator('div[contenteditable="true"][role="textbox"]').first();
          await msgInput.click();
          await page.keyboard.press('Control+v');
          fileAttached = true;
          console.log('[IG DM] ✅ Strategy 3 clipboard paste successful');
          await page.waitForTimeout(3000);
        } catch (e) {
          console.warn('[IG DM] Strategy 3 clipboard paste failed:', e);
        }
      }

      await screenshot('04-after-attach');
    }

    // ── TYPE MESSAGE ───────────────────────────────────────────────────────────
    if (message && message.trim()) {
      const msgInput = page.locator('div[contenteditable="true"][role="textbox"]').first();
      await msgInput.waitFor({ state: 'visible', timeout: 6000 });
      await msgInput.click();
      await page.keyboard.type(message, { delay: 15 });
      await page.waitForTimeout(500);
    }

    await screenshot('05-before-send');

    // ── WAIT FOR SEND BUTTON TO BE READY (image may still be uploading) ────────
    // Poll until a send button is visible AND enabled (max 15s)
    let sendReady = false;
    let sendEl: import('playwright').Locator | null = null;

    const sendCandidateSelectors = [
      '[aria-label="Send"]',
      'div[role="button"][aria-label="Send"]',
      'button[aria-label="Send"]',
      'svg[aria-label="Send"]',
      '[data-testid*="send" i]',
    ];

    for (let attempt = 0; attempt < 15 && !sendReady; attempt++) {
      for (const sel of sendCandidateSelectors) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          sendEl = el;
          sendReady = true;
          console.log(`[IG DM] Send button found: ${sel}`);
          break;
        }
      }
      if (!sendReady) {
        await page.waitForTimeout(1000);
        console.log(`[IG DM] Waiting for send button... attempt ${attempt + 1}`);
      }
    }

    // ── CLICK SEND ─────────────────────────────────────────────────────────────
    let sent = false;

    // Method 1: click found element by selector
    if (sendEl && !sent) {
      try {
        await sendEl.click({ timeout: 4000 });
        sent = true;
        console.log('[IG DM] ✅ Sent via selector click');
      } catch (e) {
        console.log('[IG DM] Selector click failed:', e);
      }
    }

    // Method 2: JS evaluate — find & click the rightmost button near the textbox
    if (!sent) {
      const clicked = await page.evaluate(() => {
        const textbox = document.querySelector('div[contenteditable="true"][role="textbox"]');
        if (!textbox) return false;
        const tbRect = textbox.getBoundingClientRect();
        const candidates = Array.from(
          document.querySelectorAll('button, div[role="button"], span[role="button"]')
        ) as HTMLElement[];
        const rightOfInput = candidates.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= tbRect.right - 100
            && r.width > 0 && r.height > 0
            && r.top >= tbRect.top - 80
            && r.bottom <= tbRect.bottom + 80;
        });
        if (rightOfInput.length > 0) {
          rightOfInput[rightOfInput.length - 1].click();
          return true;
        }
        return false;
      });
      if (clicked) { sent = true; console.log('[IG DM] ✅ Sent via JS position click'); }
    }

    // Method 3: mouse.click at the bounding rect of the blue send button
    if (!sent) {
      try {
        // The send button is always at the far right of the compose bar
        // Get it via JS and click via mouse for maximum reliability
        const btnInfo = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('[aria-label], button, div[role="button"]')) as HTMLElement[];
          for (const el of all) {
            const r = el.getBoundingClientRect();
            // Blue send button is typically a small circular element (30-50px) at far right
            if (r.width > 0 && r.width < 60 && r.right > window.innerWidth - 80) {
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
          return null;
        });
        if (btnInfo) {
          await page.mouse.click(btnInfo.x, btnInfo.y);
          sent = true;
          console.log(`[IG DM] ✅ Sent via mouse.click at (${btnInfo.x}, ${btnInfo.y})`);
        }
      } catch (e) {
        console.log('[IG DM] Mouse click failed:', e);
      }
    }

    // Method 4: Enter key on the focused textbox
    if (!sent) {
      const msgInput = page.locator('div[contenteditable="true"][role="textbox"]').first();
      if (await msgInput.count() > 0) {
        await msgInput.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        sent = true;
        console.log('[IG DM] ✅ Sent via Enter key');
      }
    }

    console.log(`[IG DM] Send attempted=${sent}`);

    // ── VERIFY SEND (wait for textbox to clear) ────────────────────────────────
    await page.waitForTimeout(4000);
    await screenshot('06-sent');

    // Check if textbox is now empty (message was sent)
    const textboxEmpty = await page.evaluate(() => {
      const textbox = document.querySelector('div[contenteditable="true"][role="textbox"]');
      return textbox ? (textbox.textContent?.trim() || '').length === 0 : true;
    });
    console.log(`[IG DM] Textbox empty after send: ${textboxEmpty}`);


    const updatedCookies = await context.cookies();
    fs.writeFileSync(INSTAGRAM_COOKIES_FILE, JSON.stringify(updatedCookies, null, 2));
    await browser.close();
    if (savedFilePath) fs.unlink(savedFilePath, () => {});

    return NextResponse.json({ success: true, message: `Message sent to @${username}` });
  } catch (err) {
    await screenshot('error');
    await browser.close();
    if (savedFilePath) fs.unlink(savedFilePath, () => {});
    const error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
