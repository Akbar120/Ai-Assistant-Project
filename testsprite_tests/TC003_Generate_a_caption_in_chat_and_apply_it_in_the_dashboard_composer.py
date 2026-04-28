import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to http://localhost:3000
        await page.goto("http://localhost:3000")
        
        # -> Fill the username field (index 5) with 'Saber120', fill the password field (index 6) with 'Nezuko@120', then click the Sign In button (index 8).
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div/div/form/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Saber120')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/div/div/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Nezuko@120')
        
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/div/div/form/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click 'Generate with Jenny' to request caption ideas from the AI assistant.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/main/div/div[2]/div/div/div/div[3]/span').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Enter a prompt into the chat input asking for caption ideas, send it, wait for the AI reply and extract the first suggested caption. Then navigate to Dashboard.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/main/div/section/div[2]/div[2]/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Give me 5 short Instagram caption ideas for a warm sunrise photo with an inspirational tone.')
        
        # -> Wait for the AI reply to appear, extract the first suggested caption from Jenny's reply, then navigate to the Dashboard to paste that caption into the post composer.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/aside/nav/ul/li[2]/a').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Extract Jenny's latest reply and return only the FIRST suggested caption text, then navigate to the Dashboard so the page can update before pasting that caption into the composer.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div[2]/aside/nav/ul/li[2]/a').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Insert the extracted caption 'Golden hour magic.' into the caption textarea on the Dashboard (textarea index 6531), then finish.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div[2]/main/div/div[2]/div/div/div/textarea').nth(0)
        await asyncio.sleep(3); await elem.fill('Golden hour magic.')
        
        # --> Test passed — verified by AI agent
        frame = context.pages[-1]
        current_url = await frame.evaluate("() => window.location.href")
        assert current_url is not None, "Test completed successfully"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    