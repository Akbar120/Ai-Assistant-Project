'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChatMessage } from '@/lib/chat-types';

interface ChatContextValue {
  hasHydrated: boolean;
  initialized: boolean;
  loading: boolean;
  messages: ChatMessage[];
  processingTaskLabel: string | null;
  setProcessingTaskLabel: (label: string | null) => void;
  appendMessage: (message: ChatMessage, persist?: boolean) => Promise<void>;
  replaceMessages: (messages: ChatMessage[], persist?: boolean) => Promise<void>;
  setLoading: (loading: boolean) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const MAX_MESSAGES = 30;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  
  for (const message of incoming) {
    if (!message?.id) continue;

    const last = current[current.length - 1];
    const incomingContent = (message.content || '').trim();
    const lastContent = (last?.content || '').trim();
    
    if (
      last &&
      last.role === message.role &&
      (last.hash === message.hash || lastContent === incomingContent) &&
      incomingContent.length > 0 &&
      Math.abs((typeof last.timestamp === 'number' ? last.timestamp : 0) - (typeof message.timestamp === 'number' ? message.timestamp : 0)) < 3000
    ) {
      console.log(`[Store] Duplicate blocked: "${incomingContent.substring(0, 20)}"`);
      continue;
    }

    map.set(message.id, message);
  }
  
  return Array.from(map.values())
    .sort((a, b) => {
      const tsA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime() || 0;
      const tsB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime() || 0;
      return tsA - tsB;
    })
    .slice(-MAX_MESSAGES);
}

async function persistMessages(messages: ChatMessage[]) {
  const response = await fetch('/api/chat/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error('Failed to persist chat messages');
  }

  const data = (await response.json()) as { messages?: ChatMessage[] };
  return data.messages ?? [];
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [processingTaskLabel, setProcessingTaskLabel] = useState<string | null>(null);
  const latestMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    latestMessageIdRef.current = messages.at(-1)?.id ?? null;
  }, [messages]);

  const refreshProcessingState = useCallback(async () => {
    const response = await fetch('/api/tasks?status=processing', { cache: 'no-store' });
    if (!response.ok) return;

    const tasks = (await response.json()) as Array<{ name?: string; source?: string }>;
    const chatTask = tasks.find((task) => task.source === 'chat');

    setProcessingTaskLabel(chatTask?.name ?? null);
    if (chatTask) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, []);

  const refreshLatestMessages = useCallback(async () => {
    const afterId = latestMessageIdRef.current;
    const response = await fetch(`/api/chat/latest${afterId ? `?after=${encodeURIComponent(afterId)}` : ''}`, {
      cache: 'no-store',
    });

    if (!response.ok) return;

    const data = (await response.json()) as { messages?: ChatMessage[] };
    if (!data.messages || data.messages.length === 0) return;

    // FIX 3: Tag polled messages as sync
    const syncMessages = data.messages.map(m => ({ ...m, source: 'sync' as const }));

    setMessages((current) => {
      const merged = mergeMessages(current, syncMessages);
      // FIX 4: Update ID ref immediately inside set state to ensure strict sequential polling
      latestMessageIdRef.current = merged.at(-1)?.id ?? null;
      return merged;
    });
    setLoading(false);
    setProcessingTaskLabel(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const response = await fetch('/api/chat/history', { cache: 'no-store' });
        if (!response.ok) return;

        const data = (await response.json()) as { messages?: ChatMessage[] };
        if (!cancelled) {
          setMessages(data.messages ?? []);
        }
      } finally {
        if (!cancelled) {
          await refreshProcessingState().catch(() => undefined);
          setInitialized(true);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [refreshProcessingState]);

  useEffect(() => {
    if (!initialized || (!loading && !processingTaskLabel)) return;

    const intervalId = window.setInterval(() => {
      void refreshLatestMessages().catch(() => undefined);
      void refreshProcessingState().catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [initialized, loading, processingTaskLabel, refreshLatestMessages, refreshProcessingState]);
  // NOTE: The immediate-fire effect that was here was REMOVED.
  // It was firing every time `loading` changed (which happens after EVERY message append),
  // causing a poll that refetched the just-saved message and created a duplicate.

  const appendMessage = useCallback(async (message: ChatMessage, persist = true) => {
    // 🔥 OPTIMISTIC UPDATE: Show message in UI immediately (removes ~1s delay)
    setMessages((current) => mergeMessages(current, [message]));
    latestMessageIdRef.current = message.id;

    if (persist) {
      try {
        await persistMessages([message]);
      } catch (e) {
        console.warn('[ChatProvider] Failed to persist message:', e);
        // Don't crash — message is already in UI
      }
    }
  }, []);

  const replaceMessages = useCallback(async (nextMessages: ChatMessage[], persist = true) => {
    if (persist) {
      const response = await fetch('/api/chat/history', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok) {
        throw new Error('Failed to replace chat history');
      }

      const data = (await response.json()) as { messages?: ChatMessage[] };
      setMessages(data.messages ?? []);
      return;
    }

    setMessages(nextMessages);
  }, []);

  const value = useMemo<ChatContextValue>(() => ({
    appendMessage,
    hasHydrated,
    initialized,
    loading,
    messages,
    processingTaskLabel,
    setProcessingTaskLabel,
    replaceMessages,
    setLoading,
    isMuted,
    setIsMuted,
  }), [appendMessage, hasHydrated, initialized, loading, messages, processingTaskLabel, setProcessingTaskLabel, replaceMessages, isMuted, setIsMuted]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatStore() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error('useChatStore must be used inside ChatProvider');
  }

  return context;
}
