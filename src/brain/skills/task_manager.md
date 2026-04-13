# Skill: Task Manager (Production Grade)

## Purpose
Enforce mission-critical task lifecycle management with ownership locking, structured logging, and template-driven progress tracking.

## Tool Access
- `create_task`
- `update_task`
- `append_log`
- `complete_step`

## Core Purpose
- **Multi-Agent Safety**: Prevent race conditions via ownership locking.
- **Reliability Gauges**: Automated progress calculation using Task Templates.
- **Forensic Visibility**: Structured logs for precise debugging and analytics.

## Production Rules
1. **Golden Rule**: NEVER execute a major action without an active `task_id`.
2. **Ownership Lock**: 
   - A task is `locked: true` by default.
   - Only the `owner` (Agent ID or Orchestrator) can append logs or update status.
   - Cross-agent contamination is hard-blocked at the system level.
3. **Template Mapping**:
   - `create_agent` -> [Analyze, Provision, DNA, Register]
   - `dataset_creation` -> [Parse, Tag, Structure, Persist]
   - `sandbox` -> [Validate, Execute, Log]
4. **Execution Guards**:
   - If status is `waiting_input`, all associated tool calls remain BLOCKED.
   - Failure to provide `task_id` during tool call results in immediate `Execution Error`.

## Standard Workflow
1. **Map Template**: Use the user's intent to select the correct `TaskType`.
2. **Initialize Mission**: Create task with `owner` and `locked: true`.
3. **Execute & Log**: Call `append_log` with structured data (level, step).
4. **Mark Steps**: Use `complete_step` after each phase to auto-increment UI progress.
5. **Close Mission**: Transition to `completed`, `partial`, or `failed`.
