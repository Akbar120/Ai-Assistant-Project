'use client';
import { useEffect, useState, useRef } from 'react';

type AppStatus = 'LOADING' | 'PASSIVE' | 'ACTIVE' | 'THINKING' | 'ERROR' | 'DISCONNECTED';

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};

export default function VoiceWidgetPage() {
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [status, setStatus] = useState<AppStatus>('DISCONNECTED');
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing'>('idle');
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusWatchdog = useRef<NodeJS.Timeout | null>(null);

  const getIpc = () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      return (window as any).require('electron').ipcRenderer;
    }
    return null;
  };

  const showSelf = () => getIpc()?.send('show-voice-widget');
  const hideWidget = () => getIpc()?.send('hide-voice-widget');
  const pushToMainChat = (userText: string, aiText: string) =>
    getIpc()?.send('voice-to-chat', { userText, aiText });

  const setPythonConversationMode = (val: boolean) => {
     if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'set_conversation', value: val }));
     }
  };

  const manualSleep = () => {
     if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'sleep' }));
     }
     setStatus('PASSIVE');
     setLastReply('');
     setLastTranscript('');
  };

  // Watchdog to prevent 'stuck' state
  useEffect(() => {
    if (statusWatchdog.current) clearTimeout(statusWatchdog.current);
    if (status === 'THINKING' || ttsStatus === 'playing') {
        statusWatchdog.current = setTimeout(() => {
            console.log('[Watchdog] Resetting stuck state');
            setTtsStatus('idle');
            setStatus('PASSIVE');
        }, 30000); // 30s max for any single reply
    }
    return () => { if (statusWatchdog.current) clearTimeout(statusWatchdog.current); };
  }, [status, ttsStatus]);

  const sendToTTS = (text: string) => {
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*_#`>~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    if (cleaned && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'speak', text: cleaned }));
    }
  };

  const handleStreamingResponse = async (text: string) => {
    setLastTranscript(text);
    setLastReply('');
    setStatus('THINKING');

    try {
      const apiBase = getApiBase();
      const fd = new FormData();
      fd.append('message', text);
      fd.append('history', '[]'); 

      const res = await fetch(`${apiBase}/api/chat`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const fullReply = data.reply || '';
      
      const sanitizedVisual = fullReply.includes('```json') 
        ? fullReply.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '[Task Generated]')
        : fullReply;

      setLastReply(sanitizedVisual);
      
      if (fullReply) {
        sendToTTS(fullReply);
      }
      
      pushToMainChat(text, fullReply);

    } catch (e: any) {
      console.error('[VoiceWidget] Error:', e);
      const errMsg = 'Connection failed.';
      setLastReply(errMsg);
      sendToTTS(errMsg);
    } finally {
      setStatus('PASSIVE');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const connect = () => {
      if (!mountedRef.current) return;
      const ws = new WebSocket('ws://127.0.0.1:8010');
      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        console.log('[VoiceWidget] Connected');
        // Sync conversation mode on connect
        ws.send(JSON.stringify({ type: 'set_conversation', value: isConversationMode }));
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'status') {
            const newState = data.state as AppStatus;
            setStatus(newState);
            if (newState === 'ACTIVE') showSelf();
          } else if (data.type === 'transcript') {
            handleStreamingResponse(data.text);
          } else if (data.type === 'tts_status') {
             setTtsStatus(data.status);
          } else if (data.type === 'mic_volume') {
             setMicLevel(data.rms);
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus('DISCONNECTED');
        reconnectRef.current = setTimeout(connect, 3000);
      };
      wsRef.current = ws;
    };
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (status === 'PASSIVE' && ttsStatus === 'idle') {
      const timer = setTimeout(() => {
        if (!isConversationMode) hideWidget();
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [status, ttsStatus, isConversationMode]);

  // Auto-scroll chat area
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastReply]);

  const isListening = status === 'ACTIVE' && ttsStatus === 'idle' && !lastReply; // Initial listening
  const isThinking = status === 'THINKING';
  const isSpeaking = ttsStatus === 'playing' || (status === 'ACTIVE' && lastReply !== '');
  const isLive = isListening || isThinking || isSpeaking;

  const statusLabel = () => {
    if (status === 'DISCONNECTED') return 'Core offline';
    if (status === 'LOADING') return 'Loading intelligence...';
    if (isSpeaking)  return 'Jenny is replying';
    if (isThinking)  return 'Synthesizing response...';
    if (isListening) return 'Listening to you...';
    if (status === 'ERROR') return 'Audio Error';
    return 'Systems normal';
  };

  const accentColor = isSpeaking ? '#ec4899' : isThinking ? '#6366f1' : '#14b8a6';

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh', width: '100vw', padding: 24,
        WebkitAppRegion: 'drag',
        fontFamily: "'Inter', sans-serif",
      } as any}
    >
      <div style={{
        background: 'rgba(15, 15, 20, 0.85)',
        backdropFilter: 'blur(32px) saturate(180%)',
        borderRadius: 32,
        border: `1px solid ${isLive ? `${accentColor}50` : 'rgba(255,255,255,0.06)'}`,
        width: '100%',
        height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 20px',
        boxShadow: isLive
          ? `0 10px 60px ${accentColor}25, inset 0 0 40px ${accentColor}10`
          : '0 20px 40px rgba(0,0,0,0.6)',
        position: 'relative',
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}>
        
        {/* Sleek top drag bar indicator */}
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 20 }} />

        {/* Close Button */}
        <button
          onClick={(e) => { e.stopPropagation(); hideWidget(); }}
          style={{
            position: 'absolute', top: 20, right: 20,
            background: 'rgba(255,255,255,0.05)', border: 'none',
            color: 'rgba(255,255,255,0.4)', borderRadius: '50%',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16,
            WebkitAppRegion: 'no-drag',
            transition: 'background 0.2s',
          } as any}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >×</button>

        {/* AI Orb - Click to Sleep/Reset */}
        <div 
          onClick={manualSleep}
          style={{ 
            position: 'relative', width: 90, height: 90, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            marginBottom: 10, cursor: 'pointer', WebkitAppRegion: 'no-drag' 
          } as any}
          title="Click to put Jenny to sleep"
        >
            {/* Outer Aura Ring */}
            <div style={{
                position: 'absolute',
                inset: -10,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${accentColor}, transparent)`,
                opacity: isLive ? 0.4 : 0,
                filter: 'blur(15px)',
                animation: isLive ? 'spin 4s linear infinite' : 'none',
                transition: 'opacity 0.5s ease',
            }} />
            
            {/* Core Orb */}
            <div style={{
                width: 76, height: 76, borderRadius: '50%',
                background: `linear-gradient(135deg, #111, #222)`,
                boxShadow: `inset 0 0 20px ${accentColor}80, 0 4px 20px rgba(0,0,0,0.8)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                zIndex: 2,
                border: `1px solid ${accentColor}40`,
                transition: 'all 0.4s ease',
                transform: isSpeaking ? 'scale(1.05)' : 'scale(1)'
            }}>
                <span style={{ fontSize: 32, filter: isLive ? `drop-shadow(0 0 10px ${accentColor})` : 'none', transition: 'all 0.3s' }}>
                   {isSpeaking ? '🔮' : isThinking ? '⚡' : isListening ? '🎙️' : '✨'}
                </span>
            </div>

            {/* Speaking Ripple Rings */}
            {isSpeaking && (
                <>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${accentColor}`, animation: 'ripple 1.5s linear infinite' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${accentColor}`, animation: 'ripple 1.5s linear infinite 0.75s' }} />
                </>
            )}
        </div>

        {/* Minimalist Status Text */}
        <h3 style={{ 
            fontSize: 14, fontWeight: 500, margin: '0 0 20px', 
            letterSpacing: 0.5, color: 'rgba(255,255,255,0.9)',
            textTransform: 'uppercase'
        }}>
          {statusLabel()}
        </h3>

        {/* Conversation Stream Area */}
        <div 
          ref={scrollRef}
          style={{ 
            width: '100%', flex: 1, overflowY: 'auto', 
            display: 'flex', flexDirection: 'column', gap: 14,
            paddingRight: 4, paddingBottom: 10,
            WebkitMaskImage: 'linear-gradient(to top, black 80%, transparent 100%)' // Gradual fade at top
        }}>
          {lastTranscript && (
            <div style={{ alignSelf: 'flex-end', maxWidth: '90%' }}>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textAlign: 'right', fontWeight: 600 }}>YOU SAID</p>
                <div style={{
                    background: 'rgba(255,255,255,0.08)', borderRadius: '16px 16px 4px 16px',
                    padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.9)',
                    lineHeight: 1.4, backdropFilter: 'blur(10px)'
                }}>
                {lastTranscript}
                </div>
            </div>
          )}

          {lastReply && (
            <div style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
               <p style={{ fontSize: 9, color: `${accentColor}99`, marginBottom: 4, fontWeight: 600 }}>JENNY</p>
               <div style={{
                    background: `linear-gradient(135deg, ${accentColor}15, transparent)`, 
                    borderRadius: '16px 16px 16px 4px',
                    borderLeft: `2px solid ${accentColor}`,
                    padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.95)',
                    lineHeight: 1.5
                }}>
                {/* Simulated streaming typing cursor */}
                {lastReply}
                {isThinking && <span style={{display: 'inline-block', width: 4, height: 12, background: accentColor, marginLeft: 4, animation: 'blink 1s infinite'}} />}
               </div>
            </div>
          )}

          {!lastTranscript && !lastReply && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 }}>
                {status === 'DISCONNECTED' || status === 'LOADING'
                    ? 'Engine is offline...'
                    : 'Awaiting your command...'}
                </p>
            </div>
          )}
        </div>

        {/* Bottom Audio Wave Bar */}
        {isLive && (
            <div style={{ 
                height: 12, width: '100%', display: 'flex', gap: 2, 
                alignItems: 'center', justifyContent: 'center', marginTop: 'auto' 
            }}>
            {[...Array(12)].map((_, i) => {
                // Determine height: idle animation vs. active mic input
                const isIdleAnim = micLevel < 0.005;
                const baseHeight = isIdleAnim ? (2 + (i % 3)) : Math.max(2, Math.min(12, micLevel * 200 + Math.random() * 4));
                
                return (
                  <div key={i} style={{
                  width: 4, borderRadius: 2,
                  background: accentColor,
                  opacity: 0.8,
                  animationName: isIdleAnim ? 'waveform-bounce' : 'none',
                  animationDuration: isIdleAnim ? `0.${5+i%4}s` : '0s',
                  animationTimingFunction: 'ease-in-out',
                  animationIterationCount: 'infinite',
                  animationDirection: 'alternate',
                  animationDelay: isIdleAnim ? `${i * 0.05}s` : '0s',
                  height: `${baseHeight}px`,
                  transition: 'height 0.1s ease-out',
                  }} />
                );
            })}
            </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes ripple { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(1.6); opacity: 0; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes waveform-bounce { 0% { height: 2px; } 100% { height: 12px; } }
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}
