'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import { useMessagePipeline } from '@/hooks/useMessagePipeline';

type JennyMode = 'conversation' | 'planning' | 'analyze' | 'confirmation' | 'execution';

const MODE_CONFIG: Record<JennyMode, { label: string; color: string; glow: string }> = {
  conversation: { label: 'Conversation', color: '#94a3b8', glow: 'rgba(148,163,184,0.25)' },
  planning:     { label: 'Planning',     color: '#f59e0b', glow: 'rgba(245,158,11,0.30)' },
  analyze:      { label: 'Analyze',      color: '#6366f1', glow: 'rgba(99,102,241,0.35)' },
  confirmation: { label: 'Confirmation', color: '#10b981', glow: 'rgba(16,185,129,0.30)' },
  execution:    { label: 'Execution',    color: '#00f3ff', glow: 'rgba(0,243,255,0.35)' },
};

const MODE_ORDER: JennyMode[] = ['conversation', 'planning', 'analyze', 'confirmation', 'execution'];

export default function DashboardHeader({
  activeMode,
}: {
  activeMode?: JennyMode;
}) {
  const router = useRouter();
  const { status: voiceStatus, setListening } = useVoiceEngine();
  const { stopAllTTS } = useMessagePipeline();

  const [micEnabled, setMicEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  };

  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.profile-dropdown')) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [profileOpen]);

  // Poll mode from server if not passed as prop
  const [polledMode, setPolledMode] = useState<JennyMode>('conversation');
  const lastActiveModeRef = useRef<number>(0);

  useEffect(() => {
    let lastPollTime = 0;
    const poll = async () => {
      // Prevent multiple polls in flight or too frequent polls
      if (Date.now() - lastPollTime < 1000) return;
      lastPollTime = Date.now();

      // Don't let poll overwrite a recently received activeMode from SSE
      // (SSE is always more up-to-date than the poll)
      if (Date.now() - lastActiveModeRef.current < 3000) return;

      try {
        const res = await fetch('/api/chat/mode', { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          if (d.mode) setPolledMode(d.mode as JennyMode);
        }
      } catch { /* silent */ }
    };

    // Initial poll
    poll();

    // Poll interval
    const iv = setInterval(() => {
      if (!document.hidden) poll();
    }, 1500);

    // Immediate poll when returning to tab
    const handleVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleClearChat = async () => {
    if (!confirm('Are you sure you want to clear the entire chat history and reset Jenny?')) return;
    try {
      const res = await fetch('/api/chat/clear', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  // When activeMode prop arrives from SSE, stamp the time so polls don't override it
  useEffect(() => {
    if (activeMode) {
      lastActiveModeRef.current = Date.now();
    }
  }, [activeMode]);

  const handleModeManualSwitch = async (m: JennyMode) => {
    try {
      const res = await fetch('/api/chat/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m })
      });
      if (res.ok) {
        setPolledMode(m);
      }
    } catch { /* silent */ }
  };

  const currentMode: JennyMode = activeMode ?? polledMode;
  const cfg = MODE_CONFIG[currentMode] ?? MODE_CONFIG.conversation;

  const handleMicToggle = useCallback(() => {
    const next = !micEnabled;
    setMicEnabled(next);
    setListening(next);
  }, [micEnabled, setListening]);

  const handleTtsToggle = useCallback(() => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    if (!next) stopAllTTS();
  }, [ttsEnabled, stopAllTTS]);

  return (
    <header style={{
      height: 64, minHeight: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(7,8,15,0.8)',
      backdropFilter: 'blur(12px)',
      flexShrink: 0, 
      position: 'relative',
      zIndex: 1000,
    }}>

      {/* Left — Jenny identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 16, fontWeight: 800, letterSpacing: '0.08em', margin: 0, textShadow: '0 0 10px rgba(0,242,255,0.2)' }}>JENNY AI</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.04em' }}>
              NEURAL SYNC: <span style={{ color: '#00f2ff' }}>98.6%</span>
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', display: 'inline-block' }} />
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)' }} />

        {/* Mode Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.05)' }}>
          {MODE_ORDER.map(m => {
            const mc = MODE_CONFIG[m];
            const isActive = m === currentMode;
            return (
              <span
                key={m}
                onClick={() => handleModeManualSwitch(m)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  border: `1px solid ${isActive ? 'rgba(0,242,255,0.4)' : 'transparent'}`,
                  background: isActive ? 'rgba(0,242,255,0.12)' : 'transparent',
                  color: isActive ? '#00f2ff' : '#64748b',
                  boxShadow: isActive ? '0 0 15px rgba(0,242,255,0.25)' : 'none',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  opacity: isActive ? 1 : 0.7,
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#64748b';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {mc.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Right — Search + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }} />
          <input
            type="text"
            placeholder="Search or ask Jenny anything..."
            style={{
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9999,
              paddingLeft: 40, paddingRight: 52, paddingTop: 10, paddingBottom: 10,
              width: 320, color: 'white', fontSize: 13, outline: 'none',
              transition: 'all 0.3s',
              fontWeight: 500,
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(0,242,255,0.5)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(0,242,255,0.1)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <div style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px',
            fontSize: 10, color: '#64748b', border: '1px solid rgba(255,255,255,0.1)',
            fontWeight: 700,
          }}>⌘K</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Mic Toggle */}
          <button
            onClick={handleMicToggle}
            title={micEnabled ? 'Mute wake-word' : 'Enable wake-word'}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: `1px solid ${micEnabled ? 'rgba(0,242,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
              background: micEnabled ? 'rgba(0,242,255,0.08)' : 'rgba(0,0,0,0.2)',
              color: micEnabled ? '#00f2ff' : '#64748b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.3s', flexShrink: 0,
              boxShadow: micEnabled ? '0 0 15px rgba(0,242,255,0.2)' : 'none',
            }}
          >
            <i className={`fa-solid ${micEnabled ? 'fa-microphone' : 'fa-microphone-slash'}`} style={{ fontSize: 14 }} />
          </button>

          {/* TTS Toggle */}
          <button
            onClick={handleTtsToggle}
            title={ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: `1px solid ${ttsEnabled ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.4)'}`,
              background: ttsEnabled ? 'rgba(0,0,0,0.2)' : 'rgba(239,68,68,0.08)',
              color: ttsEnabled ? '#64748b' : '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.3s', flexShrink: 0,
              boxShadow: !ttsEnabled ? '0 0 15px rgba(239,68,68,0.2)' : 'none',
            }}
          >
            <i className={`fa-solid ${ttsEnabled ? 'fa-wave-square' : 'fa-volume-xmark'}`} style={{ fontSize: 14 }} />
          </button>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

          {/* Refresh Server */}
          <button
            onClick={() => window.location.reload()}
            title="Refresh Server"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', background: 'rgba(0,0,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.3s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            <i className="fa-solid fa-rotate-right" style={{ fontSize: 14 }} />
          </button>

          {/* Notifications */}
          <button title="Notifications" style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', background: 'rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.3s', flexShrink: 0, position: 'relative',
          }}>
            <i className="fa-regular fa-bell" style={{ fontSize: 14 }} />
            <span style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid #07080f', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }} />
          </button>

          {/* Profile Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              title="Profile"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, #00f2ff, #6c63ff)',
                border: '2px solid rgba(255,255,255,0.1)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontWeight: 800, fontSize: 14, flexShrink: 0,
                boxShadow: '0 0 15px rgba(0,242,255,0.3)',
              }}
            >A</button>

            {profileOpen && (
              <div
                className="profile-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 8,
                  minWidth: 160,
                  background: '#13151f',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                  zIndex: 100,
                }}
              >
                <button
                  onClick={() => { setProfileOpen(false); router.push('/settings'); }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    color: '#e2e8f0',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,242,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  <i className="fa-solid fa-gear" style={{ width: 16, color: '#64748b' }} />
                  Settings
                </button>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <button
                  onClick={() => { setProfileOpen(false); handleSignOut(); }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                >
                  <i className="fa-solid fa-right-from-bracket" style={{ width: 16 }} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
