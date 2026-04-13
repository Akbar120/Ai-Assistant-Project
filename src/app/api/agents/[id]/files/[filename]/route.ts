import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/brain/workspace';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string, filename: string } }
) {
  const { id, filename } = params;
  try {
    const content = readWorkspaceFile(id, filename);
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string, filename: string } }
) {
  const { id, filename } = params;
  try {
    const { content } = await req.json();
    
    // Basic Sanitization
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid content format' }, { status: 400 });
    }

    writeWorkspaceFile(id, filename, content);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
