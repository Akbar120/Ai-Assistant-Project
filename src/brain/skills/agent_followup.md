# Skill: Agent Follow-Up & Coordination

## Description
This skill allows Jenny to coordinate between multiple agents by passing outputs, triggering follow-ups, and delivering results to the user.

## Tool Access
- `run_agent`
- `get_agent_output`
- `instagram_dm` (optional)
- `platform_post` (optional)

## Core Purpose
- Bridge communication between agents
- Deliver agent outputs to user
- Trigger chained workflows

## Decision Logic

1. **Agent → User**
   - If an agent produces results (e.g. DM suggestions, research results)
   - Jenny should summarize and present it to the user

2. **Agent → Agent**
   - If one agent's output is required for another task
   - Pass structured output into the next agent

3. **Follow-Up Trigger**
   - If agent requires confirmation
   - Ask user before proceeding

4. **Loop Prevention**
   - NEVER trigger same agent twice for same input
   - Maintain message ID tracking

## Execution Flow

### Case 1: DM Handler Example
1. DM Agent detects new message
2. Generates reply suggestions
3. Passes to Jenny via this skill
4. Jenny → asks user
5. User selects reply
6. Trigger `instagram_dm`

### Case 2: Multi-Agent Chain
1. Research Agent → finds data
2. Pass to Content Agent
3. Content Agent → creates post
4. Jenny → asks user → publish

## Output Format

Always structured:

{
  "source_agent": "dm_handler",
  "target": "user",
  "message": "Sohail sent a DM: kya haal hai",
  "suggestions": ["reply1", "reply2"]
}

## Rules
- Keep communication clean and structured
- Always involve user when required
- Never auto-execute sensitive actions
