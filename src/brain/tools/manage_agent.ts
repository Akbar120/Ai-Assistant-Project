import fs from 'fs';
import path from 'path';
import { getAgentStore, saveAgentStore, logAgentAction, restartAgent, spawnAgent } from '../agentManager';

export interface ManageAgentResult {
  success: boolean;
  reply: string;
  error?: string;
}

type ManageAgentOperation =
  | 'create_agent'
  | 'assign_tool'
  | 'unassign_tool'
  | 'assign_skill'
  | 'unassign_skill'
  | 'restart_agent'
  | 'delete_agent'
  | 'delete_skill'
  | 'update_config';

function normalizeSkillId(value?: string): string | null {
  if (!value || typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return /^[a-z0-9_]+$/.test(normalized) ? normalized : null;
}

function resolveSkillPath(skillId: string): string {
  const skillsDir = path.resolve(process.cwd(), 'src', 'brain', 'skills');
  const skillPath = path.resolve(skillsDir, `${skillId}.md`);
  const skillsDirWithSep = `${skillsDir}${path.sep}`.toLowerCase();

  if (!skillPath.toLowerCase().startsWith(skillsDirWithSep)) {
    throw new Error('Invalid skill path.');
  }

  return skillPath;
}

export async function execute_manage_agent(args: {
  operation: ManageAgentOperation;
  target_agent?: string;
  agentName?: string;
  role?: string;
  goal?: string;
  details?: Record<string, any>;
  tool_id?: string;
  skill_id?: string;
  skill_name?: string;
  config_updates?: Record<string, any>;
  requester?: string;
}): Promise<ManageAgentResult> {
  const { operation, target_agent, tool_id, skill_id, requester } = args;
  const requiresTargetAgent = operation !== 'create_agent' && operation !== 'delete_skill';

  // ─── Security Guard ────────────────────────────────────────────────────────
  // NO ONE can use this tool to manage Jenny. Only the owner can do that via UI.
  if (!operation) {
    return { success: false, reply: 'operation is required.', error: 'MISSING_ARG' };
  }

  if (requiresTargetAgent && !target_agent) {
    return {
      success: false,
      reply: `target_agent is required for operation '${operation}'.`,
      error: 'MISSING_ARG',
    };
  }

  if (target_agent && operation !== 'create_agent' && (target_agent.toLowerCase() === 'system_jenny' || target_agent.toLowerCase() === 'jenny')) {
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
  let resolvedKey = target_agent || '';
  if (requiresTargetAgent && target_agent && !store.agents[target_agent]) {
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

  if (requiresTargetAgent && !store.agents[resolvedKey] && operation !== 'delete_agent') {
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
      case 'create_agent': {
        const agentName = args.agentName || target_agent || 'New Agent';
        const role = args.role || 'AI Assistant';
        const goal = args.goal || args.details?.goal || 'Assist with tasks';
        const details = args.details || {};
        const agent = spawnAgent(agentName, role, goal, details);
        return {
          success: true,
          reply: `✅ Created agent '${agent.name}' with tools: ${(agent.tools || []).join(', ') || 'none'} and skills: ${(agent.skills || []).join(', ') || 'none'}.`,
        };
      }

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

      case 'assign_skill': {
        if (!skill_id) return { success: false, reply: 'skill_id is required.', error: 'MISSING_ARG' };
        
        // 1. Add skill to agent's list
        agent.skills = Array.from(new Set([...(agent.skills || []), skill_id]));
        
        // 2. Automatically assign tools mentioned in the skill definition
        try {
          const fsMod = require('fs');
          const pathMod = require('path');
          const skillName = skill_id.toLowerCase().replace(/\.md$/, '');
          const skillPath = pathMod.join(process.cwd(), 'src', 'brain', 'skills', `${skillName}.md`);
          
          if (fsMod.existsSync(skillPath)) {
            const content = fsMod.readFileSync(skillPath, 'utf8');
            // Extract anything inside backticks in the Tool Access section
            const toolAccessSection = content.match(/## 🔐 Tool Access([\s\S]*?)(?=\n##|$)/i);
            if (toolAccessSection) {
              const mentionedTools = toolAccessSection[1].match(/`([^`()]+)(?:\([^`]*\))?`/g);
              if (mentionedTools) {
                const toolIds = mentionedTools.map((m: string) => m.replace(/`/g, '').split('(')[0].trim());
                agent.allowedTools = Array.from(new Set([...(agent.allowedTools || []), ...toolIds]));
                agent.tools = Array.from(new Set([...(agent.tools || []), ...toolIds]));
              }
            }
          }
        } catch (e) {
          console.warn(`[ManageAgent] Failed to auto-assign tools for skill ${skill_id}:`, e);
        }

        logAgentAction(resolvedKey, `Skill "${skill_id}" assigned by ${byWhom}. Tools auto-authorized.`, 'SYSTEM', 'Skill Assign');
        saveAgentStore(store);
        return { success: true, reply: `✅ Assigned skill '${skill_id}' to agent '${agent.name || resolvedKey}'. Tools mentioned in the skill are now authorized.` };
      }

      case 'delete_skill': {
        const normalizedSkillId = normalizeSkillId(skill_id || args.skill_name || args.details?.skill_id || args.details?.skillName || args.details?.name);
        if (!normalizedSkillId) {
          return { success: false, reply: 'skill_id is required for delete_skill.', error: 'MISSING_ARG' };
        }

        const skillPath = resolveSkillPath(normalizedSkillId);
        if (!fs.existsSync(skillPath)) {
          return {
            success: false,
            reply: `Skill '${normalizedSkillId}' was not found.`,
            error: 'SKILL_NOT_FOUND',
          };
        }

        fs.unlinkSync(skillPath);
        return { success: true, reply: `Deleted skill '${normalizedSkillId}'.` };
      }

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

      case 'update_config': {
        if (!args.config_updates || typeof args.config_updates !== 'object') {
          return { success: false, reply: 'config_updates object is required for this operation.', error: 'MISSING_ARG' };
        }
        let reply = `✅ Updated config for '${agent.name || resolvedKey}':`;
        for (const [key, val] of Object.entries(args.config_updates)) {
          (agent as any)[key] = val;
          reply += `\n- ${key} = ${val}`;
          
          // Specially update HEARTBEAT.md if pollingInterval changed
          if (key === 'pollingInterval') {
            try {
              const fsMod = require('fs');
              const pathMod = require('path');
              const agentFolder = agent.folder || resolvedKey;
              const heartbeatPath = pathMod.join(process.cwd(), 'workspace', 'agents', agentFolder, 'HEARTBEAT.md');
              let content = `Run interval: ${val}ms`;
              if (fsMod.existsSync(heartbeatPath)) {
                content = fsMod.readFileSync(heartbeatPath, 'utf8');
                content = content.replace(/pollingInterval:?\s*\d+/i, `pollingInterval: ${val}`);
                if (!content.includes('pollingInterval')) {
                   content += `\n\npollingInterval: ${val}`;
                }
              }
              fsMod.writeFileSync(heartbeatPath, content, 'utf8');
            } catch (e) {
              console.error("[ManageAgent] Failed to update HEARTBEAT.md", e);
            }
          }
        }
        logAgentAction(resolvedKey, `Configuration updated by ${byWhom}. Keys: ${Object.keys(args.config_updates).join(', ')}`, 'SYSTEM', 'Config Update');
        saveAgentStore(store);
        return { success: true, reply };
      }

      default:
        return { success: false, reply: `Unknown operation: ${operation}`, error: 'UNKNOWN_OP' };
    }
  } catch (err: any) {
    return { success: false, reply: `Operation failed: ${err.message}`, error: err.message };
  }
}
