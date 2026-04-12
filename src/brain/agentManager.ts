import fs from 'fs';
import path from 'path';
import { ollamaChat } from '@/lib/ollama';
import { orchestrate } from './orchestrator';
import { runTool } from './tools';
import { addAgentNotification } from './state';

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
  isAutonomous: boolean;
  pollingInterval: number; // in milliseconds
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
    tools: [],
    isAutonomous: false,
    pollingInterval: 300000 // 5 minutes default
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

export function restartAgent(name: string): Agent | null {
  const store = getAgentStore();
  const agentId = Object.keys(store.agents).find(id => store.agents[id].name.toLowerCase() === name.toLowerCase());

  if (!agentId) return null;

  const agent = store.agents[agentId];
  agent.status = 'running';
  agent.logs.push(`[SYSTEM] Manual restart triggered. Re-initializing objectives...`);
  saveAgentStore(store);

  // Re-trigger the background worker
  runAgentWorker(agentId);

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
export async function runAgentWorker(id: string) {
  const store = getAgentStore();
  let agent = store.agents[id];
  if (!agent) return;

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  logAgentAction(id, `Thinking about how to accomplish: ${agent.goal}`);

  // Loop if autonomous, otherwise run once
  do {
    try {
      // Re-fetch agent state at start of loop in case of dynamic updates
      const currentStore = getAgentStore();
      agent = currentStore.agents[id];
      if (!agent || agent.status === 'sleeping') break;

      const result = await orchestrate(
        `Continue your task: ${agent.goal}`,
        [], // no history for workers yet
        { message: `Continue your task: ${agent.goal}`, context: { mentions: [], hasFile: false, rawInput: agent.goal } }
      );

      const { action, data, reply } = result;

      if (action === 'tool_call') {
        const { tool, args } = data as { tool: string, args: any };
        logAgentAction(id, `Tool Call: ${tool}(${JSON.stringify(args)})`);
        
        const toolRes = await runTool(tool, args);
        logAgentAction(id, `Tool Result: ${toolRes.reply}`);

        // Custom logic: if it was a fetch and found unread messages, notify Jenny/User
        if (tool === 'instagram_fetch' && (toolRes as any).hasUnread) {
          addAgentNotification(id, agent.name, toolRes.reply);
        }
      } else {
        logAgentAction(id, `Reply: ${reply}`);
      }

      if (!agent.isAutonomous) {
        updateAgentStatus(id, 'completed');
        logAgentAction(id, `Task marked as completed.`);
        break;
      } else {
        logAgentAction(id, `Autonomous mode active. Sleeping for ${Math.round(agent.pollingInterval / 60000)}m...`);
        await sleep(agent.pollingInterval);
      }

    } catch (error: any) {
      updateAgentStatus(id, 'error');
      logAgentAction(id, `ERROR: ${error.message}`);
      break; 
    }
  } while (agent && agent.isAutonomous);
}
