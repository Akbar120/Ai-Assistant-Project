import { NextRequest, NextResponse } from 'next/server';
import {
  createImprovement,
  listImprovements,
  updateImprovementStatus,
  ImprovementStatus,
} from '@/brain/improvementService';

export const runtime = 'nodejs';

/** GET /api/improvements?status=pending */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as ImprovementStatus | null;
  const items = listImprovements(status ?? undefined);
  return NextResponse.json({ improvements: items, count: items.length });
}

/** POST /api/improvements — create a new request */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestedBy, title, what, files, why, if_approved, if_rejected, patch } = body;

    if (!requestedBy || !title || !what || !files || !why) {
      return NextResponse.json({ error: 'Missing required fields: requestedBy, title, what, files, why' }, { status: 400 });
    }

    const request = createImprovement({
      requestedBy,
      title,
      what,
      files: Array.isArray(files) ? files : [files],
      why,
      if_approved: if_approved || 'Change will be applied to the listed files.',
      if_rejected: if_rejected || 'No files will be modified.',
      patch,
    });

    return NextResponse.json({ success: true, improvement: request });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/improvements — approve or reject a request */
export async function PATCH(req: NextRequest) {
  try {
    const { id, action } = await req.json();
    if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }

    const status: ImprovementStatus = action === 'approve' ? 'approved' : 'rejected';
    const updated = updateImprovementStatus(id, status);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, improvement: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
