import * as fs from 'fs';
import * as path from 'path';
import { getAgentStore } from '../agentManager';
import { getAllTasks, exists as taskExists, appendLog, updateTask } from '../taskService';

// ─── Lightweight Scoped Cache ───────────────────────────────────────────────
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3000; // 3-second TTL

function getCacheKey(requester: string, tool: string) {
  return `${requester}_${tool}`;
}

// ─── Standardized Response Wrapper ──────────────────────────────────────────
function wrapResponse<T>(source: string, data: T, cached = false, reply?: string): any {
  return {
    success: true,
    data,
    ...(reply ? { reply } : {}),
    meta: {
      source,
      timestamp: Date.now(),
      cached
    }
  };
}

function wrapError(source: string, error: string, suggestion?: string): any {
  return {
    success: false,
    error,
    reply: `❌ **Error in ${source}:** ${error}`,
    suggestion,
    meta: {
      source,
      timestamp: Date.now(),
      cached: false
    }
  };
}

// ─── Tool Timeout Utility ───────────────────────────────────────────────────
async function withTimeout<T>(promise: Promise<T>, ms: number = 2000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), ms)
  );
  return Promise.race([promise, timeout]);
}

// ─── Access Control Guard ───────────────────────────────────────────────────
async function checkPermissions(requester: string, tool: string): Promise<boolean> {
  if (requester === 'orchestrator') return true;
  const store = getAgentStore();
  const agent = store.agents[requester];
  if (!agent) return false;
  return agent.allowedTools.includes(tool);
}

// ─── Reality Tools (Truth Sources) ──────────────────────────────────────────

/**
 * Checks system configuration and basic status.
 */
export async function get_config(args: { task_id?: string; requester?: string; scope?: 'basic' | 'sensitive' }) {
  const { task_id, requester = 'orchestrator', scope = 'basic' } = args;
  const source = 'get_config';

  // task_id guard only enforced for non-agent callers
  if (task_id && !(await taskExists(task_id))) throw new Error(`[Guard] Invalid task_id: ${task_id}`);

  if (!(await checkPermissions(requester, source))) {
    return wrapError(source, 'Unauthorized access', `Request permission for ${source}`);
  }

  const cacheKey = getCacheKey(requester, source);
  const cachedData = cache.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    if (task_id) await appendLog(task_id, `[Reality] Fetched system config (cached)`);
    return wrapResponse(source, cachedData.data, true);
  }

  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    
    const config = {
      version: pkg.version,
      name: pkg.name,
      env: process.env.NODE_VALUE || 'development',
      limits: { kv: 128000 }
    };

    if (task_id) await appendLog(task_id, `[Reality] Fetched system config`);
    cache.set(cacheKey, { data: config, timestamp: Date.now() });
    
    const reply = `⚙️ **System Configuration:**\n- Version: ${config.version}\n- Env: ${config.env}`;
    return wrapResponse(source, config, false, reply);
  } catch (err: any) {
    if (task_id) await updateTask(task_id, { status: 'failed' });
    return wrapError(source, err.message);
  }
}

/**
 * Returns correctly validated social channel states.
 */
