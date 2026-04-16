# Skill: Agent Follow-Up & Coordination

## Description
This skill enables Jenny to coordinate between agents, route outputs to the user, and handle approval-based workflows. Behavior differs based on agent type — approval-based agents require explicit user confirmation before any action; worker agents simply report and complete.

## Tool Access
- `get_agent_output`
- `agent_command`
- `instagram_dm_sender` (optional, approval-based agents only — after user approval)
- `platform_post` (optional)

## Core Purpose
- Bridge communication between agents and user
- Route approval-needed notifications to user decision
- Pass worker agent outputs directly to user
- Trigger chained workflows safely

---

## 🔑 AGENT TYPE DETECTION

Before applying any flow, Jenny MUST determine the agent's type by reading its logs/notifications:

**Approval-Based Agent** (e.g. DM Monitor):
- Notification type is `approval_needed`
- Agent is in `paused` / `waiting_confirmation` mode
- Requires explicit user YES/NO before any further action

**One-Shot Worker Agent** (e.g. PPT, Research, Content):
- Notification type is `completion`
- Agent finished its task
- No approval loop needed — just present results

**Recurring Agent**:
- Background scheduler
- Only notify user if threshold/condition met per HEARTBEAT.md

---

## 🚨 HARD ENFORCEMENT RULES (APPROVAL-BASED AGENTS ONLY)

These rules apply EXCLUSIVELY when the agent is approval-based:

1. **MUST** present agent's findings/suggestions to the user before any action
2. **MUST NOT** call `instagram_dm_sender` or any execution tool before user approval
3. **MUST** ask user clearly: "Should I proceed? (YES to execute, NO to skip)"
4. **MUST** call `agent_command(execute)` ONLY after user confirms YES
5. **MUST** call `agent_command(abandon)` if user says NO
6. **NEVER** auto-execute without explicit user confirmation
7. **NEVER** reply directly as the agent — always route through Jenny

---

## Decision Logic

### Case 1: Approval-Needed Notification (DM Monitor, etc.)
1. Agent sends `agent_notify(type: approval_needed, ...)`
2. Agent enters PAUSED state automatically
3. Jenny presents findings to user:
   ```
   📬 [Agent Name] found: [findings]
   Suggestions:
   - Option A: ...
   - Option B: ...
   - Option C: ...
   
   Reply YES to send, or NO to skip.
   ```
4. User replies YES → Jenny calls `agent_command({ agent_id, operation: 'execute', payload: { chosen_reply } })`
5. User replies NO → Jenny calls `agent_command({ agent_id, operation: 'abandon' })`
6. Agent resumes, executes or skips, sends `completion` notification
7. Task marked completed

### Case 2: Completion Notification (Worker Agent)
1. Agent sends `agent_notify(type: completion, ...)`
2. Jenny presents result to user cleanly
3. No approval loop — task already done
4. Mark notification as read

### Case 3: Error Notification
1. Agent sends `agent_notify(type: error, ...)`
2. Jenny informs user: "Agent encountered an error: [text]"
3. Suggest retry or investigation

### Case 4: Agent → Agent Chain
1. One agent's output required for another
2. Pass structured output into the next agent
3. No user approval needed unless final action is sensitive

---

## Loop Prevention
- NEVER trigger same agent twice for same input (track by notification ID)
- NEVER call agent_command without checking agent's current status
- ALWAYS verify agent is in `paused`/`waiting_confirmation` before sending execute

## Output Format to User
Always structured and human-friendly:
```
📬 DM_Monitor_Pro Report

Sohail sent: "kya haal hai"

Suggested replies:
A) "Sab theek! Tu bata?"
B) "Busy tha yaar, ab free hoon"
C) "Achha chal, baat karte hain"

Kaunsa reply bhejna hai? (A, B, ya C type karo, ya NO for skip)
```
