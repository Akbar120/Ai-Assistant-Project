'use client';
import { useState, useEffect, useCallback } from 'react';

type ImprovementStatus = 'pending' | 'approved' | 'rejected' | 'applied';

interface ImprovementRequest {
  id: string;
  created_at: string;
  updated_at: string;
  status: ImprovementStatus;
  requestedBy: string;
  title: string;
  what: string;
  files: string[];
  why: string;
  if_approved: string;
  if_rejected: string;
  patch?: string;
}

const STATUS_CONFIG: Record<ImprovementStatus, { color: string; bg: string; border: string; label: string; icon: string }> = {
  pending:  { color: '#facc15', bg: 'rgba(250,204,21,0.08)',  border: 'rgba(250,204,21,0.15)',  label: 'Pending',  icon: '⏳' },
  approved: { color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.15)', label: 'Approved', icon: '✅' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.15)', label: 'Rejected', icon: '❌' },
  applied:  { color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.15)', label: 'Applied',  icon: '🚀' },
};

const TABS: Array<{ label: string; statuses: ImprovementStatus[]; emptyIcon: string }> = [
  { label: 'Inbox',    statuses: ['pending'], emptyIcon: '📥' },
  { label: 'Approved', statuses: ['approved', 'applied'], emptyIcon: '✅' },
  { label: 'Rejected', statuses: ['rejected'], emptyIcon: '❌' },
  { label: 'All',      statuses: ['pending', 'approved', 'rejected', 'applied'], emptyIcon: '📋' },
];

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, padding: '12px 16px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({ 
  label, 
  variant, 
  loading, 
  onClick, 
  disabled 
}: { 
  label: string; 
  variant: 'approve' | 'reject' | 'apply';
  loading?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const configs = {
    approve: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)', icon: '✓' },
    reject: { bg: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'rgba(248,113,113,0.2)', icon: '✕' },
    apply: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: 'rgba(139,92,246,0.25)', icon: '⚡' },
  };
  const cfg = configs[variant];
  
  return (
    <button
      onClick={onClick}
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
          <span>{cfg.icon}</span>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

function ImprovementCard({ item, onAction }: { item: ImprovementRequest; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<'approve' | 'reject' | 'apply' | null>(null);
  const cfg = STATUS_CONFIG[item.status];
  const isPending = item.status === 'pending';
  const isApproved = item.status === 'approved';

  const doAction = async (action: 'approve' | 'reject' | 'apply') => {
    setLoading(action);
    try {
      if (action === 'apply') {
        await fetch(`/api/improvements/${item.id}/apply`, { method: 'POST' });
      } else {
        await fetch('/api/improvements', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, action }),
        });
      }
      onAction();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div 
      onClick={() => setExpanded(e => !e)}
      style={{
        borderRadius: 20,
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `${cfg.color}15`,
              border: `1px solid ${cfg.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
            }}>
              {cfg.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>
                {item.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  by <b style={{ color: 'var(--accent)', fontWeight: 600 }}>{item.requestedBy}</b>
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {formatTimestamp(item.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: 10,
              background: `${cfg.color}15`,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              whiteSpace: 'nowrap',
            }}>
              {cfg.label}
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

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Files affected */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Files Affected
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {item.files.map(f => (
                <span 
                  key={f} 
                  style={{ 
                    fontSize: 11, 
                    padding: '6px 12px', 
                    borderRadius: 10, 
                    background: 'rgba(108,99,255,0.08)', 
                    border: '1px solid rgba(108,99,255,0.15)', 
                    fontFamily: 'monospace', 
                    color: 'var(--accent)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Details */}
          <DetailRow label="📝 What is requested" value={item.what} />
          <DetailRow label="💡 Why" value={item.why} />
          <DetailRow label="✅ If approved" value={item.if_approved} />
          <DetailRow label="❌ If rejected" value={item.if_rejected} />

          {/* Patch preview */}
          {item.patch && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                📄 Patch Preview
              </div>
              <pre style={{ 
                fontSize: 11, 
                lineHeight: 1.6, 
                padding: 16, 
                borderRadius: 14, 
                background: '#0a0a0a', 
                border: '1px solid rgba(255,255,255,0.08)', 
                color: '#a5b6cf', 
                overflow: 'auto', 
                maxHeight: 280,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}>{item.patch}</pre>
            </div>
          )}

          {/* Action buttons */}
          {isPending && (
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <ActionButton label="Approve" variant="approve" loading={loading === 'approve'} onClick={() => doAction('approve')} />
              <ActionButton label="Reject" variant="reject" loading={loading === 'reject'} onClick={() => doAction('reject')} />
            </div>
          )}

          {isApproved && item.patch && (
            <ActionButton label="Apply Change" variant="apply" loading={loading === 'apply'} onClick={() => doAction('apply')} />
          )}
        </div>
      )}
    </div>
  );
}

export default function ImprovementsPage() {
  const [items, setItems] = useState<ImprovementRequest[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/improvements', { cache: 'no-store' });
      const data = await res.json();
      setItems(data.improvements || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    const iv = setInterval(() => fetchItems(true), 5000);
    return () => clearInterval(iv);
  }, [fetchItems]);

  const tab = TABS[activeTab];
  const filtered = items.filter(i => tab.statuses.includes(i.status));
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const awaitingCount = items.filter(i => ['pending'].includes(i.status)).length;

  return (
    <div style={{ padding: '40px 48px', maxWidth: 920, margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
              Improvements
            </h1>
            {awaitingCount > 0 && (
              <span style={{ 
                fontSize: 11, 
                fontWeight: 800, 
                padding: '4px 12px', 
                borderRadius: 20, 
                background: 'rgba(250,204,21,0.12)', 
                color: '#facc15', 
                border: '1px solid rgba(250,204,21,0.25)',
                animation: 'pulse 2s infinite',
              }}>
                {awaitingCount} awaiting
              </span>
            )}
          </div>

          <button
            onClick={() => fetchItems(true)}
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
            {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 14 }}>
          Review and approve file and module change requests from agents and Jenny. Nothing is modified until you approve.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: 4, 
        marginBottom: 28, 
        borderBottom: '1px solid rgba(255,255,255,0.06)', 
        paddingBottom: 0 
      }}>
        {TABS.map((t, i) => {
          const tabItems = items.filter(item => t.statuses.includes(item.status));
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

      {/* Content */}
      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Loading improvements...</div>
        </div>
      ) : filtered.length === 0 ? (
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
            {activeTab === 0 ? 'No pending requests' : 'Nothing here yet'}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {activeTab === 0
              ? 'When an agent or Jenny wants to modify a file, the request will appear here.'
              : 'Requests will appear here once they are processed.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filtered.map(item => (
            <ImprovementCard key={item.id} item={item} onAction={() => fetchItems(true)} />
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