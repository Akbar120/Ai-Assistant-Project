# Skill: Confirmation Loop & Task Completion

## Description
This skill ensures that no task is executed with incomplete or ambiguous information. It creates a structured loop where the agent identifies missing data, requests clarification, and resumes execution only after sufficient input is provided.

## Tool Access
- `manage_agent` (was: `run_agent` — for orchestrating other agents)
- `code_executor` (was: `create_skill` — for creating new capabilities)
- Any task-specific tools (conditional)

> Note: Asking the user for clarification is done via normal conversation — no `ask_user` tool is needed. Jenny asks directly in chat.

## Core Purpose
- Prevent broken executions
- Gather missing inputs
- Enable dynamic capability expansion (new skills/tools)
- Maintain control with the user

---

## 🔍 Missing Information Detection

The agent must check for:

1. Required parameters (username, message, platform, etc.)
2. Permissions (API access, account linking)
3. Tool availability (required skill/tool exists or not)
4. Context gaps (unclear intent, vague instructions)

---

## 🔁 Execution Loop

### Step 1: Analyze Task
- Break task into required components

### Step 2: Detect Missing Pieces
If ANY missing → DO NOT EXECUTE

### Step 3: Ask for Clarification

Use structured questions:

{
  "type": "clarification",
  "missing": [
    "target username",
    "message content",
    "platform access"
  ],
  "question": "Mujhe ye info chahiye task complete karne ke liye"
}

---

### Step 4: Wait State
- Pause execution
- Store task context
- Resume ONLY after response

---

### Step 5: Resume Task
- Merge new info
- Re-evaluate completeness

---

### Step 6: Repeat Loop
- Continue until:
  ✅ Task complete  
  ❌ User cancels  
  ⚠️ Timeout / no response  

---

## 🧠 Smart Behaviors

### 1. Suggest Skill Creation
If required capability doesn't exist:

{
  "type": "suggestion",
  "message": "Is task ke liye ek naya skill banana padega. Bana du?"
}

If user says YES → call `code_executor` with `operation: "create_skill"`

---

### 2. Suggest Tool Access
If permission missing:

{
  "type": "permission_request",
  "message": "Instagram access required hai. Connect karna hai?"
}

---

### 3. Multi-Agent Escalation
If another agent is better suited:

{
  "type": "handoff",
  "target_agent": "research_agent",
  "reason": "Task requires deep research"
}

Use `manage_agent` to delegate to that agent.

---

## 🚫 Rules

- NEVER execute incomplete tasks
- NEVER assume missing data
- ALWAYS confirm before critical actions
- NEVER loop infinitely (max 3 attempts per missing item)

---

## 📦 Output Format

Always structured:

{
  "status": "waiting_for_input",
  "missing_fields": [...],
  "next_action": "ask_user_in_chat"
}

OR

{
  "status": "ready",
  "next_action": "execute_task"
}

---

## 🔥 Special Behavior

If user ignores:
→ Ask 1 reminder  
→ Then mark task as "abandoned"

---

## 🎯 Example Flow

User: "Sohail ko message bhej"

Agent:
→ Missing message content

Reply:
"Message kya bhejna hai?"

User: "Bol busy hu"

→ Execute DM

---

User: "Instagram DM agent bana"

Agent:
→ Missing access + tools

Reply:
"Instagram access chahiye + DM skill banana padega, continue karu?"

---

## 🧩 Integration

This skill should wrap ALL major actions before execution.

---

## 🧠 Capability Awareness & Reuse Logic (CRITICAL)

Before asking the user for anything, the agent MUST internally verify existing capabilities.

### Step 0: Pre-Check (MANDATORY BEFORE ANY QUESTION)

The agent must check:

1. Existing Skills:
   - Kya required functionality already kisi skill me exist karti hai?
   - Call `get_skills` to verify.

2. Available Tools:
   - Kya direct tool execution possible hai bina naya skill banaye?
   - Example: DM bhejna → existing `instagram_dm_sender` tool ho sakta hai

3. Other Agents:
   - Kya koi existing agent already ye kaam karta hai?
   - Call `get_agents` to verify.

---

## 🔍 Decision Logic

### Case 1: Existing Skill Available
→ USE IT directly  
→ DO NOT ask user unnecessarily  

Example:
"Ye kaam already 'Instagram DM Skill' se ho sakta hai, main use kar raha hoon."

---

### Case 2: Tool Available but No Skill
→ Direct tool usage OR suggest wrapping into reusable skill  

Example:
"Iske liye direct tool available hai, par agar aap chaho to isko reusable skill bana sakte hain."

---

### Case 3: Nothing Exists (Skill Missing)

ONLY THEN suggest new skill creation via `code_executor`.

---

## 🧠 Skill Creation Justification (MANDATORY)

When suggesting a new skill, agent MUST explain:

{
  "type": "skill_suggestion",
  "skill_name": "instagram_dm_handler",
  "reason": "Currently koi existing skill nahi hai jo Instagram DMs ko monitor aur auto-reply suggestion de sake.",
  "benefit": "Ye skill future me automatic DM handling aur response suggestions enable karega."
}

---

## 🧠 Smart Suggestion Rules

- NEVER suggest skill if:
  ❌ Existing skill already works  
  ❌ Tool already handles it  
  ❌ Another agent can handle it  

- ONLY suggest skill if:
  ✅ Repeated task hai  
  ✅ Complex logic required hai  
  ✅ Automation future me useful hai  

---

## 🔁 Updated Confirmation Flow

Before asking user:

1. Check Skills via `get_skills` ✅  
2. Check Tools ✅  
3. Check Agents via `get_agents` ✅  

THEN:

- If possible → execute  
- If partial → ask missing info  
- If not possible → suggest skill (with reason) using `code_executor`

---

## 🚫 Strict Rules (UPDATED)

- NEVER ask user without checking existing system capabilities
- NEVER suggest redundant skills
- ALWAYS justify why new skill is needed
- ALWAYS prefer reuse over creation
