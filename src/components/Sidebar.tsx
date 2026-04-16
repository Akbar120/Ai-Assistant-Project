'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Chat',
    items: [
      { href: '/chat', label: 'Chat', icon: '💬' },
    ]
  },
  {
    label: 'Control',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊' },
      { href: '/tasks', label: 'Tasks', icon: '📌' },
      { href: '/improvements', label: 'Improvements', icon: '📥' },
      { href: '/scheduled', label: 'Cron Jobs', icon: '🕛' },
    ]
  },
  {
    label: 'Agent',
    items: [
      { href: '/agents', label: 'Agents', icon: '🤖' },
      { href: '/skills', label: 'Skills', icon: '⚡' },
    ]
  },
  {
    label: 'Settings',
    items: [
      { href: '/accounts', label: 'Config', icon: '⚙️' },
    ]
  }
];

interface Status {
  ollama: { running: boolean; models: string[] };
  platforms: {
    discord: { connected: boolean; botName?: string };
    twitter: { connected: boolean };
    instagram: { connected: boolean };
  };
}

// ── Model Selector Component ──────────────────────────────────────────────────
function ModelSelector({ ollamaRunning }: { ollamaRunning: boolean }) {
  const [models, setModels] = useState<string[]>([]);
  const [activeModel, setActiveModelState] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/ollama/models', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setModels(data.models || []);
      setActiveModelState(data.active || '');
    } catch {
      // silent — Ollama may be offline
    }
  }, []);

  useEffect(() => {
    fetchModels();
    const iv = setInterval(fetchModels, 30000);
    return () => clearInterval(iv);
  }, [fetchModels]);

  const handleChange = async (model: string) => {
    setSaving(true);
    setActiveModelState(model);
    try {
      await fetch('/api/ollama/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
    } catch {
      // non-fatal
    } finally {
      setSaving(false);
    }
  };

  // Only show when Ollama is online and models are loaded
  if (!ollamaRunning || models.length === 0) return null;

  return (
    <div
      style={{
        margin: '0 0 16px 0',
        padding: '10px 12px',
        background: 'rgba(var(--accent-rgb, 124,58,237), 0.08)',
        border: '1px solid rgba(var(--accent-rgb, 124,58,237), 0.25)',
        borderRadius: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>🧠</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Active Model
        </span>
        {saving && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--accent)', opacity: 0.8 }}>saving…</span>
        )}
      </div>
      <select
        id="ollama-model-selector"
        value={activeModel}
        onChange={e => handleChange(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--surface, #1a1a2e)',
          color: 'var(--text, #e2e8f0)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          padding: '5px 8px',
          fontSize: '12px',
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          paddingRight: 24,
        }}
      >
        {models.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [pendingImprovements, setPendingImprovements] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/status').then((r) => r.json()).then(setStatus).catch(() => null);
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Poll pending improvement requests for badge
  useEffect(() => {
    const fetchPending = () => {
      fetch('/api/improvements?status=pending', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setPendingImprovements(d.count || 0))
        .catch(() => undefined);
    };
    fetchPending();
    const iv = setInterval(fetchPending, 8000);
    return () => clearInterval(iv);
  }, []);

  // Poll agent notifications
  useEffect(() => {
    const fetchNotifications = () => {
      fetch('/api/agents/notifications', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => {
          setUnreadNotifications(d.unreadCount || 0);
          setPendingApprovalCount(d.pendingApprovalCount || 0);
        })
        .catch(() => undefined);
    };
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 5000);
    return () => clearInterval(iv);
  }, []);

  const connectedCount = status
    ? [status.platforms.discord.connected, status.platforms.twitter.connected, status.platforms.instagram.connected].filter(Boolean).length
    : 0;

  const ollamaRunning = status?.ollama?.running ?? false;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-text" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
          <span style={{ color: 'var(--accent)', fontSize: 20 }}>◈</span> OPENCLAW
        </div>
        <div className="sidebar-logo-sub" style={{ letterSpacing: 0.5 }}>GATEWAY DASHBOARD</div>
      </div>

      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 16 }}>
            <div className="nav-section-label">{group.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}`}
                >
                  <span className="nav-icon" style={{ filter: pathname === item.href ? 'none' : 'grayscale(100%) opacity(0.7)' }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.href === '/accounts' && connectedCount > 0 && (
                    <span className="nav-badge">{connectedCount} OK</span>
                  )}
                  {item.href === '/improvements' && pendingImprovements > 0 && (
                    <span className="nav-badge" style={{ background: '#facc15', color: '#000' }}>{pendingImprovements}</span>
                  )}
                  {item.href === '/chat' && pendingApprovalCount > 0 && (
                    <span className="nav-badge" style={{ background: 'var(--error)', color: '#fff' }}>{pendingApprovalCount} Wait</span>
                  )}
                  {item.href === '/chat' && pendingApprovalCount === 0 && unreadNotifications > 0 && (
                    <span className="nav-badge" style={{ background: '#facc15', color: '#000' }}>{unreadNotifications}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div style={{ margin: '16px 0' }} className="divider" />

        {/* ── Model Selector ───────────────────────────────────────────── */}
        <ModelSelector ollamaRunning={ollamaRunning} />

        <div className="nav-section-label">Status</div>

        {/* Ollama Status */}
        <div className="nav-item" style={{ cursor: 'default' }}>
          <span className="nav-icon">🧠</span>
          <span>Ollama AI</span>
          <span style={{ marginLeft: 'auto' }}>
            {status === null ? (
              <span className="status-dot" style={{ background: 'var(--text-muted)' }} />
            ) : status.ollama.running ? (
              <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 7px' }}>
                <span className="status-dot pulse" />
                On
              </span>
            ) : (
              <span className="badge badge-error" style={{ fontSize: '10px', padding: '2px 7px' }}>
                Off
              </span>
            )}
          </span>
        </div>

        {/* Platform status */}
        {status && (
          <>
            <PlatformStatusItem emoji="💬" name="Discord" connected={status.platforms.discord.connected} />
            <PlatformStatusItem emoji="🐦" name="X / Twitter" connected={status.platforms.twitter.connected} />
            <PlatformStatusItem emoji="📸" name="Instagram" connected={status.platforms.instagram.connected} />
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
          v1.0.0 · Free &amp; Open Source
        </div>
      </div>
    </aside>
  );
}

function PlatformStatusItem({ emoji, name, connected }: { emoji: string; name: string; connected: boolean }) {
  return (
    <div className="nav-item" style={{ cursor: 'default' }}>
      <span className="nav-icon">{emoji}</span>
      <span style={{ fontSize: '13px' }}>{name}</span>
      <span style={{ marginLeft: 'auto' }}>
        {connected ? (
          <span style={{ color: 'var(--success)', fontSize: '11px' }}>●</span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>○</span>
        )}
      </span>
    </div>
  );
}
