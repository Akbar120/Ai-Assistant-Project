const test = (fullReply) => {
    const cleanReply = fullReply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
    console.log(`Input: "${fullReply}"`);
    console.log(`Output: "${cleanReply}"`);
    console.log('---');
};

test('<think> Thinking...');
test('<think> Thinking... </think> Hello!');
test('Hello <think> Thinking... </think> World');
test('Hello <think> Thinking...');
