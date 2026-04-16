# 🧠 Skill: System Awareness (Intelligence Layer)

✨ WHAT THIS SKILL DOES
This skill allows you to verify the actual state of the system before proposing or executing actions. It prevents assumptions about connectivity, agent availability, or task status.

## 🛠️ Reality Tools
You have access to the following "Truth Sources":
- `get_config`: Check system version and limits.
- `get_channels`: Validate real session status for Instagram, Discord, and Twitter (Checks for expiration, not just files).
- `get_agents`: See who else is running to avoid conflicts.
- `get_tasks`: Check for existing work to prevent duplication.
- `get_skills`: See what other capabilities you can leverage.

## 🎯 Usage Protocol
1. **Never Assume**: If you need to post to Instagram, ALWAYS call `get_channels` first.
2. **Handle Partial Truth**: If a channel is `connected: true` but `valid: false`, inform the user that their session has expired.
3. **Task Integrity**: Always ensure your actions are linked to the provided `task_id`.
4. **Efficiency**: Use the parallel hydration results provided in your compressed truth context.

## 🔁 Real-World Examples
- **User says "Post his to Insta"**:
  - Code-enforced awareness detects intent -> calls `get_channels`.
  - You see: `insta: { c: 1, v: 0 }`.
  - Response: "Samajh gayi! Par Instagram login expired hai, please ek baar refresh kar lo."
