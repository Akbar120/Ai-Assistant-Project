# HEARTBEAT — Jenny System Monitor

**Polling Interval:** 1 minute

---

## Background Cycle Protocol

### Every Cycle
1. Call `get_agents` → Scan all agent statuses.
   - If any agent is in `error` state → log to MEMORY.md: "⚠️ Agent [name] errored at [time]."
   - If any agent is `idle` with an active goal → flag for re-evaluation.
2. Call `get_tasks` → Scan task queue.
   - If any task has been `processing` for >10 minutes → log as potentially stalled.
3. If system is fully nominal → output `{ "action": "sleep", "reason": "System nominal. All agents operational." }`.

### Do NOT Spam
Only call `get_channels` or `get_config` once every 5 cycles (not every minute) to avoid I/O waste.

### Alert Priority
- 🔴 CRITICAL: An agent is in `error` state.
- 🟡 WARNING: A task has been processing for >10 minutes.
- 🟢 NOMINAL: All agents running, no stalled tasks.