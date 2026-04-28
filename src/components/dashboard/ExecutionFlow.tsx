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
      background: '#07080f', flexShrink: 0, 
      position: 'relative',
      zIndex: 10,
    }}>

      {/* Header */}
      <div style={{
        padding: '0 20px', height: 64, minHeight: 64,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, position: 'relative',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <h3 style={{ color: 'white', fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', margin: 0 }}>
              EXECUTION FLOW
            </h3>
            <i className={`fa-solid fa-chevron-${dropdownOpen ? 'up' : 'down'}`} style={{ fontSize: 10, color: '#64748b' }} />
          </div>

          {/* Mode badge */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 700,
            color: isExecutionMode ? CYAN : '#64748b',
            border: `1px solid ${isExecutionMode ? 'rgba(0,242,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
            background: isExecutionMode ? 'rgba(0,242,255,0.1)' : 'transparent',
            padding: '4px 10px', borderRadius: 9999,
            transition: 'all 0.3s',
            letterSpacing: '0.04em',
          }}>
            {isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: CYAN, animation: 'pulse 1.5s infinite', boxShadow: `0 0 8px ${CYAN}` }} />}
            {isExecutionMode ? (isLive ? 'LIVE' : 'READY') : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Mode gate — show message when not in execution */}
      {!isExecutionMode ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <i className="fa-solid fa-bolt-lightning" style={{ fontSize: 24, color: '#1e293b' }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.6, fontWeight: 500 }}>
            Execution tracking activates<br />during <span style={{ color: CYAN }}>Action Phase</span>
          </div>
          <div style={{
            fontSize: 10, color: '#475569',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
            padding: '5px 12px',
            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
            background: 'rgba(0,0,0,0.2)',
          }}>
            Status: {currentMode}
          </div>
        </div>
      ) : (
        <>
          {/* Step Timeline */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', minHeight: 0 }}>
            {!activeRecord ? (
              <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 40, fontWeight: 500 }}>
                Awaiting sequence…
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 4 }}>
                <div style={{ position: 'absolute', left: 19, top: 32, bottom: 10, width: 2, background: 'rgba(255,255,255,0.05)' }} />

                {STEPS.map(step => {
                  const active   = activeStep === step.id;
                  const complete = activeStep > step.id;
                  const inactive = !active && !complete;

                  return (
                    <div key={step.id} style={{
                      display: 'flex', gap: 12, marginBottom: 16,
                      opacity: inactive ? 0.35 : 1, transition: 'all 0.4s ease',
                      transform: active ? 'translateX(4px)' : 'none',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${active ? CYAN : complete ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        background: active ? 'rgba(0,242,255,0.12)' : complete ? 'rgba(34,197,94,0.05)' : '#0d0e15',
                        color: active ? CYAN : complete ? '#22c55e' : '#64748b',
                        boxShadow: active ? `0 0 15px rgba(0,242,255,0.3)` : 'none',
                        fontSize: 12, zIndex: 1, position: 'relative', transition: 'all 0.3s',
                      }}>
                        {complete
                          ? <i className="fa-solid fa-check" style={{ fontSize: 11, fontWeight: 900 }} />
                          : <i className={step.icon} style={{ fontSize: 12 }} />
                        }
                      </div>

                      <div style={{ flex: 1, paddingTop: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h4 style={{ color: active ? 'white' : complete ? '#94a3b8' : '#64748b', fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: '0.01em' }}>
                            {step.label}
                          </h4>
                        </div>
                        <p style={{ fontSize: 11, color: active ? '#94a3b8' : '#475569', margin: '4px 0 0', fontWeight: 500, lineHeight: 1.4 }}>
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
              height: 140, borderTop: '1px solid rgba(255,255,255,0.07)',
              background: '#050508', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ fontSize: 10, color: '#64748b', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 800, letterSpacing: '0.1em' }}>
                LIVE SEQUENCE LOGS
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeRecord.logs.map((log, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', lineHeight: 1.5 }}>
                    <span style={{ color: CYAN, opacity: 0.7 }}>❯</span> {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Current Tools Panel */}
      <div style={{
        padding: '20px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.01)',
      }}>
        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 16, textTransform: 'uppercase' }}>
          Current Tools {(currentMode === 'planning' || currentMode === 'execution') ? '(Active)' : ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { name: 'agent_manager', status: 'Executed', color: '#22c55e' },
            { name: 'file_inspector', status: 'Running', color: CYAN }
          ].map(tool => (
            <div key={tool.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 600 }}>{tool.name}</span>
              <span style={{ fontSize: 10, color: tool.color, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: tool.color, boxShadow: `0 0 6px ${tool.color}` }} />
                {tool.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Skills Active Panel */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(0,0,0,0.2)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 12, textTransform: 'uppercase' }}>
          Skills Active (9)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: 'fa-brands fa-instagram', color: '#E1306C', name: 'Instagram' },
            { icon: 'fa-brands fa-twitter', color: '#ffffff', name: 'Twitter' },
            { icon: 'fa-brands fa-discord', color: '#5865F2', name: 'Discord' },
            { icon: 'fa-solid fa-brain', color: CYAN, name: 'AI Core' },
            { icon: 'fa-solid fa-code', color: '#b026ff', name: 'Code' },
          ].map(skill => (
            <div key={skill.name} style={{
              width: 38, height: 38, borderRadius: 10,
              background: `${skill.color}15`,
              border: `1px solid ${skill.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 10px ${skill.color}15`,
              transition: 'all 0.3s ease',
              cursor: 'help',
            }} title={skill.name}>
              <i className={skill.icon} style={{ fontSize: 16, color: skill.color, filter: `drop-shadow(0 0 5px ${skill.color}50)` }} />
            </div>
          ))}
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: '#64748b', fontWeight: 700,
          }}>
            +4
          </div>
        </div>
      </div>
    </aside>
  );
}
