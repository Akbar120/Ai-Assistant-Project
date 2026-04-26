'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const { status: voiceStatus, setListening } = useVoiceEngine();
  const { stopAllTTS } = useMessagePipeline();

  const [micEnabled, setMicEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);

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
      background: 'rgba(13,14,21,0.9)',
      backdropFilter: 'blur(10px)',
      flexShrink: 0, zIndex: 10,
    }}>

      {/* Left — Jenny identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 16, fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>JENNY AI</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>
              NEURAL SYNC: <span style={{ color: 'white' }}>99.8%</span>
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', display: 'inline-block' }} />
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)' }} />

        {/* Mode Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {MODE_ORDER.map(m => {
            const mc = MODE_CONFIG[m];
            const isActive = m === currentMode;
            return (
              <span
                key={m}
                onClick={() => handleModeManualSwitch(m)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  border: `1px solid ${isActive ? mc.color : 'rgba(255,255,255,0.08)'}`,
                  background: isActive ? `rgba(${mc.color === '#00f3ff' ? '0,243,255' : mc.color === '#6366f1' ? '99,102,241' : mc.color === '#f59e0b' ? '245,158,11' : mc.color === '#10b981' ? '16,185,129' : '148,163,184'},0.12)` : 'transparent',
                  color: isActive ? mc.color : 'rgba(255,255,255,0.22)',
                  boxShadow: isActive ? `0 0 12px ${mc.glow}` : 'none',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  userSelect: 'none',
                  opacity: isActive ? 1 : 0.6,
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.opacity = '0.6';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 12 }} />
          <input
            type="text"
            placeholder="Search or ask Jenny anything..."
            style={{
              background: '#13151f', border: '1px solid #374151', borderRadius: 9999,
              paddingLeft: 36, paddingRight: 48, paddingTop: 8, paddingBottom: 8,
              width: 280, color: 'white', fontSize: 13, outline: 'none',
            }}
          />
          <div style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: '#1f2937', borderRadius: 4, padding: '2px 6px',
            fontSize: 10, color: '#9ca3af', border: '1px solid #374151',
          }}>⌘K</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Mic Toggle */}
          <button
            onClick={handleMicToggle}
            title={micEnabled ? 'Mute wake-word' : 'Enable wake-word'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `1px solid ${micEnabled ? '#00f3ff' : '#6b7280'}`,
              background: micEnabled ? 'rgba(0,243,255,0.1)' : 'transparent',
              color: micEnabled ? '#00f3ff' : '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0, position: 'relative',
            }}
          >
            <i className={`fa-solid ${micEnabled ? 'fa-microphone' : 'fa-microphone-slash'}`} style={{ fontSize: 13 }} />
            {!micEnabled && (
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #ef4444', opacity: 0.6 }} />
            )}
          </button>

          {/* TTS Toggle */}
          <button
            onClick={handleTtsToggle}
            title={ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `1px solid ${ttsEnabled ? '#374151' : '#ef4444'}`,
              background: ttsEnabled ? 'transparent' : 'rgba(239,68,68,0.1)',
              color: ttsEnabled ? '#9ca3af' : '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
            }}
          >
            <i className={`fa-solid ${ttsEnabled ? 'fa-wave-square' : 'fa-volume-xmark'}`} style={{ fontSize: 13 }} />
          </button>

          {/* Refresh Server */}
          <button
            onClick={() => window.location.reload()}
            title="Refresh Server"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '1px solid #374151', color: '#9ca3af', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0, position: 'relative',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00f3ff'; e.currentTarget.style.borderColor = 'rgba(0,243,255,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#374151'; }}
          >
          <i className="fa-solid fa-rotate-right" style={{ fontSize: 13 }} />
          </button>

          {/* Clear Chat */}
          <button
            onClick={handleClearChat}
            title="Clear Chat History"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '1px solid #374151', color: '#9ca3af', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0, position: 'relative',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#374151'; }}
          >
            <i className="fa-solid fa-trash-can" style={{ fontSize: 13 }} />
          </button>

          {/* Notifications */}
          <button title="Notifications" style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '1px solid #374151', color: '#9ca3af', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0, position: 'relative',
          }}>
            <i className="fa-regular fa-bell" style={{ fontSize: 13 }} />
            <span style={{ position: 'absolute', top: 1, right: 1, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '1.5px solid #0d0e15' }} />
          </button>

          {/* Profile */}
          <button title="Profile" style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e3a8a, #5b21b6)',
            border: '1px solid #3b82f6',
            color: '#93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>J</button>
        </div>
      </div>
    </header>
  );
}
