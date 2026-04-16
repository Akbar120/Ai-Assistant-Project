import fs from 'fs';
import path from 'path';
import { getAgentStore } from '../agentManager';
import { getAllTasks, exists as taskExists, appendLog, updateTask } from '../taskService';

// ─── Lightweight Scoped Cache ───────────────────────────────────────────────
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3000; // 3-second TTL

function getCacheKey(requester: string, tool: string) {
  return `${requester}_${tool}`;
}

// ─── Standardized Response Wrapper ──────────────────────────────────────────
function wrapResponse<T>(source: string, data: T, cached = false): any {
  return {
    success: true,
    data,
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
    return wrapResponse(source, config);
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
    return wrapResponse(source, platforms);
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
    return wrapResponse(source, agents);
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
    return wrapResponse(source, summary);
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
    return wrapResponse(source, files.map(f => f.replace('.md', '')));
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}

/**
 * Reads an agent's recent output/memory to help Jenny understand its state.
 */
export async function get_agent_output(args: { task_id?: string; requester?: string; agent_id: string }) {
  const { task_id, requester = 'orchestrator', agent_id } = args;
  const source = 'get_agent_output';

  if (!(await checkPermissions(requester, source))) return wrapError(source, 'Unauthorized');

  try {
    const store = getAgentStore();
    const agent = store.agents[agent_id];
    if (!agent) throw new Error(`Agent not found: ${agent_id}`);

    const folder = agent.folder;
    const memory = fs.readFileSync(path.join(process.cwd(), 'workspace', 'agents', folder, 'MEMORY.md'), 'utf-8');
    const logs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'workspace', 'agents', folder, 'logs.json'), 'utf-8'));

    return wrapResponse(source, {
      id: agent_id,
      name: agent.name,
      memorySnippet: memory.slice(-2000), // Get recent memory
      recentLogs: logs.slice(-10) // Get last 10 logs
    });
  } catch (err: any) {
    return wrapError(source, err.message);
  }
}
