'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

type NotifStatus = 'pending' | 'announced' | 'abandoned' | 'handled';
type NotifType = 'approval_needed' | 'completion' | 'error';

interface AgentNotification {
  id: string;
  agentId: string;
  agentName: string;
  text: string;
  timestamp: string;
  type: NotifType;
  read: boolean;
  requiresApproval: boolean;
  announced: boolean;
  status: NotifStatus;
  replies?: string[];
  selectedOption?: string;
}

function parseDMReport(text: string): {
  raw: string;
  from?: string;
  message?: string;
  tone?: string;
  suggestions: Array<{ label: string; text: string }>;
  isStructured: boolean;
} {
  const suggestions: Array<{ label: string; text: string }> = [];
  const fromMatch = text.match(/From:\s*(@?[^\n]+)/i);
  const messageMatch = text.match(/Messages?:\s*([\s\S]*?)(?=\n\s*(?:💡|Suggested Replies|Option|A\)))/i);
  const toneMatch = text.match(/Tone:\s*([^\n]+)/i);
  const suggestionRegex = /(?:^|\n)\s*(?:Option\s+)?([A-C])[\):\s]+"?([^"A-C\n][^\n]+)/gim;
  let m;
  while ((m = suggestionRegex.exec(text)) !== null) {
    suggestions.push({ label: m[1].toUpperCase(), text: m[2].trim().replace(/^"|"$/g, '') });
  }
  const isStructured = !!(fromMatch || messageMatch || suggestions.length > 0);
  return {
    raw: text,
    from: fromMatch?.[1],
    message: messageMatch?.[1]?.trim(),
    tone: toneMatch?.[1]?.trim(),
    suggestions,
    isStructured,
  };
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

const STATUS_CFG: Record<NotifStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:   { label: '⏳ Pending',   color: '#facc15', bg: 'rgba(250,204,21,0.08)',  border: 'rgba(250,204,21,0.15)' },
  announced: { label: '📣 Active',    color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.15)' },
  handled:   { label: '✅ Handled',   color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.15)' },
  abandoned: { label: '💀 Abandoned', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.15)' },
};

const TYPE_CFG: Record<NotifType, { icon: string; color: string }> = {
  approval_needed: { icon: '🔔', color: '#f59e0b' },
  completion:      { icon: '✅', color: '#34d399' },
  error:           { icon: '❌', color: '#f87171' },
};

const TABS: Array<{ label: string; statuses: NotifStatus[] | null; emptyIcon: string }> = [
  { label: 'All',       statuses: null, emptyIcon: '🔔' },
  { label: 'Awaiting',  statuses: ['pending', 'announced'], emptyIcon: '⏳' },
  { label: 'Handled',   statuses: ['handled'], emptyIcon: '✅' },
  { label: 'Abandoned', statuses: ['abandoned'], emptyIcon: '💀' },
];

function DetailItem({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ 
        fontSize: 13, 
        color: 'var(--text-primary)', 
        lineHeight: 1.6, 
        padding: '12px 16px', 
        borderRadius: 12, 
        background: 'rgba(0,0,0,0.25)', 
        border: '1px solid rgba(255,255,255,0.06)',
        fontFamily: monospace ? 'monospace' : 'inherit',
        whiteSpace: monospace ? 'pre-wrap' : 'normal',
      }}>
        {value}
      </div>
    </div>
  );
}

