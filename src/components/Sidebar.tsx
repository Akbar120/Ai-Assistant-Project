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

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '⚡' },
  { href: '/chat', label: 'Jenny AI', icon: '🌸' },
  { href: '/accounts', label: 'Accounts', icon: '🔗' },
  { href: '/scheduled', label: 'Scheduled', icon: '🕐' },
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

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => null);

    const interval = setInterval(() => {
      fetch('/api/status')
        .then((r) => r.json())
        .then(setStatus)
        .catch(() => null);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const connectedCount = status
    ? [status.platforms.discord.connected, status.platforms.twitter.connected, status.platforms.instagram.connected].filter(Boolean).length
    : 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-text">⚡ SocialPoster</div>
        <div className="sidebar-logo-sub">Multi-Platform AI Dashboard</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.href === '/accounts' && connectedCount > 0 && (
              <span className="nav-badge">{connectedCount}/3</span>
            )}
          </Link>
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
