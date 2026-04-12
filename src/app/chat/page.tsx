'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/components/ToastProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStage = 'idle' | 'analyzing' | 'awaiting_platform' | 'posting' | 'done';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  file?: { name: string; type: string; url?: string };
  isPosting?: boolean;
  postResult?: { success: boolean; results?: Record<string, { success: boolean; error?: string }> };
}

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
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(108,99,255,0.15);padding:2px 6px;border-radius:4px;font-size:13px;color:#8b84ff">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#8b84ff;text-decoration:underline">$1</a>')
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
  const [messages, setMessages] = useState<Message[]>(() => [{
    id: 'welcome',
    role: 'ai',
    content: WELCOME_CONTENT,
    timestamp: '',  // set client-side only via useEffect to avoid hydration mismatch
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Agent state
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

  const [isMuted, setIsMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastImageRef = useRef<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── WebSocket for Python Voice Engine (TTS) ──────────────────────────────
  useEffect(() => {
    const connectWS = () => {
      const socket = new WebSocket('ws://127.0.0.1:8010');
      socket.onopen = () => { console.log('✅ Chat connected to Voice Engine'); };
      socket.onclose = () => { setTimeout(connectWS, 3000); };
      wsRef.current = socket;
    };
    connectWS();
    return () => { wsRef.current?.close(); };
  }, []);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPosting]);

  // Listen for voice messages forwarded from the floating widget via Electron IPC
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as any;
    if (!win.require) return;
    const { ipcRenderer } = win.require('electron');
    const handler = (_: any, { userText, aiText }: { userText: string; aiText: string }) => {
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString() + 'u', role: 'user', content: `🎤 ${userText}`, timestamp: ts },
        { id: Date.now().toString() + 'a', role: 'ai', content: aiText, timestamp: ts },
      ]);
    };
    ipcRenderer.on('voice-message', handler);
    return () => ipcRenderer.removeListener('voice-message', handler);
  }, []);


  const addMessage = (msg: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() + Math.random() }]);
  };

  const getHistory = () =>
    messages.slice(1).slice(-10).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }));

  // ── Fetch real DM contacts from Instagram ────────────────────────────────
  const fetchDmContacts = useCallback(async () => {
    setDmMode('fetching');
    setDmErrorMsg('');
    setDmContacts([]);
    addMessage({
      role: 'ai',
      content: '📥 Fetching your Instagram DMs… This opens a browser and reads your real inbox (takes ~10 seconds).',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    try {
      const res = await fetch('/api/instagram/dms');
      const data = await res.json();

      if (!data.success) {
        setDmMode('idle');
        setDmErrorMsg(data.error || 'Failed to fetch DMs');
        addMessage({
          role: 'ai',
          content: `❌ Couldn't fetch DMs: **${data.error}**\n\nMake sure your Instagram account is connected in Settings.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        return;
      }

      if (data.contacts.length === 0) {
        setDmMode('idle');
        addMessage({
          role: 'ai',
          content: '📭 No DM conversations found in your inbox. Start a conversation on Instagram first, then try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        return;
      }

      setDmContacts(data.contacts);
      setDmMode('picking');
      addMessage({
        role: 'ai',
        content: `✅ Found **${data.contacts.length} conversations** in your inbox. Select who to send to:`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      setDmMode('idle');
      addMessage({
        role: 'ai',
        content: `❌ Network error fetching DMs: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }, []);

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
          }));
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
      role: 'ai',
      content: `⏳ Sending message to **${platform === 'discord' ? '#' : '@'}${contact.displayName}**… Processing via ${platform.toUpperCase()}.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
          role: 'ai',
          content: `✅ **DM sent** to @${contact.username} via ${platform === 'instagram' ? 'Instagram' : 'Twitter'}!\n\nWant to send to someone else or do something else?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        toast('DM failed. Check chat for details.', 'error');
        addMessage({
          role: 'ai',
          content: `❌ DM failed: **${data.error}**`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (err) {
      setDmMode('idle');
      addMessage({
        role: 'ai',
        content: `❌ Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }, []);

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
          role: 'ai',
          content: `✅ Your post is now **live**! ${isStory ? 'Added to your story.' : 'Check your Instagram feed.'}\n\nWant to post something else? Upload another image anytime!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        toast('Posting failed. See details in chat.', 'error');
        const errs = Object.entries(data.results || {}).filter(([, r]: any) => !r.success).map(([p, r]: any) => `**${p}**: ${r.error}`).join('\n');
        addMessage({
          role: 'ai',
          content: `❌ Posting failed:\n\n${errs}\n\nTry again or check your account connections in Settings.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (err) {
      setIsPosting(false);
      setAgentStage('idle');
      addMessage({
        role: 'ai',
        content: `❌ Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }, []);

  // ── Main send flow (backend orchestrated) ─────────────────────────────────
  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg && !uploadedFile) return;

    // Persist file reference for multi-turn flows (DM picker, etc.)
    const fileForPost = uploadedFile;
    if (uploadedFile) lastImageRef.current = uploadedFile;

    // ── DM Picker shortcut pills (open inbox manually) ──────────────────────
    const dmKeywords = /^(send via dm|dm someone|send message|open dms)$/i;
    if (dmKeywords.test(msg)) {
      setInput('');
      addMessage({ role: 'user', content: msg, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      await fetchDmContacts();
      return;
    }

    addMessage({
      role: 'user',
      content: msg || (uploadedFile ? `[Uploaded: ${uploadedFile.name}]` : ''),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      file: uploadedFile ? { name: uploadedFile.name, type: uploadedFile.type, url: URL.createObjectURL(uploadedFile) } : undefined,
    });

    setInput('');
    setUploadedFile(null);
    setLoading(true);
    setPostResults(null);

    // ── Mention-generated explicit commands (from DM picker / mention dropdown) ──
    // These are formatted by applyMention() and should bypass AI for speed.
    const discordMatchRegex = /^Post\s+in\s+#([^\s]+)\s+\(-(\d+)\)\s+on\s+Discord:\s*([\s\S]*)$/i;
    const generatedDmRegex  = /^DM\s+@([a-zA-Z0-9_.]+)\s+on\s+(Instagram|Twitter|X):\s*([\s\S]*)$/i;

    const dMatch   = msg.match(discordMatchRegex);
    const genMatch = msg.match(generatedDmRegex);

    if (dMatch) {
      const channelName  = dMatch[1];
      const channelId    = dMatch[2];
      const targetMsg    = dMatch[3].trim();
      setLoading(false);
      await executeDm({ username: channelId, displayName: channelName }, targetMsg, fileForPost, 'discord');
      lastImageRef.current = null;
      return;
    }

    if (genMatch) {
      const targetUser   = genMatch[1];
      const platformRaw  = genMatch[2].toLowerCase();
      const targetMsg    = genMatch[3].trim();
      const platform     = (platformRaw === 'x' ? 'twitter' : platformRaw) as 'instagram' | 'twitter';
      const dummyContact: DMContact = { username: targetUser, displayName: targetUser };
      setLoading(false);
      await executeDm(dummyContact, targetMsg || 'Hello', fileForPost, platform);
      lastImageRef.current = null;
      return;
    }

    // ── All other input → backend pipeline ─────────────────────────────────
    // Build a lightweight contact cache so the enrichment layer can resolve
    // mentions without triggering new fetches.
    const contactCache = {
      instagram: dmContacts.map(c => ({ username: c.username, displayName: c.displayName })),
    };

    try {
      const fd = new FormData();
      fd.append('message', msg || 'Analyze this image and generate captions for it.');
      fd.append('history', JSON.stringify(getHistory()));
      fd.append('contactCache', JSON.stringify(contactCache));
      if (fileForPost) fd.append('file', fileForPost);

      const res  = await fetch('/api/chat', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.error) {
        const isOllamaErr = data.error.includes('Ollama') || data.error.includes('ECONNREFUSED') || data.error.includes('fetch');
        addMessage({
          role: 'ai',
          content: isOllamaErr
            ? `⚠️ **Ollama is not running!**\n\nTo use the AI agent:\n1. Install Ollama from [ollama.com](https://ollama.com)\n2. Run: \`ollama pull gemma4:e4b\`\n3. Ollama starts automatically\n\nError: ${data.error}`
            : `❌ Error: ${data.error}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        return;
      }

      // Backend returns { reply, action, result? }
      const reply  = (data.reply || '').trim();
      const action = data.action as string | undefined;
      const result = data.result as Record<string, unknown> | undefined;

      // Show typing response
      if (reply) {
        addMessage({
          role: 'ai',
          content: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });

        // ── Speak out Loud (TTS) ───────────────────────────────────────────
        if (!isMuted && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'speak', text: reply }));
        }
      }

      // Handle pending DM clarification returned from backend
      if (action === 'ask_platform' && result?.pendingDm) {
        const pd = result.pendingDm as { username: string; message: string };
        setPendingDm({ user: pd.username, message: pd.message });
      }

      // If posting was triggered backend-side, show the posting card
      if (action === 'post') {
        const postRes = result as { success: boolean; results?: Record<string, { success: boolean; error?: string }> } | undefined;
        if (postRes?.results) {
          setPostResults(postRes.results);
          setIsPosting(false);
          setAgentStage(postRes.success ? 'done' : 'idle');
        }
      }

    } catch {
      addMessage({
        role: 'ai',
        content: '⚠️ **Cannot connect to Ollama.** Make sure it\'s running at 127.0.0.1:11434.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } finally {
      setLoading(false);
    }
  };

  const applyMention = (item: { name: string; type: 'app' | 'user' | 'discord-guild' | 'discord-channel'; id?: string }) => {
    if (item.type === 'app') {
      fetchDmContactsSilent(item.name);
      return; 
    }
    if (item.type === 'discord-guild' && item.id) {
      fetchDiscordChannelsSilent(item.id);
      return;
    }

    const before = input.slice(0, mention.startIndex);
    const after = input.slice(textareaRef.current?.selectionStart || 0);
    const appName = mention.appContext ? mention.appContext.charAt(0).toUpperCase() + mention.appContext.slice(1) : 'Instagram';
    
    const explicitIntentString = item.type === 'discord-channel'
      ? `Post in #${item.name} (-${item.id}) on Discord: `
      : `DM @${item.name} on ${appName}: `;
    
    const newValue = `${before}${explicitIntentString}${after}`;
    setInput(newValue);
    setMention(prev => ({ ...prev, visible: false, appContext: undefined }));
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = before.length + explicitIntentString.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention.visible && (mention.filtered.length > 0 || mention.loadingContacts)) {
      if (mention.loadingContacts) {
        if (e.key === 'Escape') setMention(prev => ({ ...prev, visible: false, loadingContacts: false }));
        return; // Disable other keys while loading
      }
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMention(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % prev.filtered.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMention(prev => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + prev.filtered.length) % prev.filtered.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mention.filtered[mention.selectedIndex] as any);
        return;
      }
      if (e.key === 'Escape') {
        setMention(prev => ({ ...prev, visible: false, appContext: undefined }));
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const QUICK_PROMPTS = uploadedFile
    ? ['Analyze and generate captions', 'Post to Instagram feed', 'Add to story']
    : ['Post this image to Instagram', 'Suggest hashtags for tech', 'Write a viral tweet'];

  return (
    <>

      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg,#ff6b6b,#f09433)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
          }}>🌸</div>
          <div>
            <div className="topbar-title">Jenny AI</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -2 }}>
              {agentStage === 'idle' ? 'Ready' : 
               agentStage === 'analyzing' ? 'Analyzing…' : 
               agentStage === 'posting' ? 'Posting…' : 'Done'}
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <button 
            className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute TTS' : 'Mute TTS'}
            style={{ fontSize: 16 }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button 
            className="btn btn-ghost btn-sm" 
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).require) {
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('show-voice-widget');
              }
            }}
          >
            🎤 Voice
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Powered by Ollama</span>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setMessages([{ id: 'welcome', role: 'ai', content: WELCOME_CONTENT, timestamp: '' }]);
            setPostResults(null);
            setAgentStage('idle');
            lastImageRef.current = null;
          }}>
            🗑 New Chat
          </button>
        </div>
      </div>

      <div className="chat-layout" style={{ height: 'calc(100vh - 60px)' }}>
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className={`chat-avatar ${msg.role}`}>
                {msg.role === 'ai' ? '🌸' : '👤'}
              </div>
              <div style={{ flex: 1, maxWidth: '80%' }}>
                {msg.file && (
                  <div style={{ marginBottom: 8 }}>
                    {msg.file.type.startsWith('image/') && msg.file.url ? (
                      <img
                        src={msg.file.url}
                        alt={msg.file.name}
                        style={{ maxWidth: 200, maxHeight: 200, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--border-subtle)' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-subtle)', width: 'fit-content', fontSize: 13 }}>
                        📎 {msg.file.name}
                      </div>
                    )}
                  </div>
                )}
                {msg.content && !msg.content.startsWith('{"action"') && (
                  <div
                    className="chat-bubble"
                    style={msg.role === 'user' ? { borderRadius: '18px 4px 18px 18px' } : { borderRadius: '4px 18px 18px 18px' }}
                    dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                  />
                )}
                {/* DM Confirm Buttons */}
                {msg.role === 'ai' && msg.content.includes('⚠️ **Confirm DM**') && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => sendMessage('Yes')} disabled={loading || isPosting}>📤 Send DM</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => sendMessage('No')} disabled={loading || isPosting}>❌ Cancel</button>
                  </div>
                )}
                {/* Agent Spawn Buttons */}
                {msg.role === 'ai' && msg.content.includes('⚠️ I need an AI Agent') && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => sendMessage('Yes')} disabled={loading || isPosting}>✅ Approve Agent</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => sendMessage('No')} disabled={loading || isPosting}>❌ Reject</button>
                  </div>
                )}
                <div className="chat-timestamp" suppressHydrationWarning>{msg.timestamp}</div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="chat-message ai">
              <div className="chat-avatar ai">🌸</div>
              <div className="chat-bubble" style={{ borderRadius: '4px 18px 18px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="typing-indicator">
                    <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {uploadedFile ? 'Analyzing image…' : 'Thinking…'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Posting status */}
          {(isPosting || postResults) && (
            <div className="chat-message ai" style={{ alignItems: 'flex-start' }}>
              <div className="chat-avatar ai">🌸</div>
              <div style={{ flex: 1, maxWidth: '85%' }}>
                <PostingCard results={postResults || undefined} isPosting={isPosting} />
              </div>
            </div>
          )}

          {/* DM Contact Picker */}
          {dmMode === 'picking' && dmContacts.length > 0 && (
            <div className="chat-message ai" style={{ alignItems: 'flex-start' }}>
              <div className="chat-avatar ai">🌸</div>
              <div style={{ flex: 1, maxWidth: '90%' }}>
                <DmContactPicker
                  contacts={dmContacts}
                  imageFile={lastImageRef.current}
                  onSelect={(contact, message) => {
                    setDmMode('idle');
                    executeDm(contact, message, lastImageRef.current);
                  }}
                  onCancel={() => {
                    setDmMode('idle');
                    addMessage({
                      role: 'ai',
                      content: 'DM cancelled. What else can I help you with?',
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    });
                  }}
                />
              </div>
            </div>
          )}

          {/* DM fetching spinner */}
          {dmMode === 'fetching' && (
            <div className="chat-message ai">
              <div className="chat-avatar ai">🌸</div>
              <div className="agent-card posting-card" style={{ maxWidth: 340 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="agent-spinner" />
                  <div style={{ fontSize: 13 }}>Opening Instagram and reading your inbox…</div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          {uploadedFile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
              padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(108,99,255,0.3)',
            }}>
              {uploadedFile.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(uploadedFile)}
                  alt=""
                  style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: 8, background: 'var(--bg-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0, border: '1px solid var(--border-subtle)'
                }}>
                  {uploadedFile.type.startsWith('video/') ? '🎬' :
                   uploadedFile.type.includes('pdf') ? '📄' :
                   uploadedFile.type.includes('word') || uploadedFile.name.endsWith('.doc') || uploadedFile.name.endsWith('.docx') ? '📝' :
                   '📎'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {uploadedFile.type.startsWith('image/') ? '🖼️' :
                   uploadedFile.type.startsWith('video/') ? '🎬' : '📎'} {uploadedFile.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--accent-light)', marginTop: 1 }}>
                  Ready to send · {(uploadedFile.size / 1024).toFixed(0)}KB
                </div>
              </div>
              <button onClick={() => setUploadedFile(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: 4 }}>×</button>
            </div>
          )}

          {/* Quick prompts */}
          <div className="chat-actions" style={{ marginBottom: 10, flexWrap: 'nowrap', overflowX: 'auto' }}>
            {QUICK_PROMPTS.map(p => (
              <button key={p} className="chat-pill" onClick={() => sendMessage(p)} style={{ flexShrink: 0 }}>
                {p}
              </button>
            ))}
          </div>

          <div className="chat-input-row">
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => fileInputRef.current?.click()}
              title="Upload image"
              style={{ position: 'relative' }}
            >
              📎
              {uploadedFile && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, width: 10, height: 10,
                  background: 'var(--accent)', borderRadius: '50%',
                }} />
              )}
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

            <div style={{ flex: 1, position: 'relative' }}>
              <MentionDropdown state={mention} onSelect={applyMention} />
              <textarea
                ref={textareaRef}
                className="chat-input"
                placeholder={uploadedFile ? 'Add a note or just press Send to analyze…' : 'Upload an image or type a command…'}
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  const pos = e.target.selectionStart || 0;
                  setInput(val);
                  
                  // Auto-resize
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';

                  // Mention detection logic
                  const textBeforeCursor = val.slice(0, pos);
                  const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
                  
                  if (mention.appContext && mention.loadingContacts) {
                    // Do nothing, wait for load
                    return;
                  }

                  if (mention.appContext && !mention.loadingContacts && mention.visible) {
                    // We are in user-selection mode after picking an app
                    const query = textBeforeCursor.slice(mention.startIndex + 1).toLowerCase();
                    const userSuggestions = dmContacts.map(c => ({ 
                      id: `user-${c.username}`, 
                      name: c.username, 
                      type: 'user' as const, 
                      avatar: c.avatarUrl 
                    }));
                    const filtered = userSuggestions.filter(item => item.name.toLowerCase().includes(query)).slice(0, 8);
                    setMention(prev => ({ ...prev, query, filtered, selectedIndex: 0 }));
                    return;
                  }

                  if (lastAtSymbol !== -1 && (lastAtSymbol === 0 || /\s/.test(textBeforeCursor[lastAtSymbol - 1]))) {
                    const query = textBeforeCursor.slice(lastAtSymbol + 1).toLowerCase();
                    
                    // Initial view: Only suggest Apps (or users if dmContacts is populated, but Apps take priority)
                    const appSuggestions = PLATFORMS.map(p => ({ id: p.id, name: p.id, type: 'app' as const, icon: p.icon }));
                    // Only show users directly if no app context and they haven't explicitly triggered an app
                    const userSuggestions = dmContacts.length > 0 ? dmContacts.map(c => ({ 
                      id: `user-${c.username}`, 
                      name: c.username, 
                      type: 'user' as const, 
                      avatar: c.avatarUrl 
                    })) : [];
                    
                    const all = [...appSuggestions, ...userSuggestions];
                    const filtered = all.filter(item => item.name.toLowerCase().includes(query)).slice(0, 8);
                    
                    if (filtered.length > 0) {
                      setMention({
                        visible: true,
                        query,
                        startIndex: lastAtSymbol,
                        selectedIndex: 0,
                        filtered,
                        appContext: undefined,
                        loadingContacts: false
                      });
                    } else {
                      setMention(prev => ({ ...prev, visible: false, appContext: undefined }));
                    }
                  } else {
                    setMention(prev => ({ ...prev, visible: false, appContext: undefined, loadingContacts: false }));
                  }
                }}
                onKeyDown={handleKeyDown}
                rows={1}
              />
            </div>

            <button
              className="btn btn-primary btn-icon"
              onClick={() => sendMessage()}
              disabled={loading || isPosting || (!input.trim() && !uploadedFile)}
              style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }}
            >
              {loading || isPosting
                ? <span className="spinner" style={{ width: 16, height: 16 }} />
                : '↑'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
