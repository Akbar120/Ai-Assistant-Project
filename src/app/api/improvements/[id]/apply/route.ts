import { NextRequest, NextResponse } from 'next/server';
import { applyImprovement } from '@/brain/improvementService';

export const runtime = 'nodejs';

/** POST /api/improvements/[id]/apply — write file change after approval */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = applyImprovement(id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: 'Improvement applied successfully.' });
}
