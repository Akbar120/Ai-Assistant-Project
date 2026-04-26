const { ollamaChat } = require('./src/lib/ollama');

(async () => {
  const mockPrompt = `You are an autonomous AI execution agent.

[IDENTITY]
Goal: Continuously monitor Instagram DMs every minute, analyze sender's tone, and suggest 3 contextually appropriate replies.

[CHARACTER]
Analytical worker.

[OPERATOR]
None.

[SOP]
# DM_Monitor_Pro — Standard Operating Procedure v2.0...

[SKILLS]
# SKILL — DM_Monitor_Pro...

[TOOLS]
instagram_dm_reader, agent_notify

[MEMORY]
None

[RECENT_LOGS]
[NEXT_ACTION_REQUIRED] DMs read by instagram_dm_reader. Next action MUST be agent_notify

[HEARTBEAT]
Run every 2m.

[CURRENT TIME]
1/1/2026, 12:00:00 AM

🚨 MANDATORY OVERRIDE: You have ALREADY read Instagram DMs in the previous cycle.
Your ONLY valid action RIGHT NOW is:
{
  "action": "tool_call",
  "tool": "agent_notify",
  "params": {
    "type": "approval_needed",
    "text": "📊 DM REPORT\\nFrom: @[username]\\nMessage: \\"[exact message]\\"\\nTone: [tone]\\n---\\nSUGGESTED REPLIES:\\nA) \\"[reply A]\\"\\nB) \\"[reply B]\\"\\nC) \\"[reply C]\\""
  },
  "reason": "DMs were read in previous cycle. Reporting to Jenny for approval as per SOP."
}

NO OTHER ACTION IS VALID. Output ONLY this JSON with the real DM data filled in.

---
CYCLE #2

You MUST act. DO NOT explain. DO NOT narrate. Output ONLY valid JSON.

Rules:
- Follow your AGENTS.md SOP exactly
- Use the skill defined in SKILL.md as your execution method
- Call tools listed in TOOLS.md (use exact names)
- If a goal exists, you MUST call a tool — do NOT sleep

Output this JSON and NOTHING ELSE:
{
  "action": "tool_call",
  "tool": "exact_tool_name_from_TOOLS.md",
  "params": { "param": "value" },
  "reason": "one line referencing AGENTS.md or SKILL.md"
}

If truly nothing to do right now, output:
{ "action": "sleep", "reason": "explanation" }`;

  try {
    const res = await fetch(\`http://localhost:11434/api/chat\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gemma4:e4b",
        messages: [{ role: 'user', content: mockPrompt }],
        stream: false,
        options: { temperature: 0.1 }
      })
    });
    const data = await res.json();
    console.log("Raw Response length:", (data.message?.content || '').length);
    console.log("Raw Response:", data.message?.content);
  } catch (err) {
    console.error(err);
  }
})();
