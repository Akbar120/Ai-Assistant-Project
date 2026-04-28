'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/components/ToastProvider';
import { useChatStore } from '@/components/chat/ChatProvider';
import { useMessagePipeline } from '@/hooks/useMessagePipeline';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import type { ChatMessage } from '@/lib/chat-types';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ExecutionFlow from '@/components/dashboard/ExecutionFlow';
// ─── Types ────────────────────────────────────────────────────────────────────

type JennyMode = 'conversation' | 'planning' | 'analyze' | 'confirmation' | 'execution';

type AgentStage = 'idle' | 'analyzing' | 'awaiting_platform' | 'posting' | 'done';

type Message = ChatMessage;

interface AIAction {
  action: string;
  caption?: string;
  caption_short?: string;
  caption_viral?: string;
  analysis?: string;
  hashtags?: string[];
  platforms?: string[];
  schedule?: string | null;
  username?: string;
  question?: string;
  mood?: string;
}

interface DMContact {
  username: string;
  displayName: string;
  avatarUrl?: string;
  lastMessage?: string;
  isGroup?: boolean;
}

type DmMode = 'idle' | 'fetching' | 'picking' | 'sending' | 'sent';

interface MentionState {
  visible: boolean;
  query: string;
  startIndex: number;
  selectedIndex: number;
  filtered: Array<{ id: string; name: string; type: 'app' | 'user' | 'discord-guild' | 'discord-channel'; icon?: string; avatar?: string }>;
  appContext?: string;
  loadingContacts?: boolean;
}

// ─── Platform Config ──────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#E1306C', gradient: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' },
  { id: 'twitter', label: 'X (Twitter)', icon: '𝕏', color: '#fff', gradient: 'linear-gradient(135deg,#1a1a2e,#333)' },
  { id: 'discord', label: 'Discord', icon: '💬', color: '#5865F2', gradient: 'linear-gradient(135deg,#4752c4,#7289da)' },
];

// ─── Helper: render markdown-like content ─────────────────────────────────────

