import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceFiles, initializeWorkspace } from '@/brain/workspace';
import { getAgentStore } from '@/brain/agentManager';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    // Lazy Initialization: Ensure workspace exists before listing
    const store = getAgentStore();
    const agent = store.agents[id];
    if (agent) {
      initializeWorkspace(id, { name: agent.name, role: agent.role, goal: agent.goal });
    }

    const files = getWorkspaceFiles(id);
    // Add type/role metadata based on filename
    const metadata = files.map(f => ({
      name: f,
      type: f.replace('.md', ''),
      role: f === 'IDENTITY.md' ? 'Identity' :
            f === 'SOUL.md' ? 'Personality' :
            f === 'MEMORY.md' ? 'Long-term Memory' :
            f === 'TOOLS.md' ? 'Capabilities' :
            f === 'AGENTS.md' ? 'Instructions' : 'Context'
    }));
    return NextResponse.json({ files: metadata });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list workspace files' }, { status: 500 });
  }
}
