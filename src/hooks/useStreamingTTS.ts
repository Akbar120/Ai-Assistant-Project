import { useRef, useCallback } from 'react';

/**
 * Pro-Level Zero-Gap Streaming TTS Hook
 * 
 * Key fixes vs previous version:
 * - isPlaying uses a REF (not state) to avoid stale closure bugs that
 *   caused the queue to silently abort after the first play.
 * - processQueue is called correctly without stale closure dependency.
 * - Overlap logic simplified to be reliable (no NaN duration issues).
 */
export function useStreamingTTS() {
  const ttsQueue = useRef<string[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentSessionId = useRef(0);
  const isPlayingRef = useRef(false); // ← Ref, not state (avoids stale closures)

  // Signal Electron/Python that TTS state changed
  const signalTTSState = (playing: boolean) => {
    try {
      const ipc = typeof window !== 'undefined' && (window as any).require
        ? (window as any).require('electron').ipcRenderer
        : null;
      ipc?.send('tts-state', { playing });
    } catch {}
  };

  const stopAllTTS = useCallback(() => {
    currentSessionId.current += 1;

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }

    if (nextAudioRef.current) {
      nextAudioRef.current.pause();
      nextAudioRef.current = null;
    }

    ttsQueue.current = [];
    isPlayingRef.current = false;
    signalTTSState(false); // Tell Python: mic is free
    console.log(`[TTS] Interrupted. Session: ${currentSessionId.current}`);
  }, []);

  const generateAudio = async (text: string, sessionId: number): Promise<HTMLAudioElement | null> => {
    if (sessionId !== currentSessionId.current) return null;

    return new Promise((resolve) => {
      const safeText = (text || '').trim();
      if (!safeText) return resolve(null);

      const audio = new Audio(`/api/tts?text=${encodeURIComponent(safeText)}`);
      audio.preload = 'auto';

      let settled = false;
      const settle = (result: HTMLAudioElement | null) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      audio.addEventListener('canplaythrough', () => settle(audio), { once: true });
      audio.addEventListener('error', () => settle(null), { once: true });
      // 6s timeout (edge-tts can be slow on first call)
      setTimeout(() => settle(null), 6000);
    });
  };

  // Internal queue processor — no hook dependencies, always sees current ref values
  const processQueue = useCallback(async (sessionId: number) => {
    // Guard: if already playing for THIS session, don't start another loop
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    while (ttsQueue.current.length > 0) {
      if (sessionId !== currentSessionId.current) break;

      const currentText = ttsQueue.current.shift();
      if (!currentText?.trim()) continue;

      // Use prefetched audio if available
      let audio = nextAudioRef.current;
      nextAudioRef.current = null;

      if (!audio) {
        audio = await generateAudio(currentText, sessionId);
      }

      if (!audio || sessionId !== currentSessionId.current) continue;

      currentAudioRef.current = audio;

      // Prefetch next chunk in background while current plays
      const nextText = ttsQueue.current[0];
      const prefetchPromise = nextText
        ? generateAudio(nextText, sessionId)
        : Promise.resolve(null);

      // Play current chunk — signal Python that speakers are active
      await new Promise<void>((resolve) => {
        const finish = () => resolve();
        audio!.onended = finish;
        audio!.onerror = finish;
        signalTTSState(true); // Tell Python: I'm speaking, block your mic
        audio!.play().catch(finish);
      });

      // Capture prefetched result for next iteration
      if (sessionId === currentSessionId.current) {
        nextAudioRef.current = await prefetchPromise;
      }
    }

    isPlayingRef.current = false;
    signalTTSState(false); // Tell Python: queue drained, mic is free
  }, []); // No deps — safe because we only access refs

  const enqueue = useCallback((text: string, priority = false) => {
    if (!text || typeof text !== 'string') return;

    if (priority) {
      stopAllTTS();
    }

    const sentences = text
      .split(/[.!?।\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 2);

    if (sentences.length === 0) return;

    ttsQueue.current.push(...sentences);
    console.log(`[TTS] Enqueued ${sentences.length} sentence(s). Queue: ${ttsQueue.current.length}`);
    signalTTSState(true); // Tell Python immediately: block mic, audio is coming

    // Only kick off if not already running
    if (!isPlayingRef.current) {
      processQueue(currentSessionId.current);
    }
  }, [stopAllTTS, processQueue]);

  return { enqueue, stopAllTTS, isPlaying: isPlayingRef.current };
}
