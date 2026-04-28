'use client';

import { useEffect, useRef, useState } from 'react';
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
  const { isSpeaking, isOllamaOnline: online, loading, processingTaskLabel, hasStartedReply } = useChatStore();
  
  const video1Ref = useRef<HTMLVideoElement>(null);
  const video2Ref = useRef<HTMLVideoElement>(null);
  const [activeVideo, setActiveVideo] = useState<1 | 2>(1);
  const [videosReady, setVideosReady] = useState(false);
  const [isVideo1Playing, setIsVideo1Playing] = useState(false);
  const lastThinkingRef = useRef(false);

  const isJennyThinking = (loading || processingTaskLabel !== null) && !hasStartedReply;

  // 1. Thinking Starts -> Play Video 1 to end and stick
  useEffect(() => {
    if (isJennyThinking && !lastThinkingRef.current) {
      if (video1Ref.current) {
        video1Ref.current.currentTime = 0;
        
        const handlePlaying = () => {
          setActiveVideo(1);
          setIsVideo1Playing(true);
          video1Ref.current?.removeEventListener('playing', handlePlaying);
        };
        
        video1Ref.current.addEventListener('playing', handlePlaying);
        video1Ref.current.play().catch(() => {});
      }
      // Prepare Video 2 for the upcoming reply transition
      if (video2Ref.current) {
        video2Ref.current.currentTime = 0;
        video2Ref.current.pause();
      }
    }
    lastThinkingRef.current = isJennyThinking;
  }, [isJennyThinking]);

  // 2. Thinking Ends (Reply Starts) -> Play Video 2 to end
  useEffect(() => {
    if (hasStartedReply) {
      setIsVideo1Playing(false);
      if (video2Ref.current) {
        video2Ref.current.currentTime = 0;
        
        const handlePlaying = () => {
          setActiveVideo(2);
          // ONLY reset Video 1 AFTER Video 2 has taken over the screen
          if (video1Ref.current) {
            video1Ref.current.currentTime = 0;
            video1Ref.current.pause();
          }
          video2Ref.current?.removeEventListener('playing', handlePlaying);
        };
        
        video2Ref.current.addEventListener('playing', handlePlaying);
        video2Ref.current.play().catch(() => {});
      }
    }
  }, [hasStartedReply]);

  const handleVideo2Ended = () => {
    // 3. Video 2 ends -> Silently switch back to Video 1 (already at 0)
    setActiveVideo(1);
  };

  // Preload check
  useEffect(() => {
    const v1 = video1Ref.current;
    const v2 = video2Ref.current;
    if (v1 && v2) {
      const check = () => {
        if (v1.readyState >= 3 && v2.readyState >= 3) setVideosReady(true);
      };
      v1.addEventListener('canplaythrough', check);
      v2.addEventListener('canplaythrough', check);
      return () => {
        v1.removeEventListener('canplaythrough', check);
        v2.removeEventListener('canplaythrough', check);
      };
    }
  }, []);

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
        
        /* Neuron Signals - Letters/symbols falling into forehead */
        /* Forehead target: translate(0, -15px) - upper center of avatar */
        @keyframes neuron-fall-1 {
          0% { transform: translate(-100px, -80px) translateZ(50px) rotate(0deg) scale(1); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(-30px, -40px) translateZ(20px) rotate(90deg) scale(0.5); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(200deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-2 {
          0% { transform: translate(95px, -70px) translateZ(-30px) rotate(0deg) scale(0.9); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(25px, -35px) translateZ(10px) rotate(-120deg) scale(0.45); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(-220deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-3 {
          0% { transform: translate(-85px, 60px) translateZ(40px) rotate(0deg) scale(1); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(-20px, -30px) translateZ(15px) rotate(100deg) scale(0.4); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(250deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-4 {
          0% { transform: translate(90px, 65px) translateZ(-50px) rotate(0deg) scale(0.85); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(30px, -45px) translateZ(-10px) rotate(-80deg) scale(0.35); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(-180deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-5 {
          0% { transform: translate(-90px, 15px) translateZ(30px) rotate(0deg) scale(1); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(-15px, -25px) translateZ(5px) rotate(60deg) scale(0.5); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(160deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-6 {
          0% { transform: translate(100px, -20px) translateZ(-20px) rotate(0deg) scale(0.95); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(20px, -30px) translateZ(-5px) rotate(-100deg) scale(0.45); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(-200deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-7 {
          0% { transform: translate(-70px, -55px) translateZ(60px) rotate(0deg) scale(1); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(-10px, -35px) translateZ(25px) rotate(80deg) scale(0.55); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(220deg) scale(0.1); opacity: 0; }
        }
        @keyframes neuron-fall-8 {
          0% { transform: translate(75px, 75px) translateZ(-40px) rotate(0deg) scale(0.9); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: translate(15px, -40px) translateZ(-15px) rotate(-140deg) scale(0.4); opacity: 1; }
          85% { opacity: 0.7; }
          100% { transform: translate(0px, -15px) translateZ(0px) rotate(-260deg) scale(0.1); opacity: 0; }
        }
        /* Lines moving into forehead - faster than symbols */
        @keyframes neuron-line-fly-1 {
          0% { transform: translate(-120px, -60px) rotate(15deg) scaleX(1); opacity: 0; width: 30px; }
          20% { opacity: 1; width: 25px; }
          60% { opacity: 0.9; width: 18px; }
          100% { transform: translate(0px, -15px) rotate(15deg) scaleX(0); opacity: 0; width: 0px; }
        }
        @keyframes neuron-line-fly-2 {
          0% { transform: translate(110px, -50px) rotate(-25deg) scaleX(1); opacity: 0; width: 28px; }
          20% { opacity: 1; width: 22px; }
          60% { opacity: 0.9; width: 15px; }
          100% { transform: translate(0px, -15px) rotate(-25deg) scaleX(0); opacity: 0; width: 0px; }
        }
        @keyframes neuron-line-fly-3 {
          0% { transform: translate(-95px, 55px) rotate(45deg) scaleX(1); opacity: 0; width: 25px; }
          20% { opacity: 1; width: 20px; }
          60% { opacity: 0.9; width: 12px; }
          100% { transform: translate(0px, -15px) rotate(45deg) scaleX(0); opacity: 0; width: 0px; }
        }
        @keyframes neuron-line-fly-4 {
          0% { transform: translate(100px, 60px) rotate(-50deg) scaleX(1); opacity: 0; width: 22px; }
          20% { opacity: 1; width: 18px; }
          60% { opacity: 0.9; width: 10px; }
          100% { transform: translate(0px, -15px) rotate(-50deg) scaleX(0); opacity: 0; width: 0px; }
        }
        .neuron-signal {
          position: absolute;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          font-weight: bold;
          color: #00f2ff;
          text-shadow: 0 0 10px #00f2ff, 0 0 20px #00f2ff;
          pointer-events: none;
          z-index: 50;
          left: 50%;
          top: 50%;
          margin-left: 0;
          margin-top: -15px;
        }
        .neuron-char-1 { animation: neuron-fall-1 0.9s ease-in infinite; animation-delay: 0s; }
        .neuron-char-2 { animation: neuron-fall-2 1.1s ease-in infinite; animation-delay: 0.15s; }
        .neuron-char-3 { animation: neuron-fall-3 0.85s ease-in infinite; animation-delay: 0.3s; }
        .neuron-char-4 { animation: neuron-fall-4 1s ease-in infinite; animation-delay: 0.1s; }
        .neuron-char-5 { animation: neuron-fall-5 1.05s ease-in infinite; animation-delay: 0.25s; }
        .neuron-char-6 { animation: neuron-fall-6 0.95s ease-in infinite; animation-delay: 0.4s; }
        .neuron-char-7 { animation: neuron-fall-7 1.1s ease-in infinite; animation-delay: 0.2s; }
        .neuron-char-8 { animation: neuron-fall-8 0.9s ease-in infinite; animation-delay: 0.35s; }
        .neuron-line {
          position: absolute;
          left: 50%;
          top: 50%;
          background: linear-gradient(90deg, transparent, #00f2ff, #00f2ff);
          box-shadow: 0 0 8px #00f2ff;
          z-index: 45;
        }
        .line-1 { animation: neuron-line-fly-1 0.5s linear infinite; animation-delay: 0.05s; }
        .line-2 { animation: neuron-line-fly-2 0.55s linear infinite; animation-delay: 0.15s; }
        .line-3 { animation: neuron-line-fly-3 0.45s linear infinite; animation-delay: 0.1s; }
        .line-4 { animation: neuron-line-fly-4 0.5s linear infinite; animation-delay: 0.2s; }
        
        /* Brain glow pulse */
        @keyframes brain-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(0,242,255,0.3), 0 0 40px rgba(0,242,255,0.1); }
          50% { box-shadow: 0 0 30px rgba(0,242,255, 0.6), 0 0 60px rgba(0,242,255, 0.3); }
        }
        .brain-active {
          animation: brain-pulse 1s ease-in-out infinite;
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
              background: '#0d0e15'
            }}>
              {/* Dual Video Engine — both rendered for seamless swap */}
              <video
                ref={video1Ref}
                src="/jenny-video/1.mp4"
                preload="auto"
                playsInline
                muted
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: '50% 15%',
                  opacity: activeVideo === 1 ? 1 : 0,
                  zIndex: activeVideo === 1 ? 2 : 1,
                  transform: isSpeaking ? 'scale(1.1)' : 'scale(1)',
                }}
              />
              <video
                ref={video2Ref}
                src="/jenny-video/2.mp4"
                preload="auto"
                playsInline
                muted
                onEnded={handleVideo2Ended}
style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: '50% 15%',
                  opacity: activeVideo === 2 ? 1 : 0,
                  zIndex: activeVideo === 2 ? 2 : 1,
                  transform: isSpeaking ? 'scale(1.1)' : 'scale(1)',
                }}
              />
              
              {!videosReady && (
                <img
                  alt="Jenny AI"
                  src="/jenny-image/avatar.jpg"
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: '50% 15%',
                    position: 'absolute', top: 0, left: 0, zIndex: 0
                  }}
                />
              )}
            </div>
            
            {/* Neuron Signals - Only during Video 1 playback */}
            {isVideo1Playing && (
              <>
                <span className="neuron-signal neuron-char-1">A</span>
                <span className="neuron-signal neuron-char-2">β</span>
                <span className="neuron-signal neuron-char-3">Ω</span>
                <span className="neuron-signal neuron-char-4">π</span>
                <span className="neuron-signal neuron-char-5">θ</span>
                <span className="neuron-signal neuron-char-6">λ</span>
                <span className="neuron-signal neuron-char-7">∫</span>
                <span className="neuron-signal neuron-char-8">Σ</span>
                <div className="neuron-line line-1" />
                <div className="neuron-line line-2" />
                <div className="neuron-line line-3" />
                <div className="neuron-line line-4" />
              </>
            )}
            
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
