import { NextResponse } from 'next/server';
import { getAgentStore, saveAgentStore, runAgentWorker, restartAgent } from '@/brain/agentManager';

export const runtime = 'nodejs';

export async function GET() {
  const store = getAgentStore();
  return NextResponse.json(store);
}

export async function POST(req: Request) {
  const body = await req.json();
  const store = getAgentStore();
  if (body.action === 'killAgent' && body.id) {
    if (store.agents[body.id]) {
      store.agents[body.id].status = 'sleeping';
      store.agents[body.id].logs.push(`[SYSTEM] Agent manually stopped by user. Entering sleep mode.`);
      saveAgentStore(store);
    }
  } else if (body.action === 'wakeAgent' && body.id) {
    if (store.agents[body.id]) {
      restartAgent(store.agents[body.id].name);
    }
  } else if (body.action === 'updateConfig') {
    if (body.agentId && store.agents[body.agentId]) {
      const agent = store.agents[body.agentId];
      agent.maxTokens = body.maxTokens ?? agent.maxTokens;
      agent.useRotorQuant = body.useRotorQuant ?? agent.useRotorQuant;
      
      const wasAutonomous = agent.isAutonomous;
      agent.isAutonomous = body.isAutonomous ?? agent.isAutonomous;
      agent.pollingInterval = body.pollingInterval ?? agent.pollingInterval;

      // If we just turned ON autonomous mode, we should ensure the worker starts running
      if (agent.isAutonomous && !wasAutonomous) {
         agent.status = 'running';
         agent.logs.push(`[SYSTEM] Autonomous Mode enabled. Interval: ${Math.round(agent.pollingInterval / 60000)}m`);
         saveAgentStore(store);
         runAgentWorker(body.agentId);
      } else {
         saveAgentStore(store);
      }
    } else if (body.overallLimit) {
      store.overallKvLimit = body.overallLimit;
      saveAgentStore(store);
    }
  }

  return NextResponse.json({ success: true });
}
