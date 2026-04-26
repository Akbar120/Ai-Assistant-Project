import * as fs from 'fs';
import * as path from 'path';
import { startAgentWorker } from './engine';
import { ollamaChat } from '../lib/ollama';
import { orchestrate } from './orchestrator';
import { runTool } from './tools';
import { addAgentNotification } from './state';
import { initializeWorkspace, buildHybridPrompt, upgradeAgentWorkspace } from './workspace';
import { extractAndSyncMemory, addSessionMemory, getSessionMemory } from './memoryService';

// ─── Structured Log Entry ────────────────────────────────────────────────────
export type LogType = 'THINK' | 'ACTION' | 'TOOL' | 'RESULT' | 'ERROR' | 'BOOT' | 'SYSTEM' | 'INFO' | 'WARNING';

export interface AgentLog {
  id: string;
  type: LogType;
  timestamp: string;
  title?: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  goal: string;
  status: 'sleeping' | 'running' | 'completed' | 'error' | 'paused';
  mode: 'idle' | 'thinking' | 'executing' | 'waiting_confirmation' | 'configuring';
  logs: AgentLog[];
  maxTokens: number;
  useRotorQuant: boolean;
  skills: string[];
  tools: string[];
  isAutonomous: boolean;
  pollingInterval: number;
  sessionMemory?: string[];
  allowedTools: string[];
  folder: string;
  isSystem?: boolean; // Jenny flag
  cycleCount?: number; // Track execution cycles
  lastCycle?: {
    think?: string;
    action?: string;
    tool?: string;
    result?: string;
  };
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

// ─── Migrate legacy string logs → structured AgentLog ───────────────────────
function migrateLogs(rawLogs: any[]): AgentLog[] {
  if (!Array.isArray(rawLogs)) return [];
  return rawLogs.map((log, i) => {
    if (typeof log === 'object' && log.type && log.timestamp) {
      // Already structured
      return log as AgentLog;
    }
    // Legacy string format: "[HH:MM:SS] Message"
    const strLog = String(log);
    const timeMatch = strLog.match(/^\[([^\]]+)\]\s*/);
    const timestamp = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString();
    const message = strLog.replace(/^\[[^\]]+\]\s*/, '');

    let type: LogType = 'INFO';
    if (strLog.includes('[ERROR]') || strLog.includes('ERROR')) type = 'ERROR';
    else if (strLog.includes('Think:')) type = 'THINK';
    else if (strLog.includes('Executing Tool:')) type = 'ACTION';
    else if (strLog.includes('Tool Result:')) type = 'RESULT';
    else if (strLog.includes('BOOTSTRAP') || strLog.includes('[BOOT]')) type = 'BOOT';
    else if (strLog.includes('[SYSTEM]') || strLog.includes('[INFO]')) type = 'SYSTEM';

    return {
      id: `log_${i}_${Date.now()}`,
      type,
      timestamp,
      message: message.trim(),
    };
  });
}

export function getAgentStore(): AgentStore {
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.agents) {
      const fresh = { agents: {}, overallKvLimit: 128000 };
      fs.writeFileSync(dbPath, JSON.stringify(fresh, null, 2), 'utf-8');
      return fresh;
    }
    // Migrate all agent logs to structured format + Sync with disk
    const agents = parsed.agents || {};
    let changed = false;
    for (const id of Object.keys(agents)) {
      const agent = agents[id];
      
      // Prune ghost agents (folder deleted manually)
      if (agent.folder && !agent.isSystem) {
        const agentPath = path.join(process.cwd(), 'workspace', 'agents', agent.folder);
        if (!fs.existsSync(agentPath)) {
          console.warn(`[AgentStore] Pruning ghost agent '${agent.name}' (${id}) - Folder '${agent.folder}' missing.`);
          delete agents[id];
          changed = true;
          continue;
        }
      }

      agent.logs = migrateLogs(agent.logs || []);
      if (!agent.cycleCount) agent.cycleCount = 0;
      if (!agent.lastCycle) agent.lastCycle = {};
    }

    if (changed) {
      fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2), 'utf-8');
    }

    return parsed as AgentStore;
  } catch {
    return { agents: {}, overallKvLimit: 128000 };
  }
}

export function saveAgentStore(store: AgentStore) {
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf-8');
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getUniqueFolder(name: string, store: AgentStore): string {
  const base = slugify(name) || 'agent';
  let folder = base;
  let counter = 2;
  const existingFolders = new Set(Object.values(store.agents).map(a => a.folder));
  while (existingFolders.has(folder)) {
    folder = `${base}-${counter++}`;
  }
  return folder;
}

// ─── Structured log helper ────────────────────────────────────────────────────
export function logAgentAction(
  id: string,
  message: string,
  type: LogType = 'INFO',
  title?: string,
  metadata?: Record<string, any>
) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  const entry: AgentLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestamp: new Date().toLocaleTimeString(),
    title,
    message: message.trim(),
    metadata,
  };
  store.agents[id].logs.push(entry);
  saveAgentStore(store);
}

