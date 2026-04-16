import { getAgentStore, saveAgentStore, logAgentAction, restartAgent } from '../agentManager';

export interface ManageAgentResult {
  success: boolean;
  reply: string;
  error?: string;
}

export async function execute_manage_agent(args: {
  operation: 'assign_tool' | 'unassign_tool' | 'assign_skill' | 'unassign_skill' | 'restart_agent' | 'delete_agent';
  target_agent: string;
  tool_id?: string;
  skill_id?: string;
  requester?: string;
}): Promise<ManageAgentResult> {
  const { operation, target_agent, tool_id, skill_id, requester } = args;

  // ─── Security Guard ────────────────────────────────────────────────────────
  // NO ONE can use this tool to manage Jenny. Only the owner can do that via UI.
  if (target_agent.toLowerCase() === 'system_jenny' || target_agent.toLowerCase() === 'jenny') {
    return {
      success: false,
      reply: `[Security Guard] Operation blocked: You are not authorized to modify or restart 'system_jenny'.`,
      error: 'UNAUTHORIZED',
    };
  }

  const store = getAgentStore();

  // ─── Resolve target_agent to a store key ───────────────────────────────────
  // LLM often passes a display name (e.g. "Helper_Agent") instead of the internal
  // random key (e.g. "agent_iji2gqp"). Try direct key lookup first, then fuzzy.
  let resolvedKey = target_agent;
  if (!store.agents[target_agent]) {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '');
    const normalizedTarget = normalize(target_agent);
    const entries = Object.entries(store.agents);
    const byName = entries.find(([, a]: [string, any]) => {
      const n = normalize(a.name || '');
      return n === normalizedTarget || n.includes(normalizedTarget) || normalizedTarget.includes(n);
    });
    if (byName) {
      resolvedKey = byName[0];
    } else if (operation !== 'delete_agent') {
      return {
        success: false,
        reply: `Agent '${target_agent}' not found in the system.`,
        error: 'AGENT_NOT_FOUND',
      };
    }
  }

  if (!store.agents[resolvedKey] && operation !== 'delete_agent') {
    return {
      success: false,
      reply: `Agent '${target_agent}' not found in the system.`,
      error: 'AGENT_NOT_FOUND',
    };
  }

  const agent = store.agents[resolvedKey];
  const byWhom = requester || 'system';

  try {
    switch (operation) {
      case 'assign_tool':
        if (!tool_id) return { success: false, reply: 'tool_id is required.', error: 'MISSING_ARG' };
        agent.allowedTools = Array.from(new Set([...(agent.allowedTools || []), tool_id]));
        agent.tools = Array.from(new Set([...(agent.tools || []), tool_id]));
        logAgentAction(resolvedKey, `Tool "${tool_id}" assigned by ${byWhom}.`, 'SYSTEM', 'Tool Assign');
        saveAgentStore(store);
        return { success: true, reply: `✅ Assigned tool '${tool_id}' to agent '${agent.name || resolvedKey}'.` };

      case 'unassign_tool':
        if (!tool_id) return { success: false, reply: 'tool_id is required.', error: 'MISSING_ARG' };
        agent.allowedTools = (agent.allowedTools || []).filter(t => t !== tool_id);
        agent.tools = (agent.tools || []).filter(t => t !== tool_id);
        logAgentAction(resolvedKey, `Tool "${tool_id}" unassigned by ${byWhom}.`, 'SYSTEM', 'Tool Unassign');
        saveAgentStore(store);
        return { success: true, reply: `✅ Unassigned tool '${tool_id}' from agent '${agent.name || resolvedKey}'.` };

      case 'assign_skill':
        if (!skill_id) return { success: false, reply: 'skill_id is required.', error: 'MISSING_ARG' };
        agent.skills = Array.from(new Set([...(agent.skills || []), skill_id]));
        logAgentAction(resolvedKey, `Skill "${skill_id}" assigned by ${byWhom}.`, 'SYSTEM', 'Skill Assign');
        saveAgentStore(store);
        return { success: true, reply: `✅ Assigned skill '${skill_id}' to agent '${agent.name || resolvedKey}'.` };

      case 'unassign_skill':
        if (!skill_id) return { success: false, reply: 'skill_id is required.', error: 'MISSING_ARG' };
        agent.skills = (agent.skills || []).filter(s => s !== skill_id);
        logAgentAction(resolvedKey, `Skill "${skill_id}" unassigned by ${byWhom}.`, 'SYSTEM', 'Skill Unassign');
        saveAgentStore(store);
        return { success: true, reply: `✅ Unassigned skill '${skill_id}' from agent '${agent.name || resolvedKey}'.` };

      case 'restart_agent':
        restartAgent(resolvedKey);
        return { success: true, reply: `✅ Triggered restart loop for agent '${agent.name || resolvedKey}'.` };

      case 'delete_agent': {
        // Re-read agent from store (may use resolvedKey)
        const agentRecord = store.agents[resolvedKey];
        const agentDisplayName = agentRecord?.name || target_agent;
        const agentFolder = agentRecord?.folder || resolvedKey;
        delete store.agents[resolvedKey];
        saveAgentStore(store);
        const pathMod = require('path');
        const fsMod = require('fs');
        const agentPath = pathMod.join(process.cwd(), 'workspace', 'agents', agentFolder);
        if (fsMod.existsSync(agentPath)) {
          fsMod.rmSync(agentPath, { recursive: true, force: true });
        }
        return { success: true, reply: `✅ Agent '${agentDisplayName}' has been permanently deleted from memory and disk.` };
      }

      default:
        return { success: false, reply: `Unknown operation: ${operation}`, error: 'UNKNOWN_OP' };
    }
  } catch (err: any) {
    return { success: false, reply: `Operation failed: ${err.message}`, error: err.message };
  }
}
