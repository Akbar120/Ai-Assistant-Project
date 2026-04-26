import { NextResponse } from 'next/server';
import { getCurrentMode, forceTransition, JennyMode } from '@/brain/modeManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/mode
 * Returns Jenny's current operational mode.
 */
export async function GET() {
  const mode = getCurrentMode();
  return NextResponse.json({ mode });
}

/**
 * POST /api/chat/mode
 * Manually force a mode transition (for debugging/fixing stuck states).
 */
export async function POST(req: Request) {
  try {
    const { mode } = await req.json();
    if (!mode) return NextResponse.json({ success: false, error: 'Missing mode' }, { status: 400 });
    
    forceTransition(mode as JennyMode);
    return NextResponse.json({ success: true, mode: getCurrentMode() });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
