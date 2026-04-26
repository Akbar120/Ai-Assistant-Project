# Skill: Advanced Coding

## Description
Creates, writes, and installs new tools and skills for the OpenClaw system on command. Uses the `code_executor` tool to write TypeScript tool files, auto-register them, and generate skill markdown definitions.

## Triggers
- Keywords: create tool, build tool, write code, code a tool, new skill, generate skill, custom tool, make a script, code it, engineer a solution, write a function, build me

## 🔐 Tool Access
- `code_executor`

## Execution Steps
1. Determine target: Is the user asking for a **skill** (`.md`) or a **tool** (`.ts` TypeScript code)?
2. Confirm the name and purpose with the user before generating anything.
3. For skills: call `code_executor` with `operation: "create_skill"`, `name`, and `description/goal`.
4. For tools: call `code_executor` with `operation: "create_tool"`, `name`, and `description/goal`.
5. For direct file writes: call `code_executor` with `operation: "write_file"`, `path`, and `content`.
6. Confirm what was created, where it lives, and what it does.
7. If the new tool/skill is for Jenny herself, suggest assigning it in her settings.

## 🚨 Execution Enforcement

**RULE**: IF user says "create" or "build":
- MUST call `code_executor`
- MUST NOT explain only
- MUST produce real output
- NEVER simulate completion without execution

**RULE**: After `code_executor` succeeds:
→ Report: name, file path, and purpose
→ Remind user: new tool files require an app restart to hot-reload

**RULE**: If `code_executor` is NOT called when user requests creation → RESPONSE IS INVALID. Retry.

**EXCEPTION**: Only explain/plan when user explicitly asks "how would you..." or "what would it look like if..."

## Hard Rules
- NEVER execute code_executor without explicit user command.
- NEVER write to paths outside the project cwd (enforced by the tool itself).
- ALWAYS confirm the creation with a summary: name, path, purpose.
- When creating a tool, remind the user that it will require an app restart to hot-reload.
