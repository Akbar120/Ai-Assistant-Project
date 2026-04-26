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
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#3b82f6,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-cube" style={{ color: 'white', fontSize: 13 }}></i>
            </div>
            <div>
              <h1 style={{ color: 'white', fontWeight: 700, letterSpacing: '0.15em', fontSize: 12, margin: 0 }}>OPENCLAW</h1>
              <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>AI CONTROL CENTER</p>
            </div>
          </div>
          <button style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
            <i className="fa-solid fa-bars" style={{ fontSize: 16 }}></i>
          </button>
        </div>

        {/* ── Agent Profile ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '20px 16px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          {/* Avatar — enlarges and glows cyan when speaking */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{
              width: isSpeaking ? 124 : 116,
              height: isSpeaking ? 124 : 116,
              borderRadius: '50%',
              overflow: 'hidden',
              border: isSpeaking ? '3px solid rgba(0,243,255,0.9)' : '2.5px solid rgba(176,38,255,0.5)',
              boxShadow: isSpeaking
                ? '0 0 20px rgba(0,243,255,0.7), 0 0 45px rgba(0,243,255,0.3)'
                : '0 0 18px rgba(176,38,255,0.3), 0 0 35px rgba(176,38,255,0.1)',
              transition: 'all 0.4s ease',
              flexShrink: 0,
            }}>
              <img
                alt="Jenny AI"
                src="/jenny-image/avatar.jpg"
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: '50% 15%',
                  transform: isSpeaking ? 'scale(1.06)' : 'scale(1)',
                  transition: 'transform 0.4s ease',
                }}
              />
            </div>
            {/* Pulse ring when speaking */}
            {isSpeaking && (
              <div style={{
                position: 'absolute', inset: -8, borderRadius: '50%',
                border: '2px solid rgba(0,243,255,0.5)',
                animation: 'pulse-ring 1.6s ease-out infinite',
                pointerEvents: 'none',
              }} />
            )}
          </div>

          <h2 style={{ color: 'white', fontWeight: 600, fontSize: 15, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
            JENNY AI
            <i className="fa-solid fa-circle-check" style={{ color: '#3b82f6', fontSize: 12 }}></i>
          </h2>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 12px' }}>Multi-Tasking Agent</p>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#13151f', padding: '6px 14px',
            borderRadius: 9999, border: '1px solid #374151', flexShrink: 0,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#ef4444', boxShadow: online ? '0 0 6px #22c55e' : '0 0 6px #ef4444', flexShrink: 0 }}></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: online ? '#22c55e' : '#ef4444' }}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 0', minHeight: 0 }}>
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
                      color: isActive ? 'white' : '#9ca3af',
                      textDecoration: 'none', fontSize: 14,
                      fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'linear-gradient(90deg, rgba(176,38,255,0.22) 0%, transparent 100%)' : 'transparent',
                      borderLeft: isActive ? '4px solid #b026ff' : '4px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <i className={item.icon} style={{ width: 20, textAlign: 'center', fontSize: 14, color: isActive ? '#b026ff' : 'inherit' }}></i>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

      </aside>
    </>
  );
}
