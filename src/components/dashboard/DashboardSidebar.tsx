'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatStore } from '@/components/chat/ChatProvider';

const NAV_ITEMS = [
  { href: '/chat', icon: 'fa-solid fa-comments', label: 'Chat' },
  { href: '/dashboard', icon: 'fa-solid fa-border-all', label: 'Dashboard' },
  { href: '/tasks', icon: 'fa-solid fa-check-square', label: 'Tasks' },
  { href: '/improvements', icon: 'fa-solid fa-arrow-trend-up', label: 'Improvements' },
  { href: '/scheduled', icon: 'fa-solid fa-clock', label: 'Cron Jobs' },
  { href: '/agents', icon: 'fa-solid fa-users-gear', label: 'Agents' },
  { href: '/skills', icon: 'fa-solid fa-bolt', label: 'Skills' },
  { href: '/notifications', icon: 'fa-regular fa-bell', label: 'Notifications' },
  { href: '/connected-apps', icon: 'fa-solid fa-link', label: 'Connections' },
  { href: '/settings', icon: 'fa-solid fa-gear', label: 'Settings' },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { isSpeaking, isOllamaOnline: online } = useChatStore();

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes rotate-ring-fast {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes rotate-ring-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes wave-bar {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        .sidebar-nav-link:hover {
          background: rgba(176,38,255,0.08) !important;
          color: white !important;
        }
      `}</style>
      <aside style={{
        width: 260,
        minWidth: 260,
        maxWidth: 260,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        background: '#0d0e15',
        zIndex: 10,
        flexShrink: 0,
        overflow: 'hidden',
      }}>

        {/* ── Logo ── */}
        <div style={{
          height: 64, minHeight: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#00f2ff,#6c63ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(0,242,255,0.4)' }}>
              <i className="fa-solid fa-cube" style={{ color: 'white', fontSize: 14 }}></i>
            </div>
            <div>
              <h1 style={{ color: 'white', fontWeight: 800, letterSpacing: '0.18em', fontSize: 13, margin: 0 }}>OPENCLAW</h1>
              <p style={{ color: '#64748b', fontSize: 10, fontWeight: 600, margin: 0, letterSpacing: '0.05em' }}>AI CONTROL CENTER</p>
            </div>
          </div>
          <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
            <i className="fa-solid fa-bars" style={{ fontSize: 18 }}></i>
          </button>
        </div>

        {/* ── Agent Profile ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '28px 16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          {/* Avatar — enlarges and glows cyan when speaking */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            {/* Rotating ring (always visible, faster when speaking) */}
            <div style={{
              position: 'absolute', inset: -8,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: isSpeaking ? '#00f2ff' : 'rgba(0,242,255,0.4)',
              borderRightColor: isSpeaking ? 'rgba(0,242,255,0.6)' : 'rgba(108,99,255,0.3)',
              animation: isSpeaking ? 'rotate-ring-fast 1s linear infinite' : 'rotate-ring-slow 4s linear infinite',
              pointerEvents: 'none',
              zIndex: 1,
            }} />
            <div style={{
              width: isSpeaking ? 132 : 124,
              height: isSpeaking ? 132 : 124,
              borderRadius: '50%',
              overflow: 'hidden',
              border: isSpeaking ? '3px solid rgba(0,242,255,0.95)' : '3px solid rgba(0,242,255,0.4)',
              boxShadow: isSpeaking
                ? '0 0 25px rgba(0,242,255,0.8), 0 0 50px rgba(0,242,255,0.4)'
                : '0 0 20px rgba(0,242,255,0.2), 0 0 40px rgba(0,242,255,0.1)',
              transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              flexShrink: 0,
              position: 'relative',
            }}>
              <img
                alt="Jenny AI"
                src="/jenny-image/avatar.jpg"
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: '50% 15%',
                  transform: isSpeaking ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.5s ease',
                }}
              />
            </div>
            {/* Pulse ring when speaking */}
            {isSpeaking && (
              <div style={{
                position: 'absolute', inset: -10, borderRadius: '50%',
                border: '2px solid rgba(0,242,255,0.6)',
                animation: 'pulse-ring 2s ease-out infinite',
                pointerEvents: 'none',
              }} />
            )}
          </div>

          <h2 style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.02em' }}>
            JENNY AI
            <i className="fa-solid fa-circle-check" style={{ color: '#00f2ff', fontSize: 13, filter: 'drop-shadow(0 0 4px rgba(0,242,255,0.5))' }}></i>
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 16px', fontWeight: 500 }}>Multi-Tasking Agent</p>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(34,197,94,0.08)', padding: '6px 16px',
            borderRadius: 9999, border: '1px solid rgba(34,197,94,0.3)', flexShrink: 0,
            boxShadow: online ? '0 0 10px rgba(34,197,94,0.1)' : 'none',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#ef4444', boxShadow: online ? '0 0 8px #22c55e' : '0 0 8px #ef4444', flexShrink: 0 }}></span>
            <span style={{ fontSize: 11, fontWeight: 800, color: online ? '#22c55e' : '#ef4444', letterSpacing: '0.08em' }}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 0', minHeight: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || (item.href === '/chat' && (pathname?.startsWith('/chat') ?? false));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="sidebar-nav-link"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 24px',
                      color: isActive ? 'white' : '#94a3b8',
                      textDecoration: 'none', fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      background: isActive ? 'linear-gradient(90deg, rgba(0,242,255,0.12) 0%, transparent 100%)' : 'transparent',
                      borderLeft: isActive ? '4px solid #00f2ff' : '4px solid transparent',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                  >
                    <i className={item.icon} style={{ width: 20, textAlign: 'center', fontSize: 15, color: isActive ? '#00f2ff' : 'inherit', filter: isActive ? 'drop-shadow(0 0 5px rgba(0,242,255,0.5))' : 'none' }}></i>
                    {item.label}
                    {item.href === '/notifications' && (
                      <span style={{ marginLeft: 'auto', background: '#00f2ff', color: '#07080f', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, boxShadow: '0 0 8px rgba(0,242,255,0.4)' }}>3</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Storage Bar ── */}
        <div style={{
          padding: '20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.02em' }}>System Storage</span>
            <span style={{ fontSize: 11, color: '#00f2ff', fontWeight: 800 }}>72%</span>
          </div>
          <div style={{
            height: 6,
            background: '#13151f',
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.03)',
          }}>
            <div style={{
              width: '72%',
              height: '100%',
              background: 'linear-gradient(90deg, #00f2ff, #6c63ff)',
              borderRadius: 3,
              boxShadow: '0 0 10px rgba(0,242,255,0.4)',
            }} />
          </div>
          <p style={{ fontSize: 10, color: '#475569', marginTop: 8, textAlign: 'center', fontWeight: 500 }}>72% Used</p>
        </div>

      </aside>
    </>
  );
}
