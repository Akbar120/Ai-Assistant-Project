'use client';

import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '@/components/chat/ChatProvider';
import { useVoiceEngine } from './useVoiceEngine';
import { useStreamingTTS } from './useStreamingTTS';
import type { ChatMessage } from '@/lib/chat-types';

export function useMessagePipeline() {
  const { appendMessage, messages, setLoading, setProcessingTaskLabel, isMuted, updateMessage } = useChatStore();
  
  // Use a ref so dedup checks always see the latest messages, not a stale closure
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  
  // ─── Forward Declaration ──────────────────────────────────────────────────
  const handleUserRef = useRef<any>(null);

  // STEP 1: ONLY ONE ENTRY POINT. Removed the autonomous voice listener here. 
  // Transcription is now handled EXCLUSIVELY via IPC in ChatPage.
  const { speak } = useVoiceEngine();
  const { enqueue, stopAllTTS } = useStreamingTTS();

  const spokenCache = useRef<Set<string>>(new Set());
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const maybeSpeak = useCallback((text: string, source: any, priority = false) => {
    if (!text || isMutedRef.current) return;
    
    // ISSUE 4: Never verbalize system logs or internal messages
    if (source === 'system') return;
    if (source === 'agent' && text.includes('[BACKGROUND]')) return;
    if (source === 'agent' && (text.length < 5 || text.startsWith('{'))) return; 
    
    // FIX 5: spokenCache check (Zero repetitive speech)
    if (spokenCache.current.has(text)) return;
    spokenCache.current.add(text);

    enqueue(text, priority);
  }, [enqueue, isMuted]);

  // ─── Request Tracker (Race Condition Protection) ──────────────────────────
  const pendingRequests = useRef<Set<string>>(new Set());

  /**
   * 1. handleUserRequest
   */
  const handleUserRequest = useCallback(async (
    content: string, 
    source: 'chat' | 'voice' | 'agent' | 'system' = 'chat',
    file?: any
  ) => {
    // 🔥 STOP STALE SPEECH IMMEDIATELY (Barge-in / New Context)
    stopAllTTS();

    const requestId = uuidv4();
    const messageId = uuidv4();
    pendingRequests.current.add(requestId);

    const message: ChatMessage = {
      id: messageId,
      role: 'user',
      content,
      source,
      status: 'done',
      timestamp: Date.now(),
      requestId,
      file,
    };

    // ISSUE 3: Symmetric Deduplication (uses ref for current state)
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last && last.role === message.role && last.content.trim() === message.content.trim()) {
       console.log(`[Pipeline] Blocked duplicate user input.`);
       return { requestId, messageId }; 
    }

    console.log(`[Pipeline] New User Request [${requestId}]: "${content.substring(0, 30)}..."`);
    await appendMessage(message);

    return { requestId, messageId };
  }, [appendMessage]);

  /**
   * 2. handleAssistantResponse
   * @param persist - Set to false when the server already saved the message (avoids double-write)
   */
  const handleAssistantResponse = useCallback(async (
    content: string,
    source: 'chat' | 'voice' | 'agent' | 'system' | 'primary' | 'sync' = 'chat',
    requestId?: string,
    metadata?: Partial<ChatMessage>,
    persist = true  // <-- KEY FIX: false = UI-only, no database write
  ) => {
    // ISSUE 1: Strict Pending Request Validation
    // For streamed parts, we no longer delete the requestId immediately.
    if (requestId && !pendingRequests.current.has(requestId) && source !== 'primary') {
      console.warn(`[Pipeline] Ignoring stale/unknown response for: ${requestId}`);
      return;
    }

    const messageId = metadata?.id || uuidv4();
    const message: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: content || '',
      source,
      hash: (content || '').trim(),
      status: 'done',
      timestamp: Date.now(),
      requestId,
      ...metadata
    };

    // FIX 3: Ignore background 'sync' messages if we are currently processing a 'primary' request
    if (source === 'sync' && requestId && pendingRequests.current.has(requestId)) {
       console.log(`[Pipeline] Ignoring sync message for active request: ${requestId}`);
       return;
    }

    // ISSUE 3: Symmetric Deduplication
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last && last.role === message.role && (last.content || '').trim() === (message.content || '').trim()) {
       console.log(`[Pipeline] Blocked duplicate assistant reply.`);
       // Still speak if not yet spoken
       maybeSpeak(content || '', source);
       return;
    }

    console.log(`[Pipeline] Assistant Response [${requestId || 'N/A'}] persist=${persist}: "${content.substring(0, 30)}..."`);
    spokenIds.current.add(messageId);

    // 🔥 PARALLELIZE: Speech vs Persistence
    const speakPromise = metadata?.silent ? Promise.resolve() : maybeSpeak(content, source, source === 'primary');
    const savePromise = appendMessage(message, persist);

    await Promise.all([speakPromise, savePromise]);

    return { messageId };
  }, [appendMessage, maybeSpeak]);

  // Sync ref for the voice engine callback
  handleUserRef.current = handleUserRequest;

  // ─── Background Sync (TTS for polled messages) ───────────────────────────
  const initializedStore = useRef(false);
  const spokenIds = useRef<Set<string>>(new Set());
  
  // Track messages that I personally added to avoid double-speaking
  const trackedByMe = useRef<Set<string>>(new Set());

  // Initialize spokenIds with current messages to avoid "speaking the whole history" on mount
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    if (!initializedStore.current) {
      messages.forEach(m => spokenIds.current.add(m.id));
      initializedStore.current = true;
    }
  }, [messages]);

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    messages.forEach(msg => {
      if (msg.role === 'assistant' && !spokenIds.current.has(msg.id)) {
        console.log(`[Pipeline] Background message detected: ${msg.id}`);
        spokenIds.current.add(msg.id);
        // ONLY speak messages that came from background agents — NOT from 'primary'/'chat' which
        // are already spoken inline sentence-by-sentence during streaming.
        if (msg.source === 'agent' || msg.source === 'system') {
          maybeSpeak(msg.content, msg.source, false);
        }
      }
    });
  }, [messages, maybeSpeak]);

  // NOTE: Agent notifications no longer injected into chat.
  // They live exclusively in /notifications. The sidebar badge
  // provides the unread indicator. No proactive chat pollution.

  return {
    handleUserRequest,
    handleAssistantResponse,
    updateMessage,
    maybeSpeak,
    stopAllTTS,
    pendingRequests
  };
}

/**
 * Helper to determine if a message indicates the user has "responded" to a notification
 */
function hasUserResponded(messages: any[], notificationId: string): boolean {
  return messages.some(m => m.role === 'user' && m.timestamp > Date.now() - 65000);
}

