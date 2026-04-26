'use client';

import { useChatStore } from '@/components/chat/ChatProvider';
import { useEffect, useState, useRef } from 'react';

type JennyMode = 'conversation' | 'planning' | 'analyze' | 'confirmation' | 'execution';

type Step = { id: number; icon: string; label: string; sub: string };

const STEPS: Step[] = [
  { id: 1, icon: 'fa-solid fa-arrow-down-to-bracket', label: 'Input Received',   sub: 'User query processing'           },
  { id: 2, icon: 'fa-solid fa-cube',                  label: 'Context Parsing',  sub: 'Extracting entities & intent'    },
  { id: 3, icon: 'fa-solid fa-screwdriver-wrench',    label: 'Tool Selection',   sub: 'Evaluating available skills'     },
  { id: 4, icon: 'fa-solid fa-bolt',                  label: 'Action Execution', sub: 'Executing tool or fetch'         },
  { id: 5, icon: 'fa-solid fa-chart-pie',             label: 'Analysis',         sub: 'Generating response'             },
];

type ExecRecord = {
  id: string;
  timestamp: number;
  label: string;
  status: 'live' | 'completed' | 'failed';
  activeStep: number;
  logs: string[];
};

const CYAN = '#00f3ff';

export default function ExecutionFlow({ activeMode }: { activeMode?: JennyMode }) {
  const { messages, loading, processingTaskLabel } = useChatStore();

  // Current mode from server
  const [polledMode, setPolledMode] = useState<JennyMode>('conversation');
  const [history, setHistory]           = useState<ExecRecord[]>([]);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const activeId = useRef<string | null>(null);

  // Poll Jenny's mode
  useEffect(() => {
    let lastPollTime = 0;
    const poll = async () => {
      if (Date.now() - lastPollTime < 1000) return;
      lastPollTime = Date.now();

      try {
        const res = await fetch('/api/chat/mode', { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          if (d.mode) setPolledMode(d.mode as JennyMode);
        }
      } catch { /* silent */ }
    };
    
    poll();
    const iv = setInterval(() => {
      if (!document.hidden) poll();
    }, 1200);

    const handleVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const currentMode: JennyMode = activeMode ?? polledMode;
  const isExecutionMode = currentMode === 'execution';

  // Create a new execution record ONLY when we enter execution mode + loading
  useEffect(() => {
    if (isExecutionMode && loading) {
      const latestUser = messages.slice().reverse().find(m => m.role === 'user');
      const label = latestUser ? latestUser.content.slice(0, 35) + '…' : 'System Task';

      if (!activeId.current) {
        const newId = Date.now().toString();
        activeId.current = newId;
        setHistory(prev => [{
          id: newId, timestamp: Date.now(), label,
          status: 'live', activeStep: 1,
          logs: ['[System] Execution started — approved plan received.'],
        }, ...prev]);
        setSelectedId(newId);
      }
    }

    if (!loading && activeId.current) {
      setHistory(prev => prev.map(ex =>
        ex.id === activeId.current
          ? { ...ex, status: 'completed', activeStep: 6, logs: [...ex.logs, '[System] ✅ Execution completed successfully.'] }
          : ex
      ));
      activeId.current = null;
    }
  }, [isExecutionMode, loading, messages]);

  // Advance steps during live execution
  useEffect(() => {
    if (!activeId.current || !loading || !isExecutionMode) return;
    const iv = setInterval(() => {
      setHistory(prev => prev.map(ex => {
        if (ex.id !== activeId.current) return ex;
        if (ex.activeStep >= 5) return ex;
        const next = ex.activeStep + 1;
        const logs = [...ex.logs];
        if (next === 2) logs.push('[Engine] Parsing context and extracting intent…');
        if (next === 3) logs.push('[Engine] Selecting tools from registry…');
        if (next === 4) logs.push(`[Worker] Executing… ${processingTaskLabel || 'background task'}`);
        if (next === 5) logs.push('[Engine] Generating completion response…');
        return { ...ex, activeStep: next, logs };
      }));
    }, 1400);
    return () => clearInterval(iv);
  }, [loading, isExecutionMode, processingTaskLabel]);

  // Reset steps when leaving execution mode
  useEffect(() => {
    if (!isExecutionMode && activeId.current) {
      setHistory(prev => prev.map(ex =>
        ex.id === activeId.current
          ? { ...ex, status: 'failed', logs: [...ex.logs, '[System] Execution interrupted — mode changed.'] }
          : ex
      ));
      activeId.current = null;
    }
  }, [isExecutionMode]);

  const activeRecord = history.find(ex => ex.id === selectedId) || history[0];
  const isLive       = activeRecord?.status === 'live';
  const activeStep   = activeRecord?.activeStep || 0;

  return (
    <aside style={{
      width: 300, minWidth: 300, height: '100%',
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      background: '#0a0b10', flexShrink: 0, zIndex: 10,
    }}>

      {/* Header */}
      <div style={{
        padding: '0 20px', height: 60, minHeight: 60,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <h3 style={{ color: 'white', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', margin: 0 }}>
              EXECUTION FLOW
            </h3>
            <i className={`fa-solid fa-chevron-${dropdownOpen ? 'up' : 'down'}`} style={{ fontSize: 9, color: '#6b7280' }} />
          </div>

          {/* Mode badge */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, fontWeight: 600,
            color: isExecutionMode ? CYAN : '#6b7280',
            border: `1px solid ${isExecutionMode ? 'rgba(0,243,255,0.3)' : '#374151'}`,
            background: isExecutionMode ? 'rgba(0,243,255,0.08)' : 'transparent',
            padding: '3px 8px', borderRadius: 9999,
            transition: 'all 0.3s',
          }}>
            {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: CYAN, animation: 'pulse 1.5s infinite' }} />}
            {isExecutionMode ? (isLive ? 'LIVE' : 'READY') : 'INACTIVE'}
          </span>
        </div>

        {/* History dropdown */}
        {dropdownOpen && (
          <div style={{
            position: 'absolute', top: 55, left: 10, right: 10,
            background: '#1a1b26', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: 8, zIndex: 50,
            maxHeight: 200, overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}>
            {history.length === 0 ? (
              <div style={{ fontSize: 11, color: '#6b7280', padding: 8, textAlign: 'center' }}>No executions yet</div>
            ) : history.map(ex => (
              <div
                key={ex.id}
                onClick={() => { setSelectedId(ex.id); setDropdownOpen(false); }}
                style={{
                  padding: '8px 12px', fontSize: 11,
                  color: ex.id === selectedId ? CYAN : 'white',
                  background: ex.id === selectedId ? 'rgba(0,243,255,0.1)' : 'transparent',
                  borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                  display: 'flex', justifyContent: 'space-between',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ex.label}</span>
                <span style={{ color: ex.status === 'live' ? CYAN : '#6b7280', fontSize: 9 }}>{ex.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mode gate — show message when not in execution */}
      {!isExecutionMode ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
        }}>
          <div style={{ fontSize: 28, opacity: 0.2 }}>⚡</div>
          <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 1.6 }}>
            Execution flow activates<br />only in <span style={{ color: CYAN }}>Execution mode</span>
          </div>
          <div style={{
            fontSize: 10, color: '#374151',
            border: '1px solid #1f2937', borderRadius: 6,
            padding: '4px 10px',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Current: {currentMode}
          </div>
        </div>
      ) : (
        <>
          {/* Step Timeline */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 12px', minHeight: 0 }}>
            {!activeRecord ? (
              <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', marginTop: 40 }}>
                Waiting for execution…
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 8 }}>
                <div style={{ position: 'absolute', left: 23, top: 32, bottom: 10, width: 1, background: 'rgba(255,255,255,0.07)' }} />

                {STEPS.map(step => {
                  const active   = activeStep === step.id;
                  const complete = activeStep > step.id;
                  const inactive = !active && !complete;

                  return (
                    <div key={step.id} style={{
                      display: 'flex', gap: 12, marginBottom: 20,
                      opacity: inactive ? 0.28 : 1, transition: 'opacity 0.3s',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${active ? CYAN : complete ? 'rgba(0,243,255,0.4)' : '#374151'}`,
                        background: active ? 'rgba(0,243,255,0.10)' : '#0d0e15',
                        color: active || complete ? CYAN : '#6b7280',
                        boxShadow: active ? `0 0 12px rgba(0,243,255,0.4)` : 'none',
                        fontSize: 12, zIndex: 1, position: 'relative', transition: 'all 0.3s',
                      }}>
                        {complete
                          ? <i className="fa-solid fa-check" style={{ fontSize: 10, color: '#22c55e' }} />
                          : <i className={step.icon} style={{ fontSize: 11 }} />
                        }
                      </div>

                      <div style={{ flex: 1, paddingTop: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h4 style={{ color: active || complete ? 'white' : '#9ca3af', fontSize: 13, fontWeight: 500, margin: 0 }}>
                            {step.label}
                          </h4>
                          {active && (
                            <span style={{ fontSize: 9, color: CYAN, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 9 }} /> Active
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 10, color: '#6b7280', margin: '3px 0 0' }}>
                          {active && processingTaskLabel ? processingTaskLabel : step.sub}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Execution Logs */}
          {activeRecord && (
            <div style={{
              height: 150, borderTop: '1px solid rgba(255,255,255,0.07)',
              background: '#050505', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ fontSize: 9, color: '#6b7280', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 600, letterSpacing: 1 }}>
                EXECUTION LOGS
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {activeRecord.logs.map((log, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', lineHeight: 1.4 }}>
                    <span style={{ color: '#4ade80' }}>&gt;</span> {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
