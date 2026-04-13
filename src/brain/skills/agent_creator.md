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
- `create_agent`
- `update_agent`
- `create_task`
- `update_task`
- `list_skills`
- `create_skill`
- `list_tools`
- `connect_channel`
- `create_file`
- `create_cron`

## 🚨 Core Rule
**NEVER STOP after agent creation.** Always run the FULL setup pipeline.

---

## 🔁 Execution Flow

### Step 0: Initialize Task
Create a task:
```json
{
  "title": "Agent Provisioning",
  "status": "processing",
  "progress": 0
}
```

### Step 1: Create Agent
- Call `create_agent({ name, goal, description })`
- Log: "Agent created successfully"
- Update task → progress: 10

### Step 2: Analyze Requirements
Break user intent into:
- Required Skills
- Required Tools
- Required Channels
- Required Files
- Required Cron Jobs

### Step 3: Skills Assignment
- Call `list_skills` and check existing skills.
- If skill exists → attach.
- If NOT → `create_skill`.
- **Explain WHY creating**: Example: "Creating instagram_dm_handler skill because DM automation is required."
- Attach skills to agent.
- Update task → progress: 30

### Step 4: Tools Assignment
- Call `list_tools`.
- Attach required tools (e.g., browser automation, messaging tool, scheduler).
- If missing → ask user OR suggest skill.
- Update task → progress: 45

### Step 5: Channel Connection
- If platform required (Instagram, Discord, etc):
- Check: already connected?
- If yes → attach.
- If no → ask permission: "Instagram access required. Connect karu?"
- Update task → progress: 60

### Step 6: File Creation
Create internal files:
- `/agents/{agent_name}/memory.json`
- `/agents/{agent_name}/config.json`
- `/agents/{agent_name}/logs.json`
- If dataset needed: → trigger `dataset_creator` skill.
- Update task → progress: 75

### Step 7: Cron Jobs Setup
- If automation needed: call `create_cron({ interval: "1 minute", task: "check_instagram_dms" })`.
- Update task → progress: 90

### Step 8: Final Validation
Check:
- Skills assigned ✅
- Tools attached ✅
- Channels connected ✅
- Files created ✅
- Cron running ✅
- If anything missing → go back to `confirmation_loop`.

### Step 9: Complete Task
- `update_task({ status: "completed", progress: 100 })`

---

## 🧠 Smart Behaviors

### 🔹 Skill Reuse First
Always check existing skills before creating new ones.

### 🔹 Explain Creation
When creating a skill, ALWAYS explain:
1. Why needed
2. What it does

### 🔹 Confirmation Loop Integration
If missing access, tool, or intent is unclear → **ask user BEFORE continuing**.

### 🔹 Multi-Agent Support
If task too complex:
- Create helper agent
- Assign subtask

---

## 📦 Output Format (IMPORTANT)
❌ NEVER return raw JSON.
❌ NEVER expose `tool_call` format.

✅ Always return **CLEAN UI response**:
> "Agent 'Instagram DM Handler' successfully created ✅
> 
> **Setup Progress:**
> ✔ Skills assigned (DM handler, tone analyzer)
> ✔ Tools attached (browser automation, scheduler)
> ✔ Instagram connected
> ✔ Background monitoring enabled (1 min interval)
> 
> Your agent is now ready 🚀
> Next step: Test karna hai ya deploy?"

---

## 🚫 Strict Rules
- Never stop mid-process.
- Never leave agent empty.
- Never assume tools exist.
- Never skip task logging.
- Never expose raw JSON.

## 🔥 Special Capability
If user says: "complex agent bana" → automatically break into sub-modules, create helper agents if needed, and create datasets if required.
