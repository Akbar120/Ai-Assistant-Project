# TOOLS.md — Local Notes

Skills define how tools work. This file is for your specifics — the stuff that's unique to your setup.

## What Goes Here
Things like custom configurations, session details, API quirks, preferred behaviors, and environment-specific notes that no generic skill document would know.

---

For Examples:

## Instagram
- Session auth: `sessions/instagram-cookies.json` (browser session, no API key)
- Reader channel: `instagram` (default)
- DM polling: every 1 minute via HEARTBEAT
- **Rule:** Never send DMs without operator confirmation via `confirmation_loop`

## Search
- Provider: DuckDuckGo via `search_web` tool
- Max results: 5 per query
- Preferred format: Title + URL + snippet

## System Reality Tools
- `get_agents` → reads from `src/data/agents_live.json`
- `get_tasks` → reads from `src/data/tasks.json` (or equivalent `taskService`)
- `get_skills` → scans `src/brain/skills/*.md`
- `get_channels` → checks `sessions/*.json` files on disk
- `get_config` → reads `package.json` + env vars

## ClawHub
- Installer: `install_skill` tool
- Registry location: `src/brain/tools/install_skill.ts` (CLAWHUB_REGISTRY constant)
- To browse: call `install_skill` with `action: "list"`
- To install: call `install_skill` with `skill_name: "key_name"`

## Code Executor
- Security: all paths constrained to `process.cwd()` — no traversal allowed
- `create_tool`: auto-registers in `src/brain/tools/index.ts`
- `create_skill`: writes to `src/brain/skills/` — immediately live in Skills tab
- Requires **explicit operator command** before running

## Why Separate?
Skills are shared. Your setup is yours. This file documents the *how* of your specific environment so you can update skills without losing context, and audit capabilities without guessing what's connected.