// ─── Jenny System Agent Bootstrap ────────────────────────────────────────────
const JENNY_ID = 'system_jenny';

export function ensureJennyAgent() {
  const store = getAgentStore();
  if (store.agents[JENNY_ID]) return; // Already exists

  const jennyFolder = 'system-jenny';
    const jennyAgent: Agent = {
      id: JENNY_ID,
      name: 'Jenny',
      role: 'System Orchestrator',
      goal: 'Orchestrate all agents, manage goals, and be the central intelligence of OpenClaw.',
      folder: jennyFolder,
      status: 'running',
      mode: 'idle',
      isSystem: true,
      cycleCount: 0,
      lastCycle: {},
      logs: [
        {
          id: 'jenny_boot_0',
          type: 'BOOT',
          timestamp: new Date().toLocaleTimeString(),
          title: 'System Agent Online',
          message: 'Jenny (System Orchestrator) initialized as primary brain of OpenClaw.',
        }
      ],
      maxTokens: 8192,
      useRotorQuant: false,
      skills: ['agent_creator', 'task_manager', 'system_awareness', 'research', 'social_manager', 'confirmation_loop', 'system_admin'],
      tools: ['get_tasks', 'get_channels', 'get_agents', 'get_skills', 'get_config', 'search_web', 'instagram_dm_reader', 'instagram_dm_sender', 'platform_post', 'caption_manager', 'manage_agent', 'agent_command', 'install_skill', 'update_plan'],
      isAutonomous: true,
      pollingInterval: 300000,
      sessionMemory: [],
      allowedTools: ['get_tasks', 'get_channels', 'get_agents', 'get_skills', 'get_config', 'search_web', 'manage_agent', 'agent_command', 'install_skill', 'update_plan'],
    };

  store.agents[JENNY_ID] = jennyAgent;
  saveAgentStore(store);

  // Provision workspace for Jenny in background
  initializeWorkspace(jennyFolder, {
    name: 'Jenny',
    role: 'System Orchestrator',
    goal: 'Orchestrate all agents, manage goals, and be the central intelligence of OpenClaw.',
    tools: jennyAgent.tools,
    skills: jennyAgent.skills,
    pollingInterval: jennyAgent.pollingInterval,
  }).catch(e => console.error('[Jenny] Workspace init error:', e));
}

