import { NextResponse } from 'next/server';
import { getAgentStore, saveAgentStore } from '@/brain/agentManager';

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
      store.agents[body.id].status = 'error'; // simulate killed
      store.agents[body.id].logs.push(`[SYSTEM] Agent manually terminated by user.`);
      saveAgentStore(store);
    }
  } else if (body.action === 'updateConfig') {
    if (body.agentId && store.agents[body.agentId]) {
      store.agents[body.agentId].maxTokens = body.maxTokens ?? store.agents[body.agentId].maxTokens;
      store.agents[body.agentId].useRotorQuant = body.useRotorQuant ?? store.agents[body.agentId].useRotorQuant;
    } else if (body.overallLimit) {
      store.overallKvLimit = body.overallLimit;
    }
    saveAgentStore(store);
  }

  return NextResponse.json({ success: true });
}
