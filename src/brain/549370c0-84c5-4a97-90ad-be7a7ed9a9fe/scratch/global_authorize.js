
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'src', 'data', 'agents_live.json');
const store = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const selfImprovementTools = [
  'read_file',
  'write_file',
  'define_tool',
  'improvement_propose',
  'reasoning_engine'
];

Object.keys(store.agents).forEach(id => {
  const agent = store.agents[id];
  console.log(`Updating permissions for ${agent.name}...`);
  
  // Ensure all self-improvement tools are allowed
  agent.allowedTools = [...new Set([...(agent.allowedTools || []), ...selfImprovementTools])];
  agent.tools = [...new Set([...(agent.tools || []), ...selfImprovementTools])];
  
  // Force reset logs to clear cache
  agent.logs = agent.logs.slice(-2);
  agent.status = 'running';
  agent.mode = 'idle';
});

fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf8');
console.log('Global Permissions Granted. Cache Purged.');