export async function get_channels(args: { task_id?: string; requester?: string }) {
  const { task_id, requester = 'orchestrator' } = args;
  const source = 'get_channels';

  if (task_id && !(await taskExists(task_id))) throw new Error(`[Guard] Invalid task_id: ${task_id}`);

  if (!(await checkPermissions(requester, source))) {
    return wrapError(source, 'Unauthorized access', `Request permission for ${source}`);
  }

  const cacheKey = getCacheKey(requester, source);
  const cachedData = cache.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return wrapResponse(source, cachedData.data, true);
  }

  try {
    const sessionsDir = path.resolve(process.cwd(), 'sessions');
    
    // Detailed Validation Helper
    const checkSession = (filename: string, requiredKey: string) => {
      const filePath = path.join(sessionsDir, filename);
      if (!fs.existsSync(filePath)) return { connected: false, valid: false };
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        // Check if its an array (cookies) or object (config)
        const isValid = Array.isArray(content) ? content.length > 0 : !!content[requiredKey];
        return { connected: true, valid: isValid };
      } catch {
        return { connected: true, valid: false };
      }
    };

    const platforms = {
      instagram: checkSession('instagram-cookies.json', 'ds_user_id'),
      twitter: checkSession('twitter-cookies.json', 'auth_token'),
      discord: checkSession('discord-config.json', 'token')
    };

    if (task_id) await appendLog(task_id, `[Reality] Validated platform channels`);
    cache.set(cacheKey, { data: platforms, timestamp: Date.now() });
    
    const reply = `📡 **Connected Channels:**\n- Instagram: ${platforms.instagram.valid ? '🟢 Connected' : '🔴 Disconnected'}\n- Twitter: ${platforms.twitter.valid ? '🟢 Connected' : '🔴 Disconnected'}\n- Discord: ${platforms.discord.valid ? '🟢 Connected' : '🔴 Disconnected'}`;
    return wrapResponse(source, platforms, false, reply);
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}

/**
 * Lists all active agents.
 */
