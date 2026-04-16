🧠 Skill: Agent Creator (Full Provisioning Engine)

## Description
This skill is responsible for creating and FULLY configuring an agent — not just spawning it. It ensures that an agent is not only named but also functionally equipped with skills, tools, and social connectivity.

## Core Purpose
- Agent is created
- Skills are assigned
- Tools are attached
- Channels are connected
- Files are generated
- Cron jobs are configured
- Tasks are tracked

⚠️ **Agent creation is NOT complete until ALL steps are done.**

## 🔐 Tool Access
- `get_skills` (was: `list_skills`)
- `code_executor` (was: `create_skill`, `create_file`, `create_tool`)
- `cron` (was: `create_cron`)
- `get_agents`
- `manage_agent`
- `get_tasks`

> Note: Agent spawn, workspace provisioning, and channel connection are handled automatically by the orchestrator backend — no separate tool call needed for those.

## 🚨 Core Rule
**NEVER STOP after agent creation.** Always run the FULL setup pipeline.

---

## 🔁 Execution Flow

### Step 0: Initialize Task
Create a task with status `processing` and progress `0`.

### Step 1: Create Agent
- The orchestrator creates the agent automatically upon user approval.
- Log: "Agent created successfully"
- Progress: 10

### Step 2: Analyze Requirements
Break user intent into:
- Required Skills
- Required Tools
- Required Channels
- Required Cron Jobs

### Step 3: Skills Assignment
- Call `get_skills` and check existing skills.
- If skill exists → attach.
- If NOT → call `code_executor` with `operation: "create_skill"`, `name`, `description`.
- **Explain WHY creating**: Example: "Creating instagram_dm_handler skill because DM automation is required."
- Progress: 30

### Step 4: Tools Assignment
- Review the agent's tool list.
- If missing required tool → suggest or use `code_executor` to create it.
- Progress: 45

### Step 5: Channel Connection
- If platform required (Instagram, Discord, etc):
- Check connectivity via `get_channels`.
- If not connected → ask permission: "Instagram access required. Connect karu?"
- Progress: 60

### Step 6: File Creation
Create internal files using `code_executor`:
- `workspace/agents/{name}/BOOTSTRAP.md` → MUST INSTRUCT: "Read AGENTS.md, SKILL.md, HEARTBEAT.md. Understand mission. Build execution plan. Identify tools."
- If dataset needed: → trigger `dataset_creator` skill.
- Progress: 75

### Step 7: Cron Jobs Setup
- If automation needed: call `cron` tool with interval and task description.
- Progress: 90

### Step 8: Final Validation
Check:
- Skills assigned ✅
- Tools attached ✅
- Channels connected ✅
- Files created ✅
- Cron running ✅
- If anything missing → go back to confirmation step.

### Step 9: Complete Task
- Update task to `completed`, progress `100`.

---

## 🧠 Smart Behaviors

### 🔹 Skill Reuse First
Always call `get_skills` before creating new ones.

### 🔹 Explain Creation
When creating a skill, ALWAYS explain:
1. Why needed
2. What it does

### 🔹 Confirmation Loop Integration
If missing access, tool, or intent is unclear → **ask user BEFORE continuing**.

### 🔹 Multi-Agent Support
If task too complex:
- Use `manage_agent` to orchestrate helper agents

---

## 📦 Output Format (IMPORTANT)
❌ NEVER return raw JSON.
❌ NEVER expose `tool_call` format.

✅ Always return **CLEAN UI response**:
> "Agent 'Instagram DM Handler' successfully created ✅
> 
> **Setup Progress:**
> ✔ Skills assigned (DM handler, tone analyzer)
> ✔ Tools attached (instagram_dm_reader, agent_notify)
> ✔ Instagram connected
> ✔ Background monitoring enabled (1 min interval)
> 
> Your agent is now ready 🚀
> Next step: Test karna hai ya deploy?"

---

## 🚫 Strict Rules
- Never stop mid-process.
- Never leave agent empty.
- Never assume tools exist — always verify with `get_skills`.
- Never skip task logging.
- Never expose raw JSON.

## 🔥 Special Capability
If user says: "complex agent bana" → automatically break into sub-modules, use `manage_agent` for orchestration, and create datasets if required.
