const fs = require('fs');
const path = 'src/brain/engine.ts';
let content = fs.readFileSync(path, 'utf8');

const startIdx = content.indexOf('  const forcedNotifyEnforcement = needsForcedNotify');
if (startIdx === -1) {
  console.log('Could not find start idx');
  process.exit(1);
}
const endIdx = content.indexOf("    : '';", startIdx) + 9;

const replacement = `  const forcedNotifyExample = {
    action: "tool_call",
    tool: "agent_notify",
    params: {
      type: "approval_needed",
      text: "📊 DM REPORT\\nFrom: @[username]\\nMessage: \\"[exact message]\\"\\nTone: [tone]\\n---\\nSUGGESTED REPLIES:\\nA) \\"[reply A]\\"\\nB) \\"[reply B]\\"\\nC) \\"[reply C]\\""
    },
    reason: "DMs were read in previous cycle. Reporting to Jenny for approval as per SOP."
  };

  const forcedNotifyEnforcement = needsForcedNotify
    ? \`\\n🚨 MANDATORY OVERRIDE: You have ALREADY read Instagram DMs in the previous cycle. \\nYour ONLY valid action RIGHT NOW is:\\n\` +
      JSON.stringify(forcedNotifyExample, null, 2) +
      \`\\n\\nNO OTHER ACTION IS VALID. Output ONLY this JSON with the real DM data filled in.\\n\`
    : '';`;

content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log("Done");