export async function get_agents(args: { task_id?: string; requester?: string }) {
  const { task_id, requester = 'orchestrator' } = args;
  const source = 'get_agents';
  
  if (!(await checkPermissions(requester, source))) return wrapError(source, 'Unauthorized');

  try {
    const store = getAgentStore();
    const agents = Object.values(store.agents).map(a => ({
      id: a.id,
      name: a.name,
      status: a.status
    }));
    
    const reply = agents.length > 0 
      ? `✅ **Active Agents:**\n\n${agents.map(a => `- **${a.name}** (${a.status})`).join('\n')}`
      : `No active agents found.`;
      
    return wrapResponse(source, agents, false, reply);
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}

/**
 * Returns all active tasks from the service.
 */
export async function get_tasks(args: { task_id?: string; requester?: string }) {
  const { task_id, requester = 'orchestrator' } = args;
  const source = 'get_tasks';

  if (!(await checkPermissions(requester, source))) return wrapError(source, 'Unauthorized');

  try {
    const tasks = await getAllTasks();
    const summary = tasks.slice(0, 10).map(t => ({
      id: t.id,
      status: t.status,
      name: t.name
    }));
    
    const reply = summary.length > 0
      ? `✅ **Recent Tasks:**\n\n${summary.map(t => `- [${t.status.toUpperCase()}] ${t.name}`).join('\n')}`
      : `No recent tasks found.`;
      
    return wrapResponse(source, summary, false, reply);
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}

/**
 * Lists available skills in the brain.
 */
export async function get_skills(args: { task_id?: string; requester?: string }) {
  const { task_id, requester = 'orchestrator' } = args;
  const source = 'get_skills';

  if (!(await checkPermissions(requester, source))) return wrapError(source, 'Unauthorized');

  try {
    const skillsDir = path.resolve(process.cwd(), 'src/brain/skills');
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    const skills = files.map(f => f.replace('.md', ''));
    
    const reply = `✅ **Available Skills:**\n\n${skills.map(s => `- ${s}`).join('\n')}`;
    return wrapResponse(source, skills, false, reply);
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}

/**
 * Reads an agent's recent output/memory to help Jenny understand its state.
 */
export async function get_agent_output(args: { task_id?: string; requester?: string; agent_id: string }) {
  let { task_id, requester = 'orchestrator', agent_id } = args;
  const source = 'get_agent_output';

  if (!(await checkPermissions(requester, source))) return wrapError(source, 'Unauthorized');

  try {
    const store = getAgentStore();
    
    // Try exact ID match first
    let agent = store.agents[agent_id];
    
    // Fallback: Try fuzzy name match if exact ID fails
    if (!agent) {
      const normalizedSearch = agent_id.toLowerCase().replace(/_/g, ' ');
      const matchedKey = Object.keys(store.agents).find(key => {
        const dbName = store.agents[key].name.toLowerCase();
        const dbKey = key.toLowerCase();
        return dbName === normalizedSearch || 
               dbKey === normalizedSearch ||
               dbName.includes(normalizedSearch) ||
               normalizedSearch.includes(dbName);
      });
      if (matchedKey) {
        agent = store.agents[matchedKey];
        agent_id = matchedKey; // update for reference
      }
    }
    
    if (!agent) throw new Error(`Agent not found: ${agent_id}. Try checking get_agents first.`);

    const folder = agent.folder;
    let memory = 'No memory file found.';
    let logsArray: any[] = [];
    
    try {
      memory = fs.readFileSync(path.join(process.cwd(), 'workspace', 'agents', folder, 'MEMORY.md'), 'utf-8');
    } catch (e) {
      // Memory might not exist yet
    }
    
    try {
      logsArray = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'workspace', 'agents', folder, 'logs.json'), 'utf-8'));
    } catch (e) {
      // Logs might not exist yet
    }

    const recentMemory = memory.slice(-2000);
    const recentLogsArray = logsArray.slice(-5);
    
    const formattedLogs = recentLogsArray.length > 0 
      ? recentLogsArray.map((l: any) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.type.toUpperCase()}: ${l.text}`).join('\n')
      : 'No recent activity.';

    const reply = `📊 **Agent Status: ${agent.name}**\n\n**Recent Activity Logs:**\n\`\`\`text\n${formattedLogs}\n\`\`\`\n\n**Latest Memory Snippet:**\n\`\`\`markdown\n${recentMemory}\n\`\`\``;

    return wrapResponse(source, {
      id: agent_id,
      name: agent.name,
      memorySnippet: recentMemory,
      recentLogs: recentLogsArray
    }, false, reply);
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}

/**
 * Functional Memory Search: Scans chat history and agent workspaces for context.
 */
export async function memory_search(args: { task_id?: string; requester?: string; query: string }) {
  const { task_id, requester = 'orchestrator', query } = args;
  const source = 'memory_search';

  if (!query) return wrapError(source, 'Missing query');
  if (!(await checkPermissions(requester, source))) return wrapError(source, 'Unauthorized');

  try {
    const results: any[] = [];
    const searchTerms = query.toLowerCase().split(' ');

    // 1. Search Chat History
    const chatPath = path.resolve(process.cwd(), 'src/data/chat/history.json');
    if (fs.existsSync(chatPath)) {
      const history = JSON.parse(fs.readFileSync(chatPath, 'utf-8'));
      const matches = history.filter((m: any) => 
        m.content?.toLowerCase().includes(query.toLowerCase())
      ).slice(-3); // Get last 3 relevant matches
      
      matches.forEach((m: any) => results.push({
        source: 'Chat History',
        content: m.content,
        timestamp: m.timestamp
      }));
    }

    // 2. Search Agent Memories
    const agentsDir = path.resolve(process.cwd(), 'workspace', 'agents');
    if (fs.existsSync(agentsDir)) {
      const folders = fs.readdirSync(agentsDir);
      for (const folder of folders) {
        const memoryPath = path.join(agentsDir, folder, 'MEMORY.md');
        if (fs.existsSync(memoryPath)) {
          const content = fs.readFileSync(memoryPath, 'utf-8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            results.push({
              source: `Agent Memory (${folder})`,
              content: content.slice(0, 500) + '...', // First 500 chars
            });
          }
        }
      }
    }

    const reply = results.length > 0
      ? `🧠 **Memory Search Results for "${query}":**\n\n${results.map(r => `📍 **${r.source}**:\n> ${r.content.replace(/\n/g, '\n> ').slice(0, 300)}...`).join('\n\n')}`
      : `🔍 No specific matches found in memory for "${query}". I'll rely on the current session context.`;

    return wrapResponse(source, results, false, reply);
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}
