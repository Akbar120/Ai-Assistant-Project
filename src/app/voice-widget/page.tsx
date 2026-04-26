'use client';
import { useEffect, useState, useRef, useCallback } from 'react';

type AppStatus = 'LOADING' | 'PASSIVE' | 'ACTIVE' | 'THINKING' | 'ERROR' | 'DISCONNECTED';

const getApiBase = () =>
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

export default function VoiceWidgetPage() {
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [status, setStatus] = useState<AppStatus>('DISCONNECTED');
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing'>('idle');
  const [micLevel, setMicLevel] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<string>('');
  const lastSentTimeRef = useRef<number>(0);
  const livePreviewRef = useRef<string>(''); // For showing partial text in UI

  // ── Send text to Python TTS via WebSocket ───────────────────────────────
  // Strips all markdown and unicode surrogates before sending to Python.
  const cleanForTTS = useCallback((text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*_#`>~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[\uD800-\uDFFF]/g, '')  // strip surrogate pairs (emojis)
      .replace(/[\u2600-\u27BF\u2300-\u23FF]/g, '') // strip symbol emojis
      .trim();
  }, []);

  const sendTTS = useCallback((text: string) => {
    const cleaned = cleanForTTS(text);
    if (cleaned.length > 2 && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'speak', text: cleaned }));
    }
  }, [cleanForTTS]);

  // ── Send ALL sentences to Python at once so it can pre-download in parallel
  // Python's download_worker + play_worker handle internal queuing — no round-
  // trip ACK needed. This eliminates the inter-sentence gap.
  const queueSentences = useCallback((sentences: string[]) => {
    if (!sentences.length) return;
    sentences.forEach(s => sendTTS(s));
  }, [sendTTS]);

  const getIpc = () =>
    typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;

  const showSelf  = () => getIpc()?.send('show-voice-widget');
  const hideWidget = () => getIpc()?.send('hide-voice-widget');
  const pushToMainChat = (userText: string, aiText: string) =>
    getIpc()?.send('voice-to-chat', { userText, aiText });

  const manualInterrupt = () => {
    // Stop the Python TTS queue immediately
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    // Stop Front-end TTS via Electron IPC
    getIpc()?.send('stop-tts');
    setStatus('ACTIVE');
    setTtsStatus('idle');
    console.log('[VoiceWidget] Manual interrupt triggered');
  };

  const manualSleep = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'sleep' }));
    }
    setStatus('PASSIVE');
    setLastReply('');
    setLastTranscript('');
  };

  // ── Main UI Bridge — sends transcript to main window ────────────────────
  const handleTranscript = useCallback(async (text: string, isFinal: boolean) => {
    if (!isFinal) {
      // Partial: just update the live preview display, don't process yet
      livePreviewRef.current = text;
      setLastTranscript(text);
      return;
    }
    
    // Final: deduplicate and submit
    const now = Date.now();
    const normalized = text.toLowerCase().replace(/[.,!?;]$/, '').trim();
    if (normalized === lastSentRef.current && (now - lastSentTimeRef.current) < 5000) {
      console.log('[VoiceWidget] Duplicate final transcript ignored:', text);
      return;
    }
    lastSentRef.current = normalized;
    lastSentTimeRef.current = now;

    // Fix for Whisper "stuttering" (e.g. "nahin aise hi. nahin aise hi.")
    let cleanText = text.trim();
    const sentences = cleanText.split(/[.!?]\s+/).filter(Boolean);
    if (sentences.length === 2) {
      const s1 = sentences[0].toLowerCase().replace(/[^\w\s]/g, '').trim();
      const s2 = sentences[1].toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (s1 === s2 && s1.length > 5) {
        console.log('[VoiceWidget] Deduplicated stuttering transcript:', cleanText);
        cleanText = sentences[0] + (text.match(/[.!?]$/) ? text.slice(-1) : '.');
      }
    }

    setLastTranscript(cleanText);
    livePreviewRef.current = '';
    
    // 1. Enter thinking state locally for UX feedback
    setLastReply('...');
    setStatus('THINKING');
    
    // 2. Push to main chat for processing
    console.log('[VoiceWidget] FINAL transcript submitted to chat:', cleanText);
    pushToMainChat(cleanText, '');
  }, []);

  // ── Sync with Main Chat — receives results back via IPC ──────────────────
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;

    const replyHandler = (_: any, { aiText, status: newStatus }: { aiText: string; status?: AppStatus }) => {
      console.log("[IPC] Received reply from main chat:", aiText);
      setLastReply(aiText);
      if (newStatus) setStatus(newStatus);
      else setStatus('PASSIVE');
    };

    ipc.on('chat-reply', replyHandler);
    return () => ipc.removeListener('chat-reply', replyHandler);
  }, []);


  // ── WebSocket connection ─────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const ws = new WebSocket('ws://127.0.0.1:8010');

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        console.log('[VoiceWidget] Connected to voice engine');
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);

          if (data.type === 'status') {
            const newState = data.state as AppStatus;
            setStatus(newState);
            if (newState === 'ACTIVE') {
              showSelf();
              // 🔥 BARGE-IN: User is now talking, stop Jenny's audio
              getIpc()?.send('stop-tts');
            }

          } else if (data.type === 'transcript_partial') {
            // Live preview ONLY — do NOT submit to chat yet
            handleTranscript(data.text, false);

          } else if (data.type === 'transcript_final') {
            // Full sentence received — NOW submit and stop TTS
            handleTranscript(data.text, true);
            getIpc()?.send('stop-tts');

          } else if (data.type === 'transcript') {
            // Legacy fallback (e.g., wake word on first activation)
            handleTranscript(data.text, true);
            getIpc()?.send('stop-tts');

          } else if (data.type === 'tts_status') {
            setTtsStatus(data.status);

          } else if (data.type === 'mic_volume') {
            setMicLevel(data.rms);
          }
        } catch {}
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
  }, [handleTranscript]);

  // ── Auto-hide after conversation ───────────────────────────────────────
  useEffect(() => {
    // Immediately hide on disconnect or long-term passive
    if (status === 'DISCONNECTED') {
      hideWidget();
      return;
    }
    // After a voice exchange finishes, hide after 5s of PASSIVE+idle
    if (status === 'PASSIVE' && ttsStatus === 'idle') {
      const timer = setTimeout(() => hideWidget(), 5000);
      return () => clearTimeout(timer);
    }
  }, [status, ttsStatus]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lastReply]);

  const isListening = status === 'ACTIVE' && ttsStatus === 'idle' && !lastReply;
  const isThinking  = status === 'THINKING';
  const isSpeaking  = ttsStatus === 'playing';
  const isLive      = isListening || isThinking || isSpeaking;

  const accentColor = isSpeaking ? '#ec4899' : isThinking ? '#6366f1' : '#14b8a6';

  const statusLabel = () => {
    if (status === 'DISCONNECTED') return 'Core offline';
    if (status === 'LOADING')      return 'Loading...';
    if (isSpeaking)                return 'Jenny is speaking';
    if (isThinking)                return 'Thinking...';
    if (isListening)               return 'Listening...';
    if (status === 'ERROR')        return 'Audio Error';
    return 'Ready';
  };

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
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 20px',
        boxShadow: isLive
          ? `0 10px 60px ${accentColor}25, inset 0 0 40px ${accentColor}10`
          : '0 20px 40px rgba(0,0,0,0.6)',
        position: 'relative',
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}>

        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 20 }} />

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); hideWidget(); }}
          style={{
            position: 'absolute', top: 20, right: 20,
            background: 'rgba(255,255,255,0.05)', border: 'none',
            color: 'rgba(255,255,255,0.4)', borderRadius: '50%',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, WebkitAppRegion: 'no-drag',
            transition: 'background 0.2s',
          } as any}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >×</button>

        {/* Orb */}
        <div
          onClick={manualSleep}
          style={{
            position: 'relative', width: 90, height: 90,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 10, cursor: 'pointer', WebkitAppRegion: 'no-drag',
          } as any}
          title="Click to put Jenny to sleep"
        >
          <div style={{
            position: 'absolute', inset: -10, borderRadius: '50%',
            background: `linear-gradient(135deg, ${accentColor}, transparent)`,
            opacity: isLive ? 0.4 : 0, filter: 'blur(15px)',
            animation: isLive ? 'spin 4s linear infinite' : 'none',
            transition: 'opacity 0.5s ease',
          }} />
          <div style={{
            width: 76, height: 76, borderRadius: '50%',
            background: 'linear-gradient(135deg, #111, #222)',
            boxShadow: `inset 0 0 20px ${accentColor}80, 0 4px 20px rgba(0,0,0,0.8)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 2,
            border: `1px solid ${accentColor}40`,
            transition: 'all 0.4s ease',
            transform: isSpeaking ? 'scale(1.05)' : 'scale(1)',
          }}>
            <span style={{ fontSize: 32, filter: isLive ? `drop-shadow(0 0 10px ${accentColor})` : 'none', transition: 'all 0.3s' }}>
              {isSpeaking ? '🔮' : isThinking ? '⚡' : isListening ? '🎙️' : '✨'}
            </span>
          </div>
          {isSpeaking && (
            <>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${accentColor}`, animation: 'ripple 1.5s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${accentColor}`, animation: 'ripple 1.5s linear infinite 0.75s' }} />
            </>
          )}
        </div>

        {/* Status + Stop Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' }}>
          <h3 style={{
            fontSize: 14, fontWeight: 500, margin: 0,
            letterSpacing: 0.5, color: 'rgba(255,255,255,0.9)',
            textTransform: 'uppercase',
          }}>
            {statusLabel()}
          </h3>

          {/* Stop / Interrupt Button — shows only while Jenny is speaking */}
          {isSpeaking && (
            <button
              onClick={manualInterrupt}
              style={{
                background: 'rgba(239,68,68,0.85)',
                border: '1px solid rgba(239,68,68,0.6)',
                borderRadius: 20,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 12px',
                cursor: 'pointer',
                letterSpacing: 0.5,
                animation: 'pulse 1.2s ease-in-out infinite',
                WebkitAppRegion: 'no-drag',
              } as any}
              title="Stop Jenny from speaking"
            >
              ⏹ STOP
            </button>
          )}
        </div>

        {/* Conversation stream */}
        <div
          ref={scrollRef}
          style={{
            width: '100%', flex: 1, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 14,
            paddingRight: 4, paddingBottom: 10,
            WebkitMaskImage: 'linear-gradient(to top, black 80%, transparent 100%)',
          }}
        >
          {lastTranscript && (
            <div style={{ alignSelf: 'flex-end', maxWidth: '90%' }}>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textAlign: 'right', fontWeight: 600 }}>YOU</p>
              <div style={{
                background: 'rgba(255,255,255,0.08)', borderRadius: '16px 16px 4px 16px',
                padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.9)',
                lineHeight: 1.4, backdropFilter: 'blur(10px)',
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
                lineHeight: 1.5,
              }}>
                {lastReply}
                {isThinking && (
                  <span style={{ display: 'inline-block', width: 4, height: 12, background: accentColor, marginLeft: 4, animation: 'blink 1s infinite' }} />
                )}
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

        {/* Audio visualizer */}
        {isLive && (
          <div style={{
            height: 12, width: '100%', display: 'flex', gap: 2,
            alignItems: 'center', justifyContent: 'center', marginTop: 'auto',
          }}>
            {[...Array(12)].map((_, i) => {
              const isIdle = micLevel < 0.005;
              const h = isIdle ? (2 + i % 3) : Math.max(2, Math.min(12, micLevel * 200 + Math.random() * 4));
              return (
                <div key={i} style={{
                  width: 4, borderRadius: 2,
                  background: accentColor, opacity: 0.8,
                  animationName: isIdle ? 'waveform-bounce' : 'none',
                  animationDuration: isIdle ? `0.${5 + i % 4}s` : '0s',
                  animationTimingFunction: 'ease-in-out',
                  animationIterationCount: 'infinite',
                  animationDirection: 'alternate',
                  animationDelay: isIdle ? `${i * 0.05}s` : '0s',
                  height: `${h}px`,
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
