# SKILL.md — Jenny's Installed Skill Modules

**RULE: Only assign or invoke skills listed here. Use `get_skills` to verify reality. Use `install_skill` to add from ClawHub.**

---

## Orchestration Skills

### `agent_creator`
**Purpose:** Full provisioning pipeline for new agents.
**Triggers:** "create agent", "bana agent", "need an agent", "setup", "provision"
**Tools Used:** `get_skills`, `get_config`
**Key Behavior:** NEVER stops after agent creation. Runs the full pipeline: Identity → Skills → Tools → Channels → Files → Cron.

### `task_manager`
**Purpose:** Manages mission lifecycle — creation, tracking, step decomposition.
**Triggers:** "what needs doing", "tasks", "prioritize", "workflow", "progress"
**Tools Used:** `get_tasks`, `get_agents`

### `system_awareness`
**Purpose:** Audits the full system health before any major action.
**Triggers:** "status", "audit", "check system", "health", "integrity", "kya chal raha hai"
**Tools Used:** `get_agents`, `get_config`, `get_channels`

### `agent_followup`
**Purpose:** Tracks and follows up on background agent progress.
**Triggers:** "follow up", "kya hua", "update on", "check on agent", "how is agent doing"
**Tools Used:** `get_agents`, `get_tasks`

### `notification_manager`
**Purpose:** Routes, presents, and resolves agent notifications. Ensures no findings are lost.
**Triggers:** "notifications", "pending approvals", "agent report", "DM agent found", "what did agent find", "check notifications"
**Tools Used:** `get_agent_output`, `agent_command`
**Key Behavior:**
1. Use `get_agent_output` to read the agent's latest findings.
2. Summarize findings in clean Hinglish in chat.
3. Direct user to `/notifications` for approval actions.
4. If user explicitly picks an option in chat → use `agent_command(execute, { text: selectedReply })`.
5. If user says abandon → use `agent_command(abandon)`.
6. NEVER push raw agent logs to chat. Summarize only.

### `confirmation_loop`
**Purpose:** Gates execution behind user approval. Required before all external actions.
**Triggers:** "confirm", "before proceeding", "check before", "final review"
**Tools Used:** None — logical gate only.

---

## Intelligence Skills

### `research`
**Purpose:** Web research and synthesis into actionable intelligence.
**Triggers:** "research", "search", "find out", "information on", "look up", "market trends"
**Tools Used:** `search_web`

### `social_manager`
**Purpose:** Develops and executes social media content strategy.
**Triggers:** "content strategy", "post plan", "instagram", "engagement", "social media"
**Tools Used:** `get_channels`, `caption_manager`, `platform_post`

### `dataset_creator`
**Purpose:** Builds training or reference datasets for sub-agents.
**Triggers:** "dataset", "training data", "create data", "build knowledge base"
**Tools Used:** `code_executor`

---

## Self-Enhancement Skills

### `clawhub_installer`
**Purpose:** Installs new skills from the ClawHub registry on command.
**Triggers:** "install skill", "clawhub", "download skill", "add capability"
**Tools Used:** `install_skill`

### `advanced_coding`
**Purpose:** Creates custom TypeScript tools and .md skill files from natural language descriptions.
**Triggers:** "create tool", "build tool", "write code", "new skill", "generate skill", "make a script", "code it"
**Tools Used:** `code_executor`