function renderContent(content: string) {
  let processed = content;
  
  // 🔥 RESTORE: Thought Process Accordion
  processed = processed.replace(/<think>([\s\S]*?)(?:<\/think>|$)/g, (_, thoughts) => {
'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/components/ToastProvider';
import { useChatStore } from '@/components/chat/ChatProvider';
import { useMessagePipeline } from '@/hooks/useMessagePipeline';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import type { ChatMessage } from '@/lib/chat-types';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ExecutionFlow from '@/components/dashboard/ExecutionFlow';
// ─── Types ────────────────────────────────────────────────────────────────────

type JennyMode = 'conversation' | 'planning' | 'analyze' | 'confirmation' | 'execution';

type AgentStage = 'idle' | 'analyzing' | 'awaiting_platform' | 'posting' | 'done';

type Message = ChatMessage;

interface AIAction {
  action: string;
  caption?: string;
  caption_short?: string;
  caption_viral?: string;
  analysis?: string;
  hashtags?: string[];
  platforms?: string[];
  schedule?: string | null;
  username?: string;
  question?: string;
  mood?: string;
}

interface DMContact {
  username: string;
  displayName: string;
  avatarUrl?: string;
  lastMessage?: string;
  isGroup?: boolean;
}

type DmMode = 'idle' | 'fetching' | 'picking' | 'sending' | 'sent';

interface MentionState {
  visible: boolean;
  query: string;
  startIndex: number;
  selectedIndex: number;
  filtered: Array<{ id: string; name: string; type: 'app' | 'user' | 'discord-guild' | 'discord-channel'; icon?: string; avatar?: string }>;
  appContext?: string;
  loadingContacts?: boolean;
}

// ─── Platform Config ──────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#E1306C', gradient: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' },
  { id: 'twitter', label: 'X (Twitter)', icon: '𝕏', color: '#fff', gradient: 'linear-gradient(135deg,#1a1a2e,#333)' },
  { id: 'discord', label: 'Discord', icon: '💬', color: '#5865F2', gradient: 'linear-gradient(135deg,#4752c4,#7289da)' },
];

// ─── Helper: render markdown-like content ─────────────────────────────────────

function renderContent(content: string) {
  let processed = content;
  
  // 🔥 RESTORE: Thought Process Accordion
  processed = processed.replace(/<think>([\s\S]*?)(?:<\/think>|$)/g, (_, thoughts) => {
    return `
      <div class="thought-container" style="margin: 16px 0; opacity: 1;">
        <details class="thought-details" style="background: linear-gradient(135deg, rgba(0,243,255,0.05) 0%, rgba(139,132,255,0.05) 100%); border: 1px solid rgba(0,243,255,0.2); border-radius: 16px; overflow: hidden; transition: all 0.3s ease;">
          <summary style="padding: 14px 18px; cursor: pointer; font-size: 12px; font-weight: 600; color: #00f3ff; display: flex; align-items: center; gap: 10px; list-style: none; user-select: none; transition: background 0.2s ease;" onmouseover="this.style.background='rgba(0,243,255,0.1)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-brain" style="font-size: 14px; filter: drop-shadow(0 0 8px rgba(0,243,255,0.6))"></i>
            <span>Thought Process</span>
            <i class="fa-solid fa-chevron-down" style="margin-left: auto; font-size: 10px; transition: transform 0.3s; color: #8b84ff;"></i>
          </summary>
          <div style="padding: 0 18px 18px 18px; font-size: 13px; line-height: 1.7; color: #a1a1aa; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.25);">
            ${thoughts.trim().replace(/\n/g, '<br/>')}
          </div>
        </details>
      </div>
    `;
  });

  return processed
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(0,242,255,0.1);padding:2px 6px;border-radius:4px;font-size:13px;color:#00f2ff;border:1px solid rgba(0,242,255,0.2)">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#00f2ff;text-decoration:underline">$1</a>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// removed CaptionCard

// ─── Posting Status Card ──────────────────────────────────────────────────────

function PostingCard({ results, isPosting }: {
  results?: Record<string, { success: boolean; error?: string }>;
  isPosting: boolean;
}) {
  if (isPosting) {
    return (
      <div className="agent-card posting-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="agent-spinner" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Publishing your post…</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Opening Instagram, uploading your image and submitting. This takes ~30s.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!results) return null;

  const allSuccess = Object.values(results).every(r => r.success);
  return (
    <div className={`agent-card ${allSuccess ? 'success-card' : 'error-card'}`}>
      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>
        {allSuccess ? '🎉 Post Published!' : '⚠️ Some issues occurred'}
      </div>
      {Object.entries(results).map(([platform, r]) => (
        <div key={platform} className="agent-result-row">
          <span>{r.success ? '✅' : '❌'}</span>
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{platform}</span>
          {r.error && <span style={{ color: 'var(--error)', fontSize: 12 }}>{r.error}</span>}
          {r.success && <span style={{ color: 'var(--success)', fontSize: 12 }}>Live on your profile</span>}
        </div>
      ))}
    </div>
  );
}

// ─── DM Contact Picker ──────────────────────────────────────────────────────

function DmContactPicker({
  contacts,
  onSelect,
  onCancel,
  imageFile,
}: {
  contacts: DMContact[];
  onSelect: (contact: DMContact, message: string) => void;
  onCancel: () => void;
  imageFile: File | null;
}) {
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<DMContact | null>(null);

  const filtered = contacts.filter(c =>
    c.username.toLowerCase().includes(search.toLowerCase()) ||
    c.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="agent-card" style={{ maxWidth: '100%' }}>
      <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
        💬 <span>Select from your DMs</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
          {contacts.length} conversations
        </span>
      </div>

      {/* Search */}
      <input
        className="input"
        placeholder="Search by username or name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 10, fontSize: 13 }}
        autoFocus
      />

      {/* Contact list */}
      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '14px 0' }}>
            No matches for &quot;{search}&quot;
          </div>
        )}
        {filtered.map(c => (
          <button
            key={c.username}
            onClick={() => setSelected(selected?.username === c.username ? null : c)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              background: selected?.username === c.username ? 'var(--accent-dim)' : 'var(--bg-surface)',
              border: `1px solid ${selected?.username === c.username ? 'rgba(108,99,255,0.5)' : 'var(--border-subtle)'}`,
              borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              background: 'linear-gradient(135deg,#f09433,#bc1888)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: 'white', fontWeight: 700,
            }}>
              {c.avatarUrl
                ? <img src={c.avatarUrl} alt={c.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : c.displayName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                {c.displayName || c.username}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                @{c.username}{c.lastMessage ? ` · ${c.lastMessage}` : ''}
              </div>
            </div>
            {selected?.username === c.username && (
              <span style={{ fontSize: 16, color: 'var(--accent-light)' }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Message input + preview image */}
      {selected && (
        <>
          {imageFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)' }}>
              <img src={URL.createObjectURL(imageFile)} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
              <span>Image will be attached</span>
            </div>
          )}
          <textarea
            className="input"
            placeholder={`Message to @${selected.username}…`}
            rows={2}
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ fontSize: 13, minHeight: 60, marginBottom: 10 }}
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={!selected || (!message.trim() && !imageFile)}
          onClick={() => selected && onSelect(selected, message)}
        >
          📤 Send DM{selected ? ` to @${selected.username}` : ''}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Mention Dropdown Component ──────────────────────────────────────────────

function MentionDropdown({
  state,
  onSelect,
}: {
  state: MentionState;
  onSelect: (item: MentionState['filtered'][0]) => void;
}) {
  if (!state.visible) return null;

  if (state.loadingContacts) {
    return (
      <div className="mention-dropdown" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="agent-spinner" style={{ margin: '0 auto 8px' }} />
        <div style={{ fontSize: 12 }}>Fetching {state.appContext} contacts...</div>
      </div>
    );
  }

  if (state.filtered.length === 0) return null;

  return (
    <div className="mention-dropdown">
      {state.filtered.map((item, i) => (
        <button
          key={item.id}
          className={`mention-item ${state.selectedIndex === i ? 'active' : ''}`}
          onClick={() => onSelect(item)}
        >
          <div className="mention-item-icon">
            {item.avatar ? (
              <img src={item.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              item.icon || (item.type === 'user' ? '👤' : '📱')
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>@{item.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.type}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const WELCOME_CONTENT = `👋 Hey! I'm **Jenny** — tumhari smart aur thodi si flirty AI social media partner. ✨\n\n**Main kya kar sakti hoon?**\n1. 📸 **Image upload karo** (📎 button use karke)\n2. 🧠 Main use **analyze karke** mast captions suggest karungi\n3. 🎯 **Tum choose karo** — Post, Story, ya edit\n4. 🚀 Aur main directly **publish kar dungi**!\n\nAap mujhse bas baatein bhi kar sakte ho, main bore nahi hone dungi! 😉`;

export default function ChatPage() {
  const {
    appendMessage,
    hasHydrated,
    initialized,
    loading,
    messages,
    processingTaskLabel,
    replaceMessages,
    setLoading,
    setProcessingTaskLabel,
    isMuted,
    setIsMuted,
    isSpeaking,
  } = useChatStore();
  const { handleUserRequest, handleAssistantResponse, stopAllTTS, pendingRequests, maybeSpeak } = useMessagePipeline();
  const { setListening } = useVoiceEngine(); // Deaf Mode
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  
  // Helper to format numeric timestamp for display (Fix for stacking bug)
  const formatTime = (ts: number | string) => {
    try {
      if (!ts) return '';
      // If it's a legacy pre-formatted string (contains colons), return as is
      if (typeof ts === 'string' && ts.includes(':')) return ts;
      
      const date = new Date(ts);
      // Validate date
      if (isNaN(date.getTime())) return String(ts);
      
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(ts);
    }
  };
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // ── Session Persistence ────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized || messages.length > 0) return;

    void handleAssistantResponse(WELCOME_CONTENT, 'chat', undefined, {
      id: 'welcome',
      timestamp: Date.now()
    });
  }, [handleAssistantResponse, initialized, messages.length]);

  // Agent state
  const [activeMode, setActiveMode] = useState<JennyMode>('conversation');
  const [agentStage, setAgentStage] = useState<AgentStage>('idle');
  const [isPosting, setIsPosting] = useState(false);
  const [postResults, setPostResults] = useState<Record<string, { success: boolean; error?: string }> | null>(null);

  // DM state
  const [dmMode, setDmMode] = useState<DmMode>('idle');
  const [dmContacts, setDmContacts] = useState<DMContact[]>([]);
  const [dmSearch, setDmSearch] = useState('');
  const [dmErrorMsg, setDmErrorMsg] = useState('');
  const [pendingDm, setPendingDm] = useState<{ user: string; message: string } | null>(null);

  // Mention system state
  const [mention, setMention] = useState<MentionState>({
    visible: false,
    query: '',
    startIndex: -1,
    selectedIndex: 0,
    filtered: [],
  });

  const lastImageRef = useRef<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoScrollRef = useRef(true); // true = follow new messages
  
  // ─── Request Tracker (Race Condition Protection) ──────────────────────────
  const currentRequestRef = useRef<string | null>(null);

  // ─── Thinking State (Derived + Delayed to prevent flicker) ────────────────
  const isThinking = loading || processingTaskLabel !== null || (pendingRequests?.current?.size || 0) > 0;
  const [showThinking, setShowThinking] = useState(false);
  const [streamingThought, setStreamingThought] = useState('');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isThinking) {
      timer = setTimeout(() => setShowThinking(true), 300);
    } else {
      setShowThinking(false);
    }
    return () => clearTimeout(timer);
  }, [isThinking]);


  // Smart auto-scroll: follows new messages unless user manually scrolled up
  useEffect(() => {
    if (autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isPosting, showThinking]);

  // Scroll to bottom on mount / returning to page
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      autoScrollRef.current = true;
    }, 100);
  }, []);

  // 🧹 One-time Chat Memory Flush (System Stabilization)
  useEffect(() => {
    if (!initialized) return;
    const FLUSH_KEY = 'chat_flush_v2';
    if (!localStorage.getItem(FLUSH_KEY)) {
      console.log("[System] One-time chat memory flush initiated...");
      void replaceMessages([]).then(() => {
        localStorage.setItem(FLUSH_KEY, 'done');
      });
    }
  }, [initialized, replaceMessages]);

  // Use a ref to avoid stale closure on processInput inside the IPC handler
  const processInputRef = useRef<((text: string, source: 'chat' | 'voice') => void) | null>(null);

  // Listen for voice messages forwarded from the floating widget via Electron IPC
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as any;
    if (!win.require) return;
    const { ipcRenderer } = win.require('electron');

    const handler = async (_: any, { userText }: { userText: string }) => {
      console.log("[IPC] Voice transcription received:", userText);
      // Use ref so we always call the latest version of processInput
      if (processInputRef.current) {
        processInputRef.current(userText, 'voice');
      }
    };

    const stopHandler = () => {
      console.log("[IPC] Stop-TTS received via Barge-in");
      stopAllTTS();
    };

    // IPC Listener Hygiene
    ipcRenderer.removeAllListeners('voice-message');
    ipcRenderer.removeAllListeners('stop-tts');

    ipcRenderer.on('voice-message', handler);
    ipcRenderer.on('stop-tts', stopHandler);

    return () => {
      ipcRenderer.removeListener('voice-message', handler);
      ipcRenderer.removeListener('stop-tts', stopHandler);
    };
  }, [stopAllTTS]); // ← Only stopAllTTS needed, handler uses ref

  // 🔥 WARMUP: Silent Audio trigger on mount to pre-initialize Audio Engine
  useEffect(() => {
    const audio = new Audio('/api/tts?text=hi');
    audio.volume = 0;
    audio.play().catch(() => {});
  }, []);


  const addMessage = useCallback((msg: Omit<Message, 'content' | 'role' | 'source' | 'id'> & { id?: string, content: string, role: Message['role'], source?: Message['source'] }, persist = true) => {
    // ISSUE 4: Default internal messages to 'system' source to avoid speech
    const source = msg.source || 'system';
    if (msg.role === 'assistant') {
       handleAssistantResponse(msg.content, source, undefined, msg as Partial<ChatMessage>);
    } else {
       handleUserRequest(msg.content, source as 'chat' | 'voice' | 'agent' | 'system', msg.file);
    }
  }, [handleAssistantResponse, handleUserRequest]);

  const getHistory = () =>
    messages.slice(1).slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

  // ── Fetch real DM contacts from Instagram ────────────────────────────────
  const fetchDmContacts = useCallback(async () => {
    setDmMode('fetching');
    setDmErrorMsg('');
    setDmContacts([]);
    addMessage({
      role: 'assistant',
      content: '📥 Fetching your Instagram DMs… This opens a browser and reads your real inbox (takes ~10 seconds).',
      timestamp: Date.now()
    });

    try {
      const res = await fetch('/api/instagram/dms');
      const data = await res.json();

      if (!data.success) {
        setDmMode('idle');
        setDmErrorMsg(data.error || 'Failed to fetch DMs');
        addMessage({
          role: 'assistant',
          content: `❌ Couldn't fetch DMs: **${data.error}**\n\nMake sure your Instagram account is connected in Settings.`,
          timestamp: Date.now()
        });
        return;
      }

      if (data.contacts.length === 0) {
        setDmMode('idle');
        addMessage({
          role: 'assistant',
          content: '📭 No DM conversations found in your inbox. Start a conversation on Instagram first, then try again.',
          timestamp: Date.now()
        });
        return;
      }

      setDmContacts(data.contacts);
      setDmMode('picking');
      addMessage({
        role: 'assistant',
        content: `✅ Found **${data.contacts.length} conversations** in your inbox. Select who to send to:`,
        timestamp: Date.now()
      });
    } catch (err) {
      setDmMode('idle');
      addMessage({
        role: 'assistant',
        content: `❌ Network error fetching DMs: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      });
    }
  }, [addMessage]);

  const fetchDmContactsSilent = async (app: string) => {
    try {
      setMention(prev => ({ ...prev, loadingContacts: true, appContext: app }));
      
      if (app === 'discord') {
        const res = await fetch('/api/discord/guilds').catch(() => null);
        if (!res) throw new Error('Fetch failed');
        const data = await res.json();
        if (data.guilds) {
          setMention(prev => ({
            ...prev,
            loadingContacts: false,
            filtered: data.guilds.map((g: any) => ({
              id: g.id, name: g.name, type: 'discord-guild', avatar: g.icon
            })),
            selectedIndex: 0,
          })),
          return;
        }
        throw new Error('Failed to fetch Discord servers');
      }

      const endpoint = app === 'instagram' ? '/api/instagram/dms' : '/api/twitter/dms';
      const res = await fetch(endpoint).catch(() => null);
      if (!res) throw new Error('Fetch failed');
      const data = await res.json();
      
      if (data.success && data.contacts) {
        setDmContacts(data.contacts); // Cache them
        const userSuggestions = data.contacts.map((c: any) => ({
          id: `user-${c.username}`,
          name: c.username,
          type: 'user',
          avatar: c.avatarUrl
        }));
        
        setMention(prev => ({
          ...prev,
          loadingContacts: false,
          filtered: userSuggestions,
          selectedIndex: 0,
        }));
      } else {
        throw new Error(data.error);
      }
    } catch (e) {
      toast(`Failed to fetch ${app} contacts`, 'error');
      setMention(prev => ({ ...prev, visible: false, loadingContacts: false }));
    }
  };

  const fetchDiscordChannelsSilent = async (guildId: string) => {
    try {
      setMention(prev => ({ ...prev, loadingContacts: true }));
      const res = await fetch(`/api/discord/guilds?guildId=${guildId}`).catch(() => null);
      if (!res) throw new Error('Fetch failed');
      const data = await res.json();
      if (data.channels) {
        setMention(prev => ({
          ...prev,
          loadingContacts: false,
          filtered: data.channels.map((c: any) => ({
            id: c.id, name: c.name, type: 'discord-channel'
          })),
          selectedIndex: 0,
        }));
      } else {
        throw new Error('Failed to fetch channels');
      }
    } catch (e) {
      toast('Failed to fetch Discord channels', 'error');
      setMention(prev => ({ ...prev, visible: false, loadingContacts: false }));
    }
  };

  // ── Send a DM or Post ──────────────────────────────────────────
  const executeDm = useCallback(async (contact: DMContact, msgText: string, imageFile: File | null, platform: 'instagram' | 'twitter' | 'discord' = 'instagram') => {
    setDmMode('sending');
    addMessage({
      role: 'assistant',
      content: `⏳ Sending message to **${platform === 'discord' ? '#' : '@'}${contact.displayName}**… Processing via ${platform.toUpperCase()}.`,
      timestamp: Date.now()
    });

    try {
      let data;
      if (platform === 'discord') {
         const res = await fetch('/api/discord/post', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             channelIds: [contact.username], // Contact format reused: username=id
             content: msgText,
             files: [] // File embedding requires proper base64 or upload, skipping for now
           })
         });
         data = await res.json();
         // If we had imageFile, we'd need to handle discord file uploads separately
      } else {
         const fd = new FormData();
         fd.append('username', contact.username);
         fd.append('message', msgText);
         if (imageFile) fd.append('file', imageFile);

         const endpoint = platform === 'instagram' ? '/api/instagram/dm-send' : '/api/twitter/dm-send';
         const res = await fetch(endpoint, { method: 'POST', body: fd });
         data = await res.json();
      }

      setDmMode('sent');
      if (data.success) {
        toast(`DM sent to @${contact.username}! 🎉`, 'success');
        addMessage({
          role: 'assistant',
          content: `✅ **DM sent** to @${contact.username} via ${platform === 'instagram' ? 'Instagram' : 'Twitter'}!\n\nWant to send to someone else or do something else?`,
          timestamp: Date.now()
        });
      } else {
        toast('DM failed. Check chat for details.', 'error');
        addMessage({
          role: 'assistant',
          content: `❌ DM failed: **${data.error}**`,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      setDmMode('idle');
      addMessage({
        role: 'assistant',
        content: `❌ Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      });
    }
  }, [addMessage]);

  // ── Execute actual post via /api/post ────────────────────────────────────
  const executePost = useCallback(async (caption: string, platforms: string[], imageFile: File | null, isStory = false) => {
    setIsPosting(true);
    setPostResults(null);
    setAgentStage('posting');

    try {
      const fd = new FormData();
      fd.append('caption', caption);
      fd.append('platforms', JSON.stringify(platforms));
      fd.append('discordConfig', JSON.stringify(null));
      if (imageFile) fd.append('file_0', imageFile);

      const res = await fetch('/api/post', { method: 'POST', body: fd });
      const data = await res.json();

      setPostResults(data.results || {});
      setIsPosting(false);
      setAgentStage('done');

      if (data.success) {
        toast('🎉 Post published successfully!', 'success');
        addMessage({
          role: 'assistant',
          content: `✅ Your post is now **live**! ${isStory ? 'Added to your story.' : 'Check your Instagram feed.'}\n\nWant to post something else? Upload another image anytime!`,
          timestamp: Date.now()
        });
      } else {
        toast('Posting failed. See details in chat.', 'error');
        const errs = Object.entries(data.results || {}).filter(([, r]: any) => !r.success).map(([p, r]: any) => `**${p}**: ${r.error}`).join('\n');
        addMessage({
          role: 'assistant',
          content: `❌ Posting failed:\n\n${errs}\n\nTry again or check your account connections in Settings.`,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      setIsPosting(false);
      setAgentStage('idle');
      addMessage({
        role: 'assistant',
        content: `❌ Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      });
    }
  }, []);

  // Sync the ref to always point at the latest processInput (avoids stale closures in IPC)
  // This runs before render so the ref is ready before any IPC message arrives
  // ── Unified Input & Response Pipeline ─────────────────────────────────────
  const processInput = async (text?: string, source: 'chat' | 'voice' = 'chat') => {
    const msg = text || input.trim();
    if (!msg && !uploadedFile) return;

    // 1. Setup Request Tracking
    const requestId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    currentRequestRef.current = requestId;

    // Persist file reference
    const fileForPost = uploadedFile;
    if (uploadedFile) lastImageRef.current = uploadedFile;

    // 2. Handle User Request
    const { requestId: internalId } = await handleUserRequest(
      source === 'voice' ? `🎤 ${msg}` : msg || (uploadedFile ? `[Uploaded: ${uploadedFile.name}]` : ''),
      source,
      uploadedFile ? { name: uploadedFile.name, type: uploadedFile.type, url: URL.createObjectURL(uploadedFile) } : undefined
    );

    // ── Command Bypass ──
    if (/^(send via dm|dm someone|send message|open dms)$/i.test(msg)) {
      setInput('');
      await fetchDmContacts();
      return;
    }

    // 3. AI Pipeline Fetch
    setInput('');
    setUploadedFile(null);
    setLoading(true);
    setPostResults(null);

    // Sync to Voice Widget
    if (source === 'voice' && typeof window !== 'undefined' && (window as any).require) {
       (window as any).require('electron').ipcRenderer.send('chat-to-voice', { status: 'THINKING', aiText: '...' });
    }

    try {
      const assistantMessageId = `asst-${Date.now()}`;
      const fd = new FormData();
      fd.append('message', msg || 'Analyze this image and generate captions.');
      fd.append('assistantMessageId', assistantMessageId);
      fd.append('history', JSON.stringify(getHistory()));
      if (fileForPost) fd.append('file', fileForPost);

      // SSE STREAM READER
      const response = await fetch('/api/chat?voice=1', { method: 'POST', body: fd });
      if (!response.body) throw new Error('No stream body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';
      let streamBuffer = '';
      let thinkingBuffer = ''; // Accumulate thinking text separately
      let firstContentReceived = false; // Track if we've started receiving content
      let lastSpokenIndex = 0; // 🔥 TTS TRACKER

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n\n');
        
        // Keep the last incomplete chunk in the buffer
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line || !line.trim().startsWith('data: ')) continue;
          try {
            const dataStr = line.replace(/^data:\s*/, '');
            if (!dataStr) continue;
            
            const data = JSON.parse(dataStr);
            if (!data) continue;
            
              if (data.type === 'sentence' && data.text) {
              // Accumulate ALL text for the final message
              if (data.isThought) {
                // THOUGHT: Update thinking buffer and UI bubble, but DON'T create chat card yet
                setStreamingThought(prev => prev + data.text);
                thinkingBuffer += data.text; // Accumulate for final message
                // Do NOT call handleAssistantResponse - no premature chat card!
              } else {
                // CONTENT: This is the actual reply
                if (!firstContentReceived) {
                  // First content chunk: wrap thinking with </think> tags
                  fullReply = `<think>${thinkingBuffer}</think>${data.text}`;
                  firstContentReceived = true;
                  thinkingBuffer = ''; // Clear thinking buffer
                } else {
                  fullReply += data.text;
                }

                // DEBUG: Log what's happening with isThought
                console.log('[DEBUG]', { isThought: data.isThought, textPreview: data.text.substring(0, 50) });

                // Update the UI with the full text (including thoughts for the accordion)
                handleAssistantResponse(data.text, 'primary', internalId, { id: assistantMessageId, content: fullReply, silent: true }, false);

                // Speak only the NEW parts of the clean reply
                const cleanReply = fullReply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
                if (cleanReply.length > lastSpokenIndex) {
                  const newText = cleanReply.substring(lastSpokenIndex);
                  if (newText.trim()) {
                    maybeSpeak(newText, 'primary', false);
                    lastSpokenIndex = cleanReply.length;
                  }
                }
              }
            } else if (data.type === 'mode') {
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,application/pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.ppt,.pptx"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setUploadedFile(f);
                      e.target.value = '';
                    }}
                  />

                  {/* Text Input */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <MentionDropdown state={mention} onSelect={applyMention} />
                    <input 
                      ref={textareaRef as any}
                      style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: 14, padding: '4px 0' }}
                      placeholder={uploadedFile ? 'Add a note or just press Send...' : 'Ask Jenny anything...'}
                      type="text"
                      value={input}
                      onChange={(e) => {
                        const val = e.target.value;
                        const pos = e.target.selectionStart || 0;
                        setInput(val);
                        
                        const textBeforeCursor = val.slice(0, pos);
                        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
                        
                        if (mention.appContext && mention.loadingContacts) return;
                        if (mention.appContext && !mention.loadingContacts && mention.visible) {
                          const query = textBeforeCursor.slice(mention.startIndex + 1).toLowerCase();
                          const userSuggestions = dmContacts.map(c => ({ id: `user-${c.username}`, name: c.username, type: 'user' as const, avatar: c.avatarUrl }));
                          const filtered = userSuggestions.filter(item => item.name.toLowerCase().includes(query)).slice(0, 8);
                          setMention(prev => ({ ...prev, query, filtered, selectedIndex: 0 }));
                          return;
                        }

                        if (lastAtSymbol !== -1 && (lastAtSymbol === 0 || /\s/.test(textBeforeCursor[lastAtSymbol - 1]))) {
                          const query = textBeforeCursor.slice(lastAtSymbol + 1).toLowerCase();
                          const appSuggestions = PLATFORMS.map(p => ({ id: p.id, name: p.id, type: 'app' as const, icon: p.icon }));
                          const userSuggestions = dmContacts.length > 0 ? dmContacts.map(c => ({ id: `user-${c.username}`, name: c.username, type: 'user' as const, avatar: c.avatarUrl })) : [];
                          const all = [...appSuggestions, ...userSuggestions];
                          const filtered = all.filter(item => item.name.toLowerCase().includes(query)).slice(0, 8);
                          
                          if (filtered.length > 0) {
                            setMention({ visible: true, query, startIndex: lastAtSymbol, selectedIndex: 0, filtered, appContext: undefined, loadingContacts: false });
                          } else {
                            setMention(prev => ({ ...prev, visible: false, appContext: undefined }));
                          }
                        } else {
                          setMention(prev => ({ ...prev, visible: false, appContext: undefined, loadingContacts: false }));
                        }
                      }}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  {/* Mic Button */}
                  <button
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                    onClick={() => {
                      const next = !isListening;
                      setIsListening(next);
                      setListening(next);
                    }}
                    style={{ width: 34, height: 34, borderRadius: 10, background: isListening ? 'rgba(0,243,255,0.1)' : 'transparent', border: 'none', color: isListening ? '#00f3ff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}
                  >
                    <i className={`fa-solid fa-microphone ${isListening ? 'animate-pulse' : ''}`} style={{ fontSize: 14 }}></i>
                  </button>

                  {/* Send Button */}
                  <button
                    title="Send message"
                    onClick={() => sendMessage()}
                    disabled={loading || isPosting || (!input.trim() && !uploadedFile)}
                    style={{ width: 38, height: 38, borderRadius: 12, background: loading || isPosting ? '#1d4ed8' : '#2563eb', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading || isPosting ? 'not-allowed' : 'pointer', flexShrink: 0, boxShadow: '0 0 15px rgba(37,99,235,0.4)', transition: 'all 0.2s', opacity: (!input.trim() && !uploadedFile) ? 0.5 : 1 }}
                  >
                    {loading || isPosting
                      ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 14 }}></i>
                      : <i className="fa-solid fa-paper-plane" style={{ fontSize: 14 }}></i>}
                  </button>
                </div>
              </div>
            </div>
          </section>
          
          {/* Execution Flow right sidebar */}
          <ExecutionFlow activeMode={activeMode} />

        </div>
      </main>
    </div>
  );
}
