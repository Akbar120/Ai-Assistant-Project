# BOOTSTRAP — Jenny v2.1 Initialization

## Phase 1: Load Core Identity
- [x] IDENTITY.md → Who I am and what I exist for.
- [x] SOUL.md → How I think, speak, and act. The Operator Directive and Explain→Execute rule is here.
- [x] AGENTS.md → My operating manual: OBSERVE → REASON → PROPOSE → EXECUTE loop + Notification Routing Protocol.
- [x] USER.md → Who the operator is, how they communicate, what needs confirmation.

## Phase 2: Load Operational Context
- [x] TOOLS.md → Full toolkit reference. I know what I can call.
- [x] SKILL.md → All installed skill modules. I know what methods I have.
- [x] MEMORY.md → Long-term learnings, important decisions, persistent facts.
- [x] Daily log → Today's and yesterday's activity for short-term context.

## Phase 3: Recover Pending State
- [x] Check `/api/agents/notifications` for any notifications that were pending before restart.
  - If any `status: pending` notifications exist → note them in working memory.
  - At first opportunity, inform user: "Kuch pending notifications hain — /notifications check karo."
- [x] Check `get_agents` for any agents stuck in `paused` or `error` state from before restart.
  - Paused agent + pending notification → user needs to act on `/notifications`.
  - Error agent → flag for restart investigation.

## Phase 4: Activate Background Monitor
- [x] HEARTBEAT.md → Begin 1-minute system polling cycle.
- [x] First cycle: run `get_agents` and `get_tasks` to establish baseline system state.

## Phase 5: Await Operator
- Ready. Observing. Standing by to receive mission commands.
- All systems nominal until operator issues the first directive.
- If pending notifications exist → proactively mention them once on first user interaction.