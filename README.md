# Social Multi Poster

AI-powered multi-platform social media dashboard. Post to Discord, X/Twitter, and Instagram from one place.

## Quick Start

1. **Start the app:**
   ```
   start.bat
   ```
   Or manually: `npm run dev` then open http://localhost:3000

2. **Set up Ollama AI** (required for the chatbot):
   - Download from https://ollama.com
   - Run: `ollama pull llama3.2-vision`
   - Ollama runs automatically in the background on port 11434

3. **Connect your platforms** at http://localhost:3000/accounts:
   - **Discord**: Follow the built-in setup wizard (creates a free Discord bot)
   - **X/Twitter**: Click "Connect X" — browser opens for you to log in
   - **Instagram**: Click "Connect Instagram" — browser opens for you to log in

## Features

- 🤖 AI chatbot powered by local Ollama (no API keys, no cost)
- 💬 Discord bot integration (free Discord API)
- 🐦 X/Twitter posting via browser automation (Playwright)
- 📸 Instagram posting via browser automation (Playwright)
- ⏱ Post scheduling with cron
- 🖼️ Media upload (images & videos)
- 👁 Post preview per platform
- 🔐 No passwords stored — only session cookies saved locally

## Optional: PocketBase

PocketBase is optional for local use. Download `pocketbase.exe` from https://pocketbase.io 
and place it in the `pocketbase/` folder.

## Security

- Passwords are NEVER stored
- Session cookies are saved in the `sessions/` folder (local only)
- All AI processing runs locally via Ollama
