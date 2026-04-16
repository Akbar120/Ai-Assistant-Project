/**
 * /api/ollama/models
 * ─────────────────────────────────────────────
 * GET  → { models: string[], active: string }
 * POST → { model: string } → persists + returns { ok: true, active: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveModel, setActiveModel, DEFAULT_MODEL } from '@/lib/ollama';

export const runtime = 'nodejs';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

export async function GET() {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });

    if (!resp.ok) {
      return NextResponse.json(
        { models: [], active: getActiveModel(), error: `Ollama HTTP ${resp.status}` },
        { status: 200 } // always 200 — client handles "offline" state
      );
    }

    const data = await resp.json();
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
    const active = getActiveModel();

    // If persisted model no longer exists (was deleted), fall back to first available
    const validActive = models.includes(active) ? active : (models[0] || DEFAULT_MODEL);

    return NextResponse.json({ models, active: validActive });
  } catch (err: any) {
    return NextResponse.json({
      models: [],
      active: getActiveModel(),
      error: err.message,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const model = body?.model?.trim();

    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'model required' }, { status: 400 });
    }

    setActiveModel(model);
    console.log(`[ModelSelector] Active model set to: ${model}`);

    return NextResponse.json({ ok: true, active: model });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
