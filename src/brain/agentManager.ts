import fs from 'fs';
import path from 'path';
import { ollamaChat } from '@/lib/ollama';

export interface Agent {
  id: string;
  name: string;
  role: string;
  goal: string;
  status: 'sleeping' | 'running' | 'completed' | 'error';
  logs: string[];
  maxTokens: number;
  useRotorQuant: boolean;
  skills: string[];
  tools: string[];
}

export interface AgentStore {
  agents: Record<string, Agent>;
  overallKvLimit: number;
}

const dbPath = path.join(process.cwd(), 'src', 'data', 'agents_live.json');

// Initialize store file if doesn't exist
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ agents: {}, overallKvLimit: 128000 }), 'utf-8');
}

export function getAgentStore(): AgentStore {
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { agents: {}, overallKvLimit: 128000 };
  }
}

export function saveAgentStore(store: AgentStore) {
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf-8');
}

export function spawnAgent(name: string, role: string, goal: string): Agent {
  const store = getAgentStore();
  const agent: Agent = {
    id: `agent_${Math.random().toString(36).substring(2, 9)}`,
    name,
    role,
    goal,
    status: 'running',
    logs: [`[INFO] Agent ${name} spawned. Objective: ${goal}`],
    maxTokens: 4096, // Virtual KV Cache suppressor limit
    useRotorQuant: false,
    skills: [],
    tools: []
  };

  store.agents[agent.id] = agent;
  saveAgentStore(store);

  // Kickoff background async worker
  runAgentWorker(agent.id);

  return agent;
}

export function updateAgent(name: string, newRole?: string, newGoal?: string): Agent | null {
  const store = getAgentStore();
  const agentId = Object.keys(store.agents).find(id => store.agents[id].name.toLowerCase() === name.toLowerCase());

  if (!agentId) return null;

  const agent = store.agents[agentId];
  if (newRole) agent.role = newRole;
  if (newGoal) {
    agent.goal = newGoal;
    agent.status = 'running';
    agent.logs.push(`[INFO] Agent updated. New Objective: ${newGoal}`);
    saveAgentStore(store);
    // Restart worker with new goal
    runAgentWorker(agentId);
  } else {
    saveAgentStore(store);
  }

  return agent;
}

export function updateAgentStatus(id: string, status: Agent['status']) {
  const store = getAgentStore();
  if (store.agents[id]) {
    store.agents[id].status = status;
    saveAgentStore(store);
  }
}

export function logAgentAction(id: string, message: string) {
  const store = getAgentStore();
  if (store.agents[id]) {
    const timestamp = new Date().toLocaleTimeString();
    store.agents[id].logs.push(`[${timestamp}] ${message}`);
    saveAgentStore(store);
  }
}

// Background Worker for the Agent
async function runAgentWorker(id: string) {
  const store = getAgentStore();
  const agent = store.agents[id];
  if (!agent) return;

  try {
    logAgentAction(id, `Thinking about how to accomplish: ${agent.goal}`);
    
    const messages = [
      { role: 'system' as const, content: `You are ${agent.name}, an AI Agent acting as ${agent.role}. Your goal is: ${agent.goal}. Return a short summary of how you plan to accomplish this.` },
      { role: 'user' as const, content: 'Begin your task.' }
    ];

    // KV Cache suppression mechanism:
    // We restrict num_ctx to prevent memory stacking, and pass rotorquant flag if toggled.
    const runOptions: any = {
      messages,
      temperature: 0.5,
      num_ctx: agent.maxTokens, // Restricts active memory!
    };

    if (agent.useRotorQuant) {
      // Passes custom flag to inference engine backend (llama.cpp)
      runOptions.kv_cache_type = "rotorquant";
      logAgentAction(id, `Enabled experimental RotorQuant KV Cache Compression.`);
    }

    const reply = await ollamaChat(runOptions);
    
    logAgentAction(id, `Executed: ${reply}`);
    updateAgentStatus(id, 'completed');
    logAgentAction(id, `Task marked as completed.`);

  } catch (error: any) {
    updateAgentStatus(id, 'error');
    logAgentAction(id, `ERROR: ${error.message}`);
  }
}
