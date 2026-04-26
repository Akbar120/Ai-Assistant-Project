'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Connects to the local Python Voice Engine via WebSocket.
 */
export function useVoiceEngine(onTranscript?: (text: string) => void) {
  const [status, setStatus] = useState<'DISCONNECTED' | 'PASSIVE' | 'ACTIVE'>('DISCONNECTED');
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing'>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      console.log('[VoiceEngine] Attempting WS connection...');
      const ws = new WebSocket('ws://127.0.0.1:8010');

      ws.onopen = () => {
        console.log('[VoiceEngine] Connected.');
        setStatus('PASSIVE');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'status') {
            setStatus(data.state);
            // If the voice engine woke up ("ACTIVE"), we tell Electron to show the widget
            if (data.state === 'ACTIVE' && typeof window !== 'undefined') {
              // @ts-ignore - Electron IPC
              if (window.require) {
                // @ts-ignore
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('show-voice-widget');
              }
            }
          } else if (data.type === 'transcript') {
            if (onTranscriptRef.current) {
              onTranscriptRef.current(data.text);
            }
          } else if (data.type === 'tts_status') {
            setTtsStatus(data.status);
          }
        } catch (e) {
          console.error('[VoiceEngine] Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[VoiceEngine] Disconnected. Reconnecting in 3s...');
        setStatus('DISCONNECTED');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'speak', text }));
    }
  }, []);

  /**
   * setListening: Toggle wake word detection on/off.
   * true  = resume passive listening (wake word detection active)
   * false = go fully deaf (sends 'sleep' command — no wake word detection)
   */
  const setListening = useCallback((enabled: boolean) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    if (enabled) {
      wsRef.current.send(JSON.stringify({ type: 'set_deaf', value: false }));
      console.log('[VoiceEngine] Wake word listening enabled (deaf mode OFF).');
    } else {
      wsRef.current.send(JSON.stringify({ type: 'set_deaf', value: true }));
      console.log('[VoiceEngine] Wake word listening disabled (deaf mode ON).');
    }
  }, []);

  return { status, ttsStatus, speak, setListening };
}
