import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const model = req.nextUrl.searchParams.get('model') || 'gemma4:e4b';
  
  // Fire and forget, don't await to avoid timeout
  fetch('http://127.0.0.1:11434/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model })
  }).catch(console.error);
  
  return NextResponse.json({ success: true, message: `Started pulling ${model}` });
}
