# Enforcing Strict Execution Rules (Skill vs Tool Separation)

This plan implements the strict separation between "skill thinking" and "tool execution" to prevent Jenny from prematurely entering confirmation mode or entering a looped state when she generates a skill but lacks a concrete execution tool.

## Open Questions

- Is throwing a hard Error preferred over gracefully transitioning back to `planning` with a warning message when a tool is missing in confirmation? The plan currently uses a hard error (`throw new Error(...)`) as strictly requested, which will be caught by the route handler and returned as an error message.

## Proposed Changes

### [Orchestrator Core]

#### [MODIFY] `src/brain/orchestrator.ts`
We will introduce strict validation blocks at the end of the `planning` and `confirmation` handling phases.

1. **Define Valid Executable Tools**:
   ```typescript
   const EXECUTABLE_TOOLS = ['code_executor', 'instagram_dm', 'browser_action', 'manage_agent', 'platform_post', 'caption_manager'];
   ```

2. **Force Planning Depth (Rule 3)**:
   In the `targetMode === 'planning'` block, before checking for `ready to confirm`:
   ```typescript
   const lowerRaw = raw.toLowerCase();
   const hasExecutableTool = EXECUTABLE_TOOLS.some(t => lowerRaw.includes(t));
   const hasSkill = lowerRaw.includes('skill');

   const MIN_VALID_PLAN = 150;
   if (raw.length < MIN_VALID_PLAN || !lowerRaw.includes("step")) {
       console.warn('[Orchestrator] ⚠️ Plan lacks depth. Forcing planning mode.');
       // Do NOT auto-advance
   }
   ```

3. **Skill ≠ Execution (Rule 1, 4, 5)**:
   ```typescript
   else if (hasSkill && !hasExecutableTool) {
       console.log('[Orchestrator] ⚠️ Skill generated but NO tool found. Staying in planning.');
       // Skill only -> NO confirmation
   }
   ```

4. **Confirmation ONLY if Tool Exists (Rule 2)**:
   Modify the transition logic:
   ```typescript
   else if (/ready to confirm/i.test(raw)) {
       if (!hasExecutableTool) {
           throw new Error("Cannot enter confirmation without executable tool");
       }
       const next = transition('confirmation');
       if (onMode) onMode(next);
       console.log(`[Orchestrator] Planning → auto-advancing to ${next}`);
   }
   ```
   
   Additionally, enforce it directly in the `targetMode === 'confirmation'` block:
   ```typescript
   if (targetMode === 'confirmation') {
       const lowerRaw = raw.toLowerCase();
       const hasExecutableTool = EXECUTABLE_TOOLS.some(t => lowerRaw.includes(t));
       if (!hasExecutableTool) {
           throw new Error("Cannot enter confirmation without executable tool");
       }
       // ... existing confirmation code ...
   }
   ```

## Verification Plan

### Automated Tests
- Review the modified logic against the prompt requirements to ensure all 5 FIX rules are applied.

### Manual Verification
- Test by asking Jenny: "Create a skill to improve logic"
- **Expected Result**: She should remain in `planning` mode and output the skill details without jumping to `confirmation`.
- Test by asking Jenny: "Use code_executor to write a hello world script"
- **Expected Result**: She should correctly transition to `confirmation` mode since `code_executor` is a valid executable tool.
