
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'src', 'data', 'agents_live.json');
const store = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const agentId = 'agent_ngu6k6y'; // DM_Monitor_Pro

if (store.agents[agentId]) {
  store.agents[agentId].status = 'running';
  store.agents[agentId].mode = 'idle';
  // Clear any cached SOP hallucination in memory
  const memoryPath = path.join(process.cwd(), 'workspace', 'agents', store.agents[agentId].folder, 'MEMORY.md');
  if (fs.existsSync(memoryPath)) {
    let memory = fs.readFileSync(memoryPath, 'utf8');
    memory = memory.replace(/\[SELF_AUDIT_COMPLETE\].*/g, '');
    fs.writeFileSync(memoryPath, memory, 'utf8');
  }
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf8');
  console.log('Agent state reset and memory audit window opened.');
}
