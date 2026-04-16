import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  
  try {
    console.log(`[Diagnostic] Testing connection to Ollama at: ${url}`);
    
    const start = Date.now();
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    const duration = Date.now() - start;

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json({
        ok: false,
        url,
        status: res.status,
        statusText: res.statusText,
        error: errorText,
        duration
      });
    }

    const data = await res.json();
    return NextResponse.json({
      ok: true,
      url,
      duration,
      data
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      url,
      error: err.message || String(err),
      stack: err.stack,
      code: err.code, // e.g., ECONNREFUSED
    });
  }
}