export function spawnAgent(name: string, role: string, goal: string, details?: any): Agent {
  const store = getAgentStore();
  const id = `agent_${Math.random().toString(36).substring(2, 9)}`;
  const folder = getUniqueFolder(name, store);

  const detailTools: string[] = Array.isArray(details?.tools) ? details.tools : [];
  const detailSkills: string[] = Array.isArray(details?.skills) ? details.skills : [];
  const detailChannels: string[] = Array.isArray(details?.channels) ? details.channels : [];

  const defaultTools: string[] = [];
  const goalLower = (goal || '').toLowerCase();
  const nameLower = name.toLowerCase();
  if (goalLower.includes('instagram') || nameLower.includes('instagram') || nameLower.includes('dm')) {
    defaultTools.push('instagram_dm_reader', 'instagram_dm_sender', 'instagram_feed_reader');
  }
  if (goalLower.includes('post') || goalLower.includes('caption')) {
    defaultTools.push('caption_manager');
  }
  defaultTools.push('get_tasks', 'get_channels', 'search_web');

  function getRealSkills(): string[] {
    try {
      const skillsDir = path.join(process.cwd(), 'src', 'brain', 'skills');
      const files = fs.readdirSync(skillsDir);
      return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  }

  const installedSkills = getRealSkills();

  function pickDefaultSkills(goal: string, name: string, installed: string[]): string[] {
    const g = (goal || '').toLowerCase();
    const n = (name || '').toLowerCase();
    const picked = new Set<string>();
    if (installed.includes('system_awareness')) picked.add('system_awareness');
    if (installed.includes('task_manager')) picked.add('task_manager');
    if ((g.includes('dm') || g.includes('instagram') || n.includes('dm')) && installed.includes('agent_creator')) {
      picked.add('agent_creator');
    }
    if ((g.includes('post') || g.includes('social') || g.includes('caption')) && installed.includes('social_manager')) {
      picked.add('social_manager');
    }
    if ((g.includes('research') || g.includes('search')) && installed.includes('research')) {
      picked.add('research');
    }
    if (installed.includes('confirmation_loop')) picked.add('confirmation_loop');
    if (picked.size === 0) installed.slice(0, 2).forEach(s => picked.add(s));
    return Array.from(picked);
  }

  const finalTools = detailTools.length > 0 ? detailTools : defaultTools;
  const finalSkills = detailSkills.length > 0
    ? detailSkills.filter(s => installedSkills.includes(s))
    : pickDefaultSkills(goal, name, installedSkills);

  const agent: Agent = {
    id,
    name,
    role: role || 'AI Assistant',
    goal: goal || 'Assist with tasks',
    folder,
    status: 'running',
    mode: 'configuring',
    cycleCount: 0,
    lastCycle: {},
    logs: [{
      id: 'spawn_0',
      type: 'SYSTEM',
      timestamp: new Date().toLocaleTimeString(),
      title: 'Agent Spawned',
      message: `Agent ${name} spawned. Initializing provisioning pipeline...`,
    }],
    maxTokens: 4096,
    useRotorQuant: false,
    skills: finalSkills,
    tools: finalTools,
    isAutonomous: false,
    pollingInterval: 60000,
    sessionMemory: [],
    allowedTools: finalTools,
  };

  const identityContent = details?.identity ||
    `# IDENTITY\nName: ${name}\nRole: ${role || 'AI Assistant'}\nGoal: ${goal || 'Assist with tasks'}`;
  const soulContent = details?.soul ||
    `# SOUL\nPersonality: Casual, smart, adaptive. Speaks Hinglish naturally.\nTone: Matches user's speaking style.`;
  const toolsContent = `# TOOLS\nAllowed Tools:\n${finalTools.map(t => `- ${t}`).join('\n')}\n\nChannels:\n${detailChannels.length > 0 ? detailChannels.map(c => `- ${c}`).join('\n') : '- instagram'}`;
  const agentsContent = details?.instructions ||
    `# INSTRUCTIONS\n1. Check triggers every ${Math.round((agent.pollingInterval || 60000) / 60000)} minute(s).\n2. Analyze incoming data.\n3. Generate action suggestions.\n4. Wait for user approval.\n5. NEVER act without explicit user approval.`;

  const agentDir = path.join(process.cwd(), 'workspace', 'agents', folder);
  try {
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  } catch (e) {
    console.error(`[Provisioning] Failed to create workspace dir:`, e);
  }

  initializeWorkspace(folder, {
    name, role, goal,
    identity: identityContent,
    soul: soulContent,
    instructions: agentsContent,
    tools: finalTools,
    channels: detailChannels,
    pollingInterval: agent.pollingInterval,
    skills: finalSkills,
  }).catch(e => console.error(`[Provisioning] Workspace init error for ${folder}:`, e));

  try {
    fs.writeFileSync(path.join(agentDir, 'memory.json'), JSON.stringify([], null, 2));
    fs.writeFileSync(path.join(agentDir, 'config.json'), JSON.stringify(agent, null, 2));
    fs.writeFileSync(path.join(agentDir, 'logs.json'), JSON.stringify(agent.logs, null, 2));
    fs.writeFileSync(path.join(agentDir, 'tools.json'), JSON.stringify(finalTools, null, 2));
    const channelsData = detailChannels.length > 0 ? detailChannels : (goalLower.includes('instagram') ? ['instagram'] : []);
    fs.writeFileSync(path.join(agentDir, 'channels.json'), JSON.stringify(channelsData, null, 2));
  } catch (e) {
    console.error(`[Provisioning] Failed to create core files for ${id}:`, e);
  }

  store.agents[id] = agent;
  saveAgentStore(store);
  startAgentWorker(id);
  return agent;
}

export function updateAgent(identifier: string, newRole?: string, newGoal?: string): Agent | null {
  const store = getAgentStore();
  
  let agentId = store.agents[identifier] ? identifier : undefined;
  if (!agentId) {
    agentId = Object.keys(store.agents).find(id => {
      const agent = store.agents[id];
      return agent.name.trim().toLowerCase() === identifier.trim().toLowerCase();
    });
  }

  if (!agentId) return null;
  const agent = store.agents[agentId];
  if (newRole) agent.role = newRole;
  if (newGoal) {
    agent.goal = newGoal;
    agent.status = 'running';
    logAgentAction(agentId, `Agent updated. New Objective: ${newGoal}`, 'SYSTEM', 'Goal Updated');
    startAgentWorker(agentId);
  } else {
    saveAgentStore(store);
  }
  return agent;
}

export function restartAgent(identifier: string): Agent | null {
  const store = getAgentStore();
  
  // Try finding by internal ID first, then fallback to name match
  let agentId = store.agents[identifier] ? identifier : undefined;
  
  if (!agentId) {
    agentId = Object.keys(store.agents).find(id => {
      const agent = store.agents[id];
      return agent.name.trim().toLowerCase() === identifier.trim().toLowerCase();
    });
  }
  
  if (!agentId) return null;
  const agent = store.agents[agentId];
  agent.status = 'running';
  logAgentAction(agentId, 'Manual restart triggered. Re-initializing objectives...', 'SYSTEM', 'Restart');
  startAgentWorker(agentId);
  return agent;
}

export function updateAgentStatus(id: string, status: Agent['status']) {
  const store = getAgentStore();
  if (store.agents[id]) {
    store.agents[id].status = status;
    saveAgentStore(store);
  }
}

export function runAgentWorker(id: string) {
  return startAgentWorker(id);
}

// ─── Control Actions ──────────────────────────────────────────────────────────

export function pauseAgent(id: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  store.agents[id].status = 'paused';
  store.agents[id].logs.push({
    id: `log_${Date.now()}`,
    type: 'SYSTEM',
    timestamp: new Date().toLocaleTimeString(),
    title: 'Agent Paused',
    message: 'Agent paused by user. Will resume on next wake command.',
  });
  saveAgentStore(store);
}

export function resumeAgent(id: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  store.agents[id].status = 'running';
  store.agents[id].logs.push({
    id: `log_${Date.now()}`,
    type: 'SYSTEM',
    timestamp: new Date().toLocaleTimeString(),
    title: 'Agent Resumed',
    message: 'Agent resumed by user.',
  });
  saveAgentStore(store);
  startAgentWorker(id);
}

export function clearAgentMemory(id: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  store.agents[id].sessionMemory = [];
  const folder = store.agents[id].folder;
  // Clear MEMORY.md
  const memPath = path.join(process.cwd(), 'workspace', 'agents', folder, 'MEMORY.md');
  if (fs.existsSync(memPath)) {
    fs.writeFileSync(memPath, `# MEMORY — ${store.agents[id].name}\n\n## Critical\n(Cleared by user)\n\n## Useful\n\n## Temporary\n`, 'utf-8');
  }
  store.agents[id].logs.push({
    id: `log_${Date.now()}`,
    type: 'SYSTEM',
    timestamp: new Date().toLocaleTimeString(),
    title: 'Memory Cleared',
    message: 'Agent session memory and MEMORY.md cleared by user.',
  });
  saveAgentStore(store);
}

export function reloadAgentSkills(id: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  // Reload installed skills list
  try {
    const skillsDir = path.join(process.cwd(), 'src', 'brain', 'skills');
    const installed = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    const currentSkills = store.agents[id].skills || [];
    const validSkills = currentSkills.filter(s => installed.includes(s));
    store.agents[id].skills = validSkills;
  } catch { /* ignore */ }
  store.agents[id].logs.push({
    id: `log_${Date.now()}`,
    type: 'SYSTEM',
    timestamp: new Date().toLocaleTimeString(),
    title: 'Skills Reloaded',
    message: 'Agent skill list refreshed from /brain/skills/.',
  });
  saveAgentStore(store);
}

export function reloadAgentTools(id: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  store.agents[id].logs.push({
    id: `log_${Date.now()}`,
    type: 'SYSTEM',
    timestamp: new Date().toLocaleTimeString(),
    title: 'Tools Reloaded',
    message: 'Agent tool configuration refreshed.',
  });
  saveAgentStore(store);
}

export function clearAgentLogs(id: string) {
  const store = getAgentStore();
  if (!store.agents[id]) return;
  store.agents[id].logs = [{
    id: `log_${Date.now()}`,
    type: 'SYSTEM',
    timestamp: new Date().toLocaleTimeString(),
    title: 'Logs Cleared',
    message: 'Previous logs cleared by user.',
  }];
  saveAgentStore(store);
}

// ─── Auto-Bootloader for Agents ─────────────────────────────────────────────
// Automatically resume background workers for 'running' agents when the server
// (re)starts or the Next.js module hot-reloads.
const globalAny: any = global;
if (!globalAny.__agentBootloaderRun) {
  globalAny.__agentBootloaderRun = true;
  
  // Small delay to ensure all core modules are loaded before starting workers
  setTimeout(() => {
    try {
      const store = getAgentStore();
      for (const id of Object.keys(store.agents)) {
        const agent = store.agents[id];
        if (agent.status === 'running' && agent.isAutonomous && !agent.isSystem) {
          console.log(`[Bootloader] Auto-resuming background worker: ${agent.name} (${id})`);
          startAgentWorker(id);
        }
      }
    } catch (e) {
      console.error('[Bootloader] Failed to auto-resume agents:', e);
    }
  }, 2000);
}
