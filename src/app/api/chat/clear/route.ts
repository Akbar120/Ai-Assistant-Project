import { NextResponse } from 'next/server';
import { clearChatHistory } from '@/lib/chatHistory';
import { resetAll } from '@/brain/modeManager';

export async function POST() {
  try {
    // 1. Clear persistent file memory
    await clearChatHistory();
    
    // 2. Reset in-memory state machine
    resetAll();
    
    console.log('[API] Chat history and mode state cleared.');
    
    return NextResponse.json({ success: true, message: 'Chat memory cleared' });
  } catch (err) {
    console.error('[API] Failed to clear chat:', err);
    return NextResponse.json({ success: false, error: 'Failed to clear chat memory' }, { status: 500 });
  }
}
