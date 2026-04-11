import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// ─── Twitter/X Automation ────────────────────────────────────────────────────

const TWITTER_COOKIES_FILE = path.join(SESSIONS_DIR, 'twitter-cookies.json');
const DISCORD_COOKIES_FILE = path.join(SESSIONS_DIR, 'discord-cookies.json');

export async function twitterLogin(): Promise<{ success: boolean; error?: string }> {
  ensureSessionsDir();
  try {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://x.com/i/flow/login');
    console.log('[Twitter] Opened login page. Waiting for user to log in...');

    // Wait until user is on home page (logged in)
    await page.waitForURL('**/home', { timeout: 300000 });

    const cookies = await context.cookies();
    fs.writeFileSync(TWITTER_COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('[Twitter] Saved session cookies');

    await browser.close();
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

export function hasTwitterSession(): boolean {
  return fs.existsSync(TWITTER_COOKIES_FILE);
}

async function getTwitterContext(): Promise<{ context: BrowserContext; page: Page }> {
  if (!fs.existsSync(TWITTER_COOKIES_FILE)) {
    throw new Error('No Twitter session found. Please log in first.');
  }

  const cookies = JSON.parse(fs.readFileSync(TWITTER_COOKIES_FILE, 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { context, page };
}

export interface TwitterPostOptions {
  text: string;
  mediaFiles?: string[]; // local file paths
  isThread?: boolean;
  threadParts?: string[];
}

export async function postToTwitter(options: TwitterPostOptions): Promise<{ success: boolean; tweetUrl?: string; error?: string }> {
  const { context, page } = await getTwitterContext();
  try {
    await page.goto('https://x.com/compose/tweet');
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });

    await page.click('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(options.text, { delay: 10 });

    // Upload media if provided
    if (options.mediaFiles && options.mediaFiles.length > 0) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(options.mediaFiles);
        await page.waitForTimeout(3000);
      }
    }

    // Submit tweet
    await page.click('[data-testid="tweetButtonInline"]');
    await page.waitForSelector('[data-testid="toast"]', { timeout: 10000 }).catch(() => null);

    // Save updated cookies
    const cookies = await context.cookies();
    fs.writeFileSync(TWITTER_COOKIES_FILE, JSON.stringify(cookies, null, 2));

    await context.browser()?.close();
    return { success: true };
  } catch (err: unknown) {
    await context.browser()?.close();
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

// ─── Instagram Automation ────────────────────────────────────────────────────

const INSTAGRAM_COOKIES_FILE = path.join(SESSIONS_DIR, 'instagram-cookies.json');

export async function instagramLogin(): Promise<{ success: boolean; error?: string }> {
  ensureSessionsDir();
  try {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.instagram.com/accounts/login/');
    console.log('[Instagram] Opened login page. Waiting for user to log in...');

    await page.waitForURL('https://www.instagram.com/', { timeout: 300000 });

    const cookies = await context.cookies();
    fs.writeFileSync(INSTAGRAM_COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('[Instagram] Saved session cookies');

    await browser.close();
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

export function hasInstagramSession(): boolean {
  return fs.existsSync(INSTAGRAM_COOKIES_FILE);
}

export interface InstagramPostOptions {
  caption: string;
  mediaFile: string; // local file path
  type: 'feed' | 'reel' | 'story';
}

export async function postToInstagram(options: InstagramPostOptions): Promise<{ success: boolean; error?: string }> {
  if (!fs.existsSync(INSTAGRAM_COOKIES_FILE)) {
    return { success: false, error: 'No Instagram session found. Please log in first.' };
  }

  const cookies = JSON.parse(fs.readFileSync(INSTAGRAM_COOKIES_FILE, 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  await context.addCookies(cookies);
  const page = await context.newPage();

  // Helper: save debug screenshot to sessions folder
  const screenshot = async (name: string) => {
    try {
      await page.screenshot({
        path: path.join(process.cwd(), 'sessions', `ig-${name}.png`),
        fullPage: true,
      });
    } catch (_) {}
  };

  try {
    // ── Load Instagram home ──────────────────────────────────────────────────
    await page.goto('https://www.instagram.com/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3500);
    await screenshot('01-home');

    // ── Dismiss popups (text-based only — no blind coordinate clicks) ─────────
    for (let i = 0; i < 2; i++) {
      await page.waitForTimeout(800);
      for (const t of ['Not Now', 'Not now', 'Cancel']) {
        const loc = page.getByRole('button', { name: t, exact: true });
        if (await loc.count() > 0) await loc.first().click().catch(() => {});
      }
      const notNowLink = page.getByRole('link', { name: 'Not now' });
      if (await notNowLink.count() > 0) await notNowLink.first().click().catch(() => {});
    }

    // Close any accidental story viewer
    const closeSvg = page.locator('svg[aria-label="Close"]');
    if (await closeSvg.count() > 0) {
      await closeSvg.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }

    await screenshot('02-after-popups');

    // ── Click "Create" / "New post" in the left sidebar ──────────────────────
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
    let clickedCreate = false;

    // Walk up from SVG to the first clickable ancestor (the <a> link)
    for (const label of ['New post', 'Create']) {
      const svgExists = await page.locator(`svg[aria-label="${label}"]`).count() > 0;
      if (svgExists) {
        const clicked = await page.evaluate((svgLabel: string) => {
          const all = Array.from(document.querySelectorAll('svg'));
          const svg = all.find(s => s.getAttribute('aria-label') === svgLabel);
          if (!svg) return false;
          let el: HTMLElement | null = svg as unknown as HTMLElement;
          while (el && el.tagName !== 'BODY') {
            const tag = el.tagName;
            const role = el.getAttribute('role');
            if (tag === 'A' || tag === 'BUTTON' || role === 'button' || role === 'link') {
              el.click();
              return true;
            }
            el = el.parentElement;
          }
          (svg as unknown as HTMLElement).click();
          return true;
        }, label);
        if (clicked) { clickedCreate = true; break; }
      }
    }

    // Fallback: Playwright role locators
    if (!clickedCreate) {
      for (const loc of [
        page.getByRole('link', { name: 'Create' }),
        page.getByRole('button', { name: 'New post' }),
      ]) {
        if (await loc.count() > 0) {
          await loc.first().click({ force: true }).catch(() => {});
          clickedCreate = true;
          break;
        }
      }
    }

    if (!clickedCreate) {
      await screenshot('error-create-btn');
      throw new Error('Could not find or click the Create/New post button in the sidebar.');
    }

    await page.waitForTimeout(1500);
    await screenshot('03-after-create-click');

    // ── Handle "Post / Reel / Story" submenu if it appears ───────────────────
    const postMenuOptions = [
      page.getByRole('menuitem', { name: 'Post' }),
      page.locator('div[role="dialog"]').getByText('Post', { exact: true }),
      page.getByText('Post', { exact: true }),
    ];
    for (const loc of postMenuOptions) {
      if (await loc.count() > 0) {
        await loc.first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
        break;
      }
    }

    await screenshot('04-after-post-menu');

    // ── Wait for the upload modal and click "Select from computer" ────────────
    const selectBtn = page.getByRole('button', { name: 'Select from computer' });
    try {
      await selectBtn.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      await screenshot('error-no-modal');
      throw new Error('Upload modal did not appear — "Select from computer" button not found.');
    }
    await selectBtn.first().click();

    // ── Upload the file ───────────────────────────────────────────────────────
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(options.mediaFile);
    await page.waitForTimeout(4000); // let IG process/crop preview
    await screenshot('05-after-upload');

    // ── Click Next through the wizard (Crop → Filter/Edit → Caption) ──────────
    const clickNextBtn = async (): Promise<boolean> => {
      for (const loc of [
        page.getByRole('button', { name: 'Next' }),
        page.locator('div[role="button"]').filter({ hasText: /^Next$/ }),
      ]) {
        if (await loc.count() > 0) {
          await loc.first().click({ force: true });
          return true;
        }
      }
      return false;
    };

    await clickNextBtn();
    await page.waitForTimeout(2000);
    await screenshot('06-after-next1');

    await clickNextBtn();
    await page.waitForTimeout(2000);
    await screenshot('07-after-next2');

    // ── Fill in the caption ───────────────────────────────────────────────────
    if (options.caption) {
      for (const sel of [
        'div[aria-label="Write a caption..."]',
        'textarea[aria-label="Write a caption..."]',
        'div[data-lexical-editor="true"]',
        'div[contenteditable="true"]',
      ]) {
        const el = page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click({ force: true });
          await page.keyboard.type(options.caption, { delay: 20 });
          break;
        }
      }
    }

    await page.waitForTimeout(1000);
    await screenshot('08-before-share');

    // ── Click the Share button ────────────────────────────────────────────────
    let shared = false;
    for (const loc of [
      page.getByRole('button', { name: 'Share' }),
      page.locator('div[role="button"]').filter({ hasText: /^Share$/ }),
    ]) {
      if (await loc.count() > 0) {
        await loc.first().click({ force: true });
        shared = true;
        break;
      }
    }

    if (!shared) {
      await screenshot('error-no-share-btn');
      throw new Error('Share button was not found. The wizard may not have reached the caption step.');
    }

    // ── Wait for Instagram's post-published confirmation ──────────────────────
    // IG shows "Your post has been shared." text, or closes the modal and goes to feed
    let postConfirmed = false;

    try {
      // Primary: success message text in the DOM
      await page.waitForSelector(
        '[role="dialog"] >> text=/your post has been shared|post shared/i',
        { timeout: 25000 }
      );
      postConfirmed = true;
    } catch {
      // Secondary: redirected back to main feed
      try {
        await page.waitForURL('https://www.instagram.com/', { timeout: 10000 });
        postConfirmed = true;
      } catch {
        // Tertiary: the Share modal closed (wizard finished)
        const shareStillVisible = await page.getByRole('button', { name: 'Share' }).count() > 0;
        if (!shareStillVisible) postConfirmed = true;
      }
    }

    await screenshot('09-after-share');

    if (!postConfirmed) {
      throw new Error(
        'Instagram did not confirm the post was published. ' +
        'Check ig-09-after-share.png in the sessions folder.'
      );
    }

    // ── Persist refreshed session cookies ────────────────────────────────────
    const updatedCookies = await context.cookies();
    fs.writeFileSync(INSTAGRAM_COOKIES_FILE, JSON.stringify(updatedCookies, null, 2));

    await browser.close();
    return { success: true };
  } catch (err: unknown) {
    await screenshot('error-final');
    await browser.close();
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

// ─── Discord Web Automation ──────────────────────────────────────────────────

export async function discordLogin(): Promise<{ success: boolean; error?: string }> {
  ensureSessionsDir();
  try {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://discord.com/login');
    console.log('[Discord] Opened login page. Waiting for user to log in...');

    // Wait until user is on channels/@me page (logged in)
    await page.waitForURL('https://discord.com/channels/@me**', { timeout: 300000 });

    const cookies = await context.cookies();
    fs.writeFileSync(DISCORD_COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('[Discord] Saved session cookies');

    await browser.close();
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

export function hasDiscordSession(): boolean {
  return fs.existsSync(DISCORD_COOKIES_FILE);
}

export function clearSession(platform: 'twitter' | 'instagram' | 'discord') {
  const file = platform === 'twitter' ? TWITTER_COOKIES_FILE : 
               platform === 'discord' ? DISCORD_COOKIES_FILE : INSTAGRAM_COOKIES_FILE;
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
