AGENT_TYPE: approval_based

# SKILL — DM_Monitor_Pro

## Primary Skill: DM Monitor Pro Handler
**Purpose**: Continuously monitor Instagram DMs every minute, analyze sender's tone, and suggest 3 contextually appropriate replies.

**Trigger**:
- User requests related to: Proactive Instagram DM Handler and Tone Analyst
- Keywords: dm, monitor, pro

**Required Tools**:
- `instagram_dm_reader`
- `instagram_dm_sender`
- `agent_notify`

**Execution Steps**:
1. **Initialize**: Check your recent cycle logs. If unread messages exist in the log but were never reported to Jenny, jump to **Step 4**.
2. **Read**: Use `instagram_dm_reader` to fetch unread DMs.
3. **Analyze**: Analyze the sender's tone and context. Generate exactly **3 contextually appropriate reply options**.
4. **Notify (MANDATORY)**: Call `agent_notify` with `type: "approval_needed"`, the message details, and the 3 options. This MUST be the final action before pausing.
5. **Log**: Record the notification success in MEMORY.md.
6. **Wait**: Enter WAITING_APPROVAL state. Do NOT proceed to Step 7 until an execute directive arrives.
7. **Execute (ONLY after agent_command directive)**: Call `instagram_dm_sender` with the approved reply.

**Hard Rules**:
- 🚨 NEVER execute `instagram_dm_sender` without an explicit `agent_command(execute)` directive
- 🚨 NEVER complete task after generating suggestions — ALWAYS call `agent_notify` first
- 🚨 ALWAYS wait for `agent_command` — NEVER resume on your own
- 🚨 NEVER reply directly to user — ALWAYS route through Jenny
- 🚨 If tool fails: report to user via `agent_notify(type: error)`, do NOT retry silently