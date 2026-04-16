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

const STATUS_CONFIG: Record<ImprovementStatus, { color: string; bg: string; label: string; icon: string }> = {
  pending:  { color: '#facc15', bg: 'rgba(250,204,21,0.08)',  label: 'Pending',  icon: '⏳' },
  approved: { color: '#34d399', bg: 'rgba(52,211,153,0.08)', label: 'Approved', icon: '✅' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', label: 'Rejected', icon: '❌' },
  applied:  { color: '#818cf8', bg: 'rgba(129,140,248,0.08)', label: 'Applied',  icon: '🚀' },
};

const TAB_STATUSES: Record<string, ImprovementStatus[]> = {
  Inbox:    ['pending'],
  Approved: ['approved', 'applied'],
  Rejected: ['rejected'],
  All:      ['pending', 'approved', 'rejected', 'applied'],
};

function ImprovementCard({ item, onAction }: { item: ImprovementRequest; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<'approve' | 'reject' | 'apply' | null>(null);
  const cfg = STATUS_CONFIG[item.status];

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
    <div style={{
      borderRadius: 16, border: `1px solid ${cfg.color}30`,
      background: cfg.bg, marginBottom: 16, overflow: 'hidden',
      transition: 'box-shadow 0.2s'
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '18px 24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ fontSize: 28 }}>{cfg.icon}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>by <b style={{ color: 'var(--accent)' }}>{item.requestedBy}</b></span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(item.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
            background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30`
          }}>
            {cfg.label}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Files affected */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Files Affected</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {item.files.map(f => (
                <span key={f} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace', color: 'var(--accent)' }}>{f}</span>
              ))}
            </div>
          </div>

          {/* Details grid */}
          {[
            { label: '📝 What is requested', value: item.what },
            { label: '💡 Why', value: item.why },
            { label: '✅ If approved', value: item.if_approved },
            { label: '❌ If rejected', value: item.if_rejected },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>{value}</div>
            </div>
          ))}

          {/* Patch preview */}
          {item.patch && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>📄 Patch Preview</div>
              <pre style={{ fontSize: 11, lineHeight: 1.6, padding: 14, borderRadius: 10, background: '#0d1117', border: '1px solid #30363d', color: '#d1d5db', overflow: 'auto', maxHeight: 200 }}>{item.patch}</pre>
            </div>
          )}

          {/* Action buttons */}
          {item.status === 'pending' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => doAction('approve')}
                disabled={loading !== null}
                style={{ flex: 1, padding: '10px 20px', borderRadius: 10, background: 'rgba(52,211,153,0.15)', color: '#34d399', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(52,211,153,0.3)' }}
              >
                {loading === 'approve' ? 'Approving...' : '✅ Approve'}
              </button>
              <button
                onClick={() => doAction('reject')}
                disabled={loading !== null}
                style={{ flex: 1, padding: '10px 20px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(248,113,113,0.3)' }}
              >
                {loading === 'reject' ? 'Rejecting...' : '❌ Reject'}
              </button>
            </div>
          )}

          {item.status === 'approved' && item.patch && (
            <button
              onClick={() => doAction('apply')}
              disabled={loading !== null}
              style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(129,140,248,0.15)', color: '#818cf8', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(129,140,248,0.3)', alignSelf: 'flex-start' }}
            >
              {loading === 'apply' ? 'Applying...' : '🚀 Apply Change'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImprovementsPage() {
  const [items, setItems] = useState<ImprovementRequest[]>([]);
  const [activeTab, setActiveTab] = useState('Inbox');
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/improvements');
      const data = await res.json();
      setItems(data.improvements || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    const iv = setInterval(fetchItems, 5000);
    return () => clearInterval(iv);
  }, [fetchItems]);

  const tabs = Object.keys(TAB_STATUSES);
  const tabStatuses = TAB_STATUSES[activeTab] || [];
  const filtered = items.filter(i => tabStatuses.includes(i.status));
  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <div style={{ padding: '40px 48px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>Improvements</h1>
          {pendingCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: 'rgba(250,204,21,0.15)', color: '#facc15', border: '1px solid rgba(250,204,21,0.3)' }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
          Review and approve file/module change requests from agents and Jenny. Nothing is modified until you approve.
        </p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0 }}>
        {tabs.map(tab => {
          const tabItems = items.filter(i => TAB_STATUSES[tab].includes(i.status));
          return (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              {tab}
              {tab === 'Inbox' && pendingCount > 0 && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#facc15', color: '#000', fontWeight: 800 }}>{pendingCount}</span>
              )}
              {tab !== 'All' && tab !== 'Inbox' && tabItems.length > 0 && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontWeight: 700 }}>{tabItems.length}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading requests...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border-subtle)', borderRadius: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {activeTab === 'Inbox' ? '📥' : '📋'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {activeTab === 'Inbox' ? 'No pending requests' : 'Nothing here yet'}
          </div>
          <div style={{ fontSize: 13 }}>
            {activeTab === 'Inbox'
              ? 'When an agent or Jenny wants to modify a file, the request will appear here.'
              : 'Requests will appear here once they are processed.'}
          </div>
        </div>
      ) : (
        filtered.map(item => (
          <ImprovementCard key={item.id} item={item} onAction={fetchItems} />
        ))
      )}
    </div>
  );
}