function SuggestionOption({ 
  option, 
  isSelected, 
  onClick 
}: { 
  option: { label: string; text: string }; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${isSelected ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
        background: isSelected ? 'rgba(108,99,255,0.1)' : 'rgba(0,0,0,0.15)',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
        color: isSelected ? '#fff' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 800,
        flexShrink: 0,
        border: `1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
      }}>
        {option.label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
        {option.text}
      </div>
    </div>
  );
}

function ActionButton({ 
  label, 
  variant, 
  loading, 
  onClick, 
  disabled,
  icon,
}: { 
  label: string; 
  variant: 'approve' | 'abandon' | 'reply';
  loading?: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon?: string;
}) {
  const configs = {
    approve: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' },
    abandon: { bg: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
    reply: { bg: 'rgba(108,99,255,0.12)', color: '#8b84ff', border: 'rgba(108,99,255,0.25)' },
  };
  const cfg = configs[variant];
  
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled || loading}
      style={{
        flex: 1,
        padding: '12px 20px',
        borderRadius: 14,
        background: cfg.bg,
        color: cfg.color,
        fontWeight: 700,
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${cfg.border}`,
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = `0 4px 16px ${cfg.bg}`;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {loading ? (
        <span style={{ animation: 'pulse 1s infinite' }}>Processing...</span>
      ) : (
        <>
          <span>{icon}</span>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

function NotificationCard({ notif, onRefresh }: { notif: AgentNotification; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(notif.status === 'pending' || notif.status === 'announced');
  const [replyText, setReplyText] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [loading, setLoading] = useState<'approve' | 'abandon' | 'reply' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = parseDMReport(notif.text);
  const status = STATUS_CFG[notif.status] || STATUS_CFG.pending;
  const typeInfo = TYPE_CFG[notif.type] || TYPE_CFG.completion;
  const isActionable = notif.status === 'pending' || notif.status === 'announced';

  const approve = async () => {
    const selectedText = customMode
      ? replyText.trim()
      : parsed.suggestions.find(s => s.label === selectedOption)?.text || replyText.trim();
    const textToSend = selectedText.trim() || 'approved';

    setLoading('approve');
    try {
      await fetch('/api/agents/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          id: notif.id,
          selectedOption: selectedOption || undefined,
          selectedText: textToSend,
          customText: customMode ? replyText.trim() : undefined,
        }),
      });
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const abandon = async () => {
    setLoading('abandon');
    try {
      await fetch('/api/agents/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abandon', id: notif.id }),
      });
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    setLoading('reply');
    try {
      await fetch('/api/agents/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply', id: notif.id, replyText: replyText.trim() }),
      });
      setReplyText('');
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        borderRadius: 20,
        border: `1px solid ${status.border}`,
        background: status.bg,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        marginBottom: 16,
      }}
    >
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `${typeInfo.color}15`,
              border: `1px solid ${typeInfo.color}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
            }}>
              {typeInfo.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  padding: '3px 10px',
                  background: 'rgba(108,99,255,0.12)',
                  borderRadius: 8,
                  border: '1px solid rgba(108,99,255,0.2)',
                }}>
                  🤖 {notif.agentName}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {formatTimestamp(notif.timestamp)}
                </span>
              </div>
              <div style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {parsed.from
                  ? `DM from ${parsed.from}${parsed.message ? ` · "${parsed.message.slice(0, 40)}..."` : ''}`
                  : notif.text.slice(0, 80) + (notif.text.length > 80 ? '…' : '')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: 10,
              background: `${status.color}15`,
              color: status.color,
              border: `1px solid ${status.border}`,
              whiteSpace: 'nowrap',
            }}>
              {status.label}
            </span>
            <div style={{ 
              width: 28, 
              height: 28, 
              borderRadius: 8, 
              background: 'rgba(255,255,255,0.04)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 11,
              transition: 'all 0.2s',
            }}>
              {expanded ? '▲' : '▼'}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {parsed.isStructured ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: parsed.tone ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
                {parsed.from && <DetailItem label="From" value={parsed.from} />}
                {parsed.message && <DetailItem label="Message" value={parsed.message} />}
                {parsed.tone && <DetailItem label="Tone" value={parsed.tone} />}
              </div>

              {parsed.suggestions.length > 0 && isActionable && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    💬 Suggested Replies — Pick one to approve
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {parsed.suggestions.map(s => (
                      <SuggestionOption
                        key={s.label}
                        option={s}
                        isSelected={selectedOption === s.label}
                        onClick={() => {
                          setSelectedOption(selectedOption === s.label ? null : s.label);
                          setCustomMode(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {notif.status === 'handled' && notif.selectedOption && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid rgba(52,211,153,0.2)',
                  fontSize: 13,
                  color: '#34d399',
                }}>
                  ✅ Approved Option {notif.selectedOption} and sent via agent.
                </div>
              )}
            </div>
          ) : (
            <DetailItem label="Message" value={notif.text} monospace />
          )}

          {notif.replies && notif.replies.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                📝 Your Notes / Replies
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {notif.replies.map((r, i) => (
                  <div key={i} style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isActionable && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                display: 'flex',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 14,
                background: customMode ? 'rgba(108,99,255,0.06)' : 'rgba(0,0,0,0.15)',
                border: `1px solid ${customMode ? 'rgba(108,99,255,0.3)' : 'rgba(255,255,255,0.07)'}`,
                transition: 'all 0.2s',
              }}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    parsed.suggestions.length > 0
                      ? 'Or type a custom reply to add... (optional)'
                      : 'Add a custom message... (optional)'
                  }
                  value={replyText}
                  onClick={(e) => e.stopPropagation()}
                  onChange={e => {
                    setReplyText(e.target.value);
                    setCustomMode(e.target.value.length > 0);
                    if (e.target.value.length > 0) setSelectedOption(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !notif.requiresApproval) {
                      sendReply();
                    }
                  }}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
                {replyText.trim() && !notif.requiresApproval && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      sendReply();
                    }}
                    disabled={loading === 'reply'}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      background: 'rgba(108,99,255,0.2)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(108,99,255,0.3)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {loading === 'reply' ? '...' : '📨 Note'}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                {notif.requiresApproval && (
                  <ActionButton 
                    label="Approve & Send" 
                    variant="approve" 
                    loading={loading === 'approve'} 
                    onClick={approve} 
                    icon={selectedOption ? '✓' : replyText.trim() ? '✓' : '✓'}
                  />
                )}
                <ActionButton 
                  label="Abandon" 
                  variant="abandon" 
                  loading={loading === 'abandon'} 
                  onClick={abandon} 
                  icon="✕"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const [all, setAll] = useState<AgentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/agents/notifications', { cache: 'no-store' });
      const data = await res.json();
      setAll(data.all || []);
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => fetchAll(true), 5000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const tab = TABS[activeTab];
  const filtered = tab.statuses
    ? all.filter(n => tab.statuses!.includes(n.status))
    : [...all].reverse();

  const sorted = [...filtered].sort((a, b) => {
    const aPriority = a.status === 'pending' || a.status === 'announced' ? 0 : 1;
    const bPriority = b.status === 'pending' || b.status === 'announced' ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const unreadCount = all.filter(n => !n.read).length;
  const awaitingCount = all.filter(n => n.status === 'pending' || n.status === 'announced').length;

  return (
    <div style={{ padding: '40px 48px', maxWidth: 920, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              Notifications
            </h1>
            {awaitingCount > 0 && (
              <span style={{ 
                fontSize: 11, 
                fontWeight: 800, 
                padding: '4px 12px', 
                borderRadius: 20, 
                background: 'rgba(245,158,11,0.12)', 
                color: '#f59e0b', 
                border: '1px solid rgba(245,158,11,0.25)',
                animation: 'pulse 2s infinite',
              }}>
                {awaitingCount} awaiting
              </span>
            )}
            {unreadCount > 0 && unreadCount !== awaitingCount && (
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 12px',
                borderRadius: 20,
                background: 'rgba(96,165,250,0.12)',
                color: '#60a5fa',
                border: '1px solid rgba(96,165,250,0.25)',
              }}>
                {unreadCount} unread
              </span>
            )}
          </div>

          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              opacity: refreshing ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 14 }}>
          Agent reports, DM summaries, and approval requests. Respond here — not in chat.
        </p>
      </header>

      <div style={{ 
        display: 'flex', 
        gap: 4, 
        marginBottom: 28, 
        borderBottom: '1px solid rgba(255,255,255,0.06)', 
        paddingBottom: 0 
      }}>
        {TABS.map((t, i) => {
          const tabItems = t.statuses
            ? all.filter(n => t.statuses!.includes(n.status))
            : all;
          const isActive = activeTab === i;
          return (
            <button
              key={t.label}
              onClick={() => setActiveTab(i)}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {t.label}
              {tabItems.length > 0 && (
                <span style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontWeight: 800,
                }}>
                  {tabItems.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Loading notifications...</div>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ 
          padding: 80, 
          textAlign: 'center', 
          color: 'var(--text-muted)', 
          border: '2px dashed rgba(255,255,255,0.06)', 
          borderRadius: 24,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{tab.emptyIcon}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {activeTab === 0 ? 'No notifications yet' : `No ${tab.label.toLowerCase()} notifications`}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Agent reports and DM findings will appear here when agents call{' '}
            <code style={{ color: 'var(--accent)', background: 'rgba(108,99,255,0.1)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
              agent_notify
            </code>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {sorted.map(n => (
            <NotificationCard key={n.id} notif={n} onRefresh={() => fetchAll(true)} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}