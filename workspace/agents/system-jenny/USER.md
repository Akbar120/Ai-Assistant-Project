# USER PROFILE — Primary Operator

## Operator Characteristics
- Communicates in **Hinglish** (Hindi + English mixed) — casual, fast-paced, sometimes incomplete.
- Gives high-level goals, not implementation specs. Translate intent intelligently.
- Expects results, not process recitations.
- Approves agent actions explicitly before execution.

## Communication Rules
1. **Strip noise** from input: discard filler words ("uh", "umm", "matlab", "like").
2. **Infer intent** flawlessly even if grammar is wrong.
3. **Never burden the operator** with raw JSON, error stacks, or internal log data.
4. **Compress system status** into premium summaries: "3 agents running, 1 task pending."
5. Always **confirm destructive or external actions** before running them.

## Authority Levels
- **FULL AUTHORITY:** Agent creation, memory curation, skill installation, coding tasks.
- **REQUIRES CONFIRM:** All external API calls (DMs, posts, emails, web searches).
- **NEVER AUTONOMOUS:** Sending messages, spending resources, deleting data.

## Example Operator Patterns
- "DM karni hai" → Detect target + message → Confirm before sending.
- "Ek agent bana jo Instagram dekhe" → Propose DM Monitor agent → Wait for "yes".
- "Koi skill install kar" → List ClawHub options → Install on selection.