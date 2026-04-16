import { NextResponse } from 'next/server';
import {
  getAgentStore,
  saveAgentStore,
  runAgentWorker,
  restartAgent,
  pauseAgent,
  resumeAgent,
  clearAgentMemory,
  clearAgentLogs,
  reloadAgentSkills,
  reloadAgentTools,
  ensureJennyAgent,
  logAgentAction,
} from '@/brain/agentManager';
import { startAgentWorker } from '@/brain/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ensure Jenny exists on every GET of the agents store
export async function GET() {
  ensureJennyAgent();
  const store = getAgentStore();
  return NextResponse.json(store);
}

export async function POST(req: Request) {
  const body = await req.json();
  const store = getAgentStore();

  switch (body.action) {
    case 'killAgent':
      if (body.id && store.agents[body.id] && !store.agents[body.id].isSystem) {
        store.agents[body.id].status = 'sleeping';
        logAgentAction(body.id, 'Agent manually stopped by user. Entering sleep mode.', 'SYSTEM', 'Kill Process');
        saveAgentStore(store);
      }
      break;

    case 'wakeAgent':
      if (body.id && store.agents[body.id]) {
        restartAgent(store.agents[body.id].name);
      }
      break;

    case 'pauseAgent':
      if (body.id) pauseAgent(body.id);
      break;

    case 'resumeAgent':
      if (body.id) resumeAgent(body.id);
      break;

    case 'restartAgent':
      if (body.id && store.agents[body.id]) {
        resumeAgent(body.id);
      }
      break;

    case 'forceCycle':
      if (body.id && store.agents[body.id]) {
        logAgentAction(body.id, 'Force execute cycle triggered by user.', 'SYSTEM', 'Force Cycle');
        startAgentWorker(body.id); // non-blocking
      }
      break;

    case 'clearMemory':
      if (body.id) clearAgentMemory(body.id);
      break;

    case 'clearLogs':
      if (body.id) clearAgentLogs(body.id);
      break;

    case 'reloadSkills':
      if (body.id) reloadAgentSkills(body.id);
      break;

    case 'reloadTools':
      if (body.id) reloadAgentTools(body.id);
      break;

    case 'updateConfig':
      if (body.agentId && store.agents[body.agentId]) {
        const agent = store.agents[body.agentId];
        agent.maxTokens = body.maxTokens ?? agent.maxTokens;
        agent.useRotorQuant = body.useRotorQuant ?? agent.useRotorQuant;
        const wasAutonomous = agent.isAutonomous;
        agent.isAutonomous = body.isAutonomous ?? agent.isAutonomous;
        agent.pollingInterval = body.pollingInterval ?? agent.pollingInterval;
        if (agent.isAutonomous && !wasAutonomous) {
          agent.status = 'running';
          logAgentAction(body.agentId, `Autonomous Mode enabled. Interval: ${Math.round(agent.pollingInterval / 60000)}m`, 'SYSTEM', 'Autonomous On');
          saveAgentStore(store);
          runAgentWorker(body.agentId);
        } else {
          saveAgentStore(store);
        }
      } else if (body.overallLimit) {
        store.overallKvLimit = body.overallLimit;
        saveAgentStore(store);
      }
      break;

    case 'toggleTool': {
      const { id: agentId, toolId, enabled } = body;
      if (agentId && store.agents[agentId] && toolId) {
        const agent = store.agents[agentId];
        const allowed = new Set(agent.allowedTools || []);
        const tools = new Set(agent.tools || []);
        if (enabled) {
          allowed.add(toolId);
          tools.add(toolId);
        } else {
          allowed.delete(toolId);
          tools.delete(toolId);
        }
        agent.allowedTools = Array.from(allowed);
        agent.tools = Array.from(tools);
        logAgentAction(agentId, `Tool "${toolId}" ${enabled ? 'enabled' : 'disabled'} by user.`, 'SYSTEM', 'Tool Toggle');
        saveAgentStore(store);
      }
      break;
    }

    case 'enableAllTools': {
      const { id: agentId, toolIds } = body;
      if (agentId && store.agents[agentId] && Array.isArray(toolIds)) {
        store.agents[agentId].allowedTools = [...new Set([...(store.agents[agentId].allowedTools || []), ...toolIds])];
        store.agents[agentId].tools = [...store.agents[agentId].allowedTools];
        logAgentAction(agentId, `All tools enabled by user.`, 'SYSTEM', 'Enable All Tools');
        saveAgentStore(store);
      }
      break;
    }

    case 'unassignSkill': {
      const { id: agentId, skillId } = body;
      if (agentId && store.agents[agentId] && skillId) {
        const agent = store.agents[agentId];
        const skills = new Set(agent.skills || []);
        skills.delete(skillId);
        agent.skills = Array.from(skills);
        logAgentAction(agentId, `Skill "${skillId}" unassigned by user.`, 'SYSTEM', 'Skill Unassign');
        saveAgentStore(store);
      }
      break;
    }

    case 'assignSkill': {
      const { id: agentId, skillId } = body;
      if (agentId && store.agents[agentId] && skillId) {
        const agent = store.agents[agentId];
        const skills = new Set(agent.skills || []);
        skills.add(skillId);
        agent.skills = Array.from(skills);
        logAgentAction(agentId, `Skill "${skillId}" assigned by user.`, 'SYSTEM', 'Skill Assign');
        saveAgentStore(store);
      }
      break;
    }

    case 'disableAllTools': {
      const { id: agentId } = body;
      if (agentId && store.agents[agentId]) {
        store.agents[agentId].allowedTools = [];
        store.agents[agentId].tools = [];
        logAgentAction(agentId, `All tools disabled by user.`, 'SYSTEM', 'Disable All Tools');
        saveAgentStore(store);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ success: true });
}
