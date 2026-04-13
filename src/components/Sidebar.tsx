'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
      { href: '/tasks', label: 'Tasks', icon: '📊' },
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

export default function Sidebar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/status').then((r) => r.json()).then(setStatus).catch(() => null);
    };
    
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const connectedCount = status
    ? [status.platforms.discord.connected, status.platforms.twitter.connected, status.platforms.instagram.connected].filter(Boolean).length
    : 0;

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
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div style={{ margin: '16px 0' }} className="divider" />
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
          v1.0.0 · Free & Open Source
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
