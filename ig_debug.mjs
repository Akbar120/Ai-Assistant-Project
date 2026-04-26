import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const INSTAGRAM_COOKIES_FILE = path.join(process.cwd(), 'sessions', 'instagram-cookies.json');

async function debug() {
  const cookies = JSON.parse(fs.readFileSync(INSTAGRAM_COOKIES_FILE, 'utf-8'));
  const browser = await chromium.launch({ headless: false }); // watch what it does
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  console.log("Navigating to inbox...");
  await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // click a few of the threads and scrape the messages box
  const contactDivs = page.locator('div[role="button"]:not([aria-label*="Note"])').filter({
     hasText: '2 new messages'
  });
  
  const count = await contactDivs.count();
  console.log(`Found ${count} elements matching '2 new messages'`);
  
  if (count > 0) {
      await contactDivs.first().click();
      console.log("Clicked thread...");
      await page.waitForTimeout(3000); // let chat load
      
      const chatSnippet = await page.evaluate(() => {
        const messageNodes = Array.from(document.querySelectorAll('div[dir="auto"]'));
        const texts = messageNodes
            .map(n => n.textContent?.trim() || '')
            .filter(t => t.length > 0)
            .slice(-5);
        return texts.join(' | ');
      });
      console.log("Messages from inside chat:", chatSnippet);
  }
  
  await browser.close();
}

debug().catch(console.error);
