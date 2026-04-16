import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/brain/workspace';
import { getAgentStore } from '@/brain/agentManager';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string, filename: string }> }
) {
  const { id, filename } = await params;
  try {
    const store = getAgentStore();
    const agent = store.agents[id];
    const folder = agent?.folder || id;
    const content = readWorkspaceFile(folder, filename);
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string, filename: string }> }
) {
  const { id, filename } = await params;
  try {
    const { content } = await req.json();
    
    // Basic Sanitization
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid content format' }, { status: 400 });
    }

    const store = getAgentStore();
    const agent = store.agents[id];
    const folder = agent?.folder || id;

    writeWorkspaceFile(folder, filename, content);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
