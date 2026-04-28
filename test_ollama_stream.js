const http = require('http');

const systemPrompt = `### SYSTEM SOP — MANDATORY REASONING
- You MUST start EVERY response with a <think>...</think> block, NO EXCEPTIONS.
- Even for "Hi", "Ok", or short greetings, you MUST think first.
- The <think> block is for INTERNAL LOGIC, STRATEGY, and ANALYSIS.
- You can use Hinglish or English in your thoughts—whatever helps you strategize.
- NEVER put your final conversational reply or greetings inside <think> tags.
- After the </think> tag, provide your natural Hinglish response to the user.
- KEEP logic (Strategy/Analysis) and speech (Conversation/Reply) completely separate.
- FAILURE to include the <think> block or separate logic from speech is a CRITICAL ERROR.`;

const options = {
  hostname: '127.0.0.1',
  port: 11434,
  path: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
  res.on('data', (chunk) => {
    try {
      const json = JSON.parse(chunk.toString());
      if (json.message?.content) {
        process.stdout.write(json.message.content);
      }
    } catch (e) {
      // Handle partial JSON or buffer
    }
  });
  res.on('end', () => console.log('\n--- Stream Ended ---'));
});

req.on('error', (e) => console.error(e));

req.write(JSON.stringify({
  model: 'gemma4:e4b',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'nothing' }
  ],
  stream: true,
  options: { temperature: 0.5 }
}));

req.end();
