import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text');

  if (!text) {
    return new Response('Text required', { status: 400 });
  }

  // Clean text for TTS — strip emojis, markdown, and special chars
  const cleanText = text
    // Strip markdown formatting
    .replace(/```[\s\S]*?```/g, '')          // code blocks
    .replace(/`[^`]+`/g, '')                  // inline code
    .replace(/[*_#>~]/g, '')                  // markdown syntax
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → keep label
    // Strip ALL emoji categories
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')  // emoticons, symbols, maps
    .replace(/[\u{2600}-\u{27BF}]/gu, '')    // misc symbols
    .replace(/[\u{2300}-\u{23FF}]/gu, '')    // misc technical
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')    // variation selectors
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // supplemental symbols
    .replace(/[\uD800-\uDFFF]/gu, '')         // surrogates 
    // Strip zero-width chars and joiners
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Clean up whitespace artifacts
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanText || cleanText.length < 2) {
    return new Response('', { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  }

  // Safety cap: TTS max 500 chars per sentence to avoid stalls
  const cappedText = cleanText.slice(0, 500);

  const venvPath = path.join(process.cwd(), 'src', 'voice_engine', '.venv', 'Scripts', 'edge-tts.exe');
  
  // Voice: en-IN-NeerjaNeural (Premium Hinglish voice)
  const args = [
    '--text', cappedText,
    '--voice', 'en-IN-NeerjaNeural',
    '--rate', '+15%'
  ];

  const ttsProcess = spawn(venvPath, args);

  const stream = new ReadableStream({
    start(controller) {
      ttsProcess.stdout.on('data', (chunk) => {
        controller.enqueue(chunk);
      });

      ttsProcess.on('close', (code) => {
        controller.close();
      });

      ttsProcess.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      ttsProcess.kill();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    },
  });
}
