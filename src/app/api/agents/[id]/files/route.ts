import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceFiles, initializeWorkspace } from '@/brain/workspace';
import { getAgentStore } from '@/brain/agentManager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Lazy Initialization: Ensure workspace exists before listing
    console.log('Fetching files for agent ID:', id);
    const store = getAgentStore();
    const agent = store.agents[id];
    if (!agent) {
       console.log('Agent not found in store for ID:', id);
       console.log('Available keys:', Object.keys(store.agents));
       throw new Error('Agent not found');
    }
    const files = getWorkspaceFiles(agent.folder || id);
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
    console.error('Files API Error:', error);
    return NextResponse.json({ error: 'Failed to list workspace files', details: String(error) }, { status: 500 });
  }
}
