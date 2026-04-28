# Social Multi Poster

AI-powered multi-platform social media dashboard with an intelligent AI agent. Post to Discord, X/Twitter, Instagram, and manage everything from one place.

## Quick Start

1. **Start the app:**
   ```
   start.bat
   ```
   Or manually: `npm run dev` then open http://localhost:3000

2. **Set up Ollama AI** (required for the AI agent):
   - Download from https://ollama.com
   - Run: `ollama pull llama3.2-vision`
   - Ollama runs automatically in the background on port 11434

3. **Connect your platforms** at http://localhost:3000/accounts:
   - **Discord**: Follow the built-in setup wizard (creates a free Discord bot)
   - **X/Twitter**: Click "Connect X" — browser opens for you to log in
   - **Instagram**: Click "Connect Instagram" — browser opens for you to log in

## Features

### 🤖 AI Agent (Jenny)
- AI-powered social media assistant powered by local Ollama (no API keys, no cost)
- Chat with Jenny to craft perfect captions, add hashtags, get engagement tips
- Real-time thought process visualization
- Voice input support with Text-to-Speech

### 📝 Compose & Schedule
- Write captions with AI assistance (generate, add hashtags, add emoji)
- Schedule posts for later with cron
- Media upload (images & videos, up to 4 files, 50MB each)
- Post preview per platform

### 💬 Multi-Platform Posting
- **Discord**: Post to servers/channels with bot integration
- **X/Twitter**: Post via browser automation (Playwright)
- **Instagram**: Post via browser automation (Playwright)
- Platform-specific character limits enforced

### 🔔 Notifications
- View and respond to DMs from Instagram and Discord
- Real-time unread message tracking
- Quick DM compose and send capabilities

### ⚙️ Advanced Features
- **Skills System**: Install and manage custom agent capabilities
- **Agents**: Create and manage multiple AI agents
- **Improvements**: Propose and apply system improvements
- **Voice Widget**: Text-to-Speech for AI responses

## Pages

| Page | Description |
|------|-------------|
| `/dashboard` | Create posts, select platforms, preview, schedule |
| `/chat` | Chat with AI agent (Jenny) |
| `/accounts` | Connect social media accounts |
| `/notifications` | View and respond to DMs |
| `/scheduled` | Manage scheduled posts |
| `/tasks` | View and manage tasks |
| `/agents` | Manage AI agents |
| `/skills` | Install and manage skills |
| `/improvements` | Propose and apply improvements |
| `/voice-widget` | Voice output settings |

## Security

- Passwords are NEVER stored
- Session cookies are saved in the `sessions/` folder (local only)
- All AI processing runs locally via Ollama
- Discord bot runs locally in your server

## Optional: PocketBase

PocketBase is optional for local use. Download `pocketbase.exe` from https://pocketbase.io 
and place it in the `pocketbase/` folder.

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **AI**: Ollama (llama3.2-vision)
- **Browser Automation**: Playwright
- **Database**: PocketBase (optional)
- **Desktop**: Electron (optional)