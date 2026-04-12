import { spawnAgent, Agent } from '../brain/agentManager';

export interface PendingAgent {
  agentName: string;
  role: string;
  goal: string;
}

let pendingAgentStore: PendingAgent | null = null;

export function proposeAgentCreation(input: PendingAgent) {
  pendingAgentStore = input;
  return {
    status: 'confirm',
    reply: `⚠️ I need an AI Agent to handle this complex task.\n\nAgent Name: **${input.agentName}**\nRole: ${input.role}\nObjective: ${input.goal}\n\nShall I create and assign this agent? (Reply YES to approve)`,
    data: input
  };
}

export function executePendingAgent(): { reply: string, agent?: Agent } {
  if (!pendingAgentStore) return { reply: 'No agent pending to be created.' };

  const agent = spawnAgent(pendingAgentStore.agentName, pendingAgentStore.role, pendingAgentStore.goal);
  pendingAgentStore = null;

  return {
    reply: `✅ Agent **${agent.name}** has been spawned and is now running in the background! You can check the Agents dashboard for its logs.`,
    agent
  };
}

export function clearPendingAgent() {
  pendingAgentStore = null;
}

export function getPendingAgent() {
  return pendingAgentStore;
}
