'use client';
import { useEffect, useState } from 'react';

export default function AgentsDashboard() {
  const [data, setData] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAgents = () => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(setData)
      .catch(() => null);
  };

  useEffect(() => {
    fetchAgents();
    const inv = setInterval(fetchAgents, 2000);
    return () => clearInterval(inv);
  }, []);

  const killAgent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ action: 'killAgent', id })
    });
    fetchAgents();
  };

  const updateConfig = async (id: string | null, maxTokens?: number, useRotorQuant?: boolean, overallLimit?: number, isAutonomous?: boolean, pollingInterval?: number) => {
    const payload: any = { action: 'updateConfig' };
    if (id) payload.agentId = id;
    if (maxTokens !== undefined) payload.maxTokens = maxTokens;
    if (useRotorQuant !== undefined) payload.useRotorQuant = useRotorQuant;
    if (overallLimit !== undefined) payload.overallLimit = overallLimit;
    if (isAutonomous !== undefined) payload.isAutonomous = isAutonomous;
    if (pollingInterval !== undefined) payload.pollingInterval = pollingInterval;
    
    await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    fetchAgents();
  };

  if (!data) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Initializing Brain Interface...</div>;

  const agents = Object.values(data.agents || {}) as any[];
  // Sort latest first
  agents.reverse();

  return (
    <div style={{ maxWidth: 850, margin: '0 auto', paddingBottom: 60, padding: 20 }}>
      {/* HEADER */}
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, background: 'linear-gradient(90deg, #fff, #aaa)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          Agent Command Center
        </h1>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Manage your autonomous workers, memory allocations, and execution workflows.
        </div>
      </div>

      {/* OVERALL MEMORY CARD */}
      <div className="agent-card" style={{ marginBottom: 25, background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🧠</span> Global Memory Pool
          </h3>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {(data.overallKvLimit / 1000).toFixed(0)}k <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tokens</span>
          </div>
        </div>
        <input 
          type="range" min="8192" max="200000" step="1024"
          value={data.overallKvLimit} 
          onChange={e => updateConfig(null, undefined, undefined, parseInt(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }} 
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Max KV Cache allowed across all agents. Adjust based on hardware capacity.
        </div>
      </div>

      {/* AGENTS LIST */}
      <div>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Listed Workforces</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {agents.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', background: 'var(--bg-card)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 13 }}>
              No active agents listed. Orchestrator will provision new ones automatically.
            </div>
          )}
          
          {agents.map((agent: any) => {
            const isExpanded = expandedId === agent.id;
            const statusColor = agent.status === 'running' ? 'var(--info)' : 
                                agent.status === 'completed' ? 'var(--success)' : 
                                agent.status === 'error' ? 'var(--error)' : 'var(--text-muted)';
            
            return (
              <div 
                key={agent.id} 
                onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                style={{ 
                  background: 'var(--bg-card)', 
                  borderRadius: 12, 
                  border: `1px solid ${isExpanded ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isExpanded ? '0 8px 24px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                {/* Header Row (Always Visible) */}
                <div style={{ 
                  display: 'flex', alignItems: 'center', padding: '14px 18px', 
                  borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none' 
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{agent.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-base)', borderRadius: 4, color: 'var(--text-muted)' }}>
                        ID: {agent.id.slice(-6)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{agent.role}</div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className={agent.status === 'running' ? 'pulse' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
                      <span style={{ fontSize: 12, color: statusColor, textTransform: 'uppercase', fontWeight: 600 }}>{agent.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 20, textAlign: 'center' }}>
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>
                </div>

                {/* Body (Expanded) */}
                {isExpanded && (
                  <div style={{ padding: 18, cursor: 'default' }} onClick={e => e.stopPropagation()}>
                    
                    {/* Goal Description */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                      <div style={{ flex: 1, padding: 12, background: 'var(--bg-base)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Objective</div>
                        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{agent.goal}</div>
                      </div>
                    </div>

                    {/* Resources Row */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 20, paddingBottom: 20, borderBottom: '1px outset var(--border-subtle)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Memory Allotment</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--info)' }}>{agent.maxTokens}</span>
                        </div>
                        <input 
                          type="range" min="1024" max="32768" step="1024"
                          value={agent.maxTokens}
                          onChange={e => updateConfig(agent.id, parseInt(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--info)' }} 
                        />
                      </div>
                      
                      <div style={{ width: '1px', background: 'var(--border-subtle)' }} />

                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 10 }}>
                          <input 
                            type="checkbox" 
                            checked={agent.isAutonomous} 
                            onChange={e => updateConfig(agent.id, undefined, undefined, undefined, e.target.checked)} 
                            style={{ scale: '1.2' }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>Autonomous Tracking</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Universal polling & monitoring</div>
                          </div>
                        </label>

                        {agent.isAutonomous && (
                          <div style={{ paddingLeft: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Interval</span>
                              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{Math.round(agent.pollingInterval / 60000)} mins</span>
                            </div>
                            <input 
                              type="range" min={1 * 60000} max={60 * 60000} step={1 * 60000}
                              value={agent.pollingInterval}
                              onChange={e => updateConfig(agent.id, undefined, undefined, undefined, undefined, parseInt(e.target.value))}
                              style={{ width: '100%', height: 4, accentColor: 'var(--accent)' }} 
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ width: '1px', background: 'var(--border-subtle)' }} />

                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 10 }}>
                          <input 
                            type="checkbox" 
                            checked={agent.useRotorQuant} 
                            onChange={e => updateConfig(agent.id, undefined, e.target.checked)} 
                            style={{ scale: '1.2' }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>RotorQuant</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>KV optimization</div>
                          </div>
                        </label>
                      </div>
                      
                      {agent.status === 'running' && (
                        <>
                          <div style={{ width: '1px', background: 'var(--border-subtle)' }} />
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={e => killAgent(agent.id, e)}>
                              🛑 Off
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Execution Logs */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 4 }}>Execution Timeline</div>
                      <div style={{ 
                        background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, 
                        maxHeight: 250, overflowY: 'auto'
                      }}>
                        {agent.logs.map((L: string, i: number) => {
                          const isError = L.includes('ERROR');
                          const isSystem = L.includes('[SYSTEM]') || L.includes('[INFO]');
                          const timestampMatch = L.match(/^\[(.*?)\] (.*)/);
                          const timestamp = timestampMatch ? timestampMatch[1] : '';
                          const text = timestampMatch ? timestampMatch[2] : L;

                          return (
                            <div key={i} style={{ 
                              display: 'flex', padding: '6px 10px', 
                              borderBottom: i === agent.logs.length - 1 ? 'none' : '1px solid #21262d',
                              fontSize: 12, fontFamily: 'monospace'
                            }}>
                              {timestamp && <span style={{ color: '#8b949e', width: 70, flexShrink: 0 }}>{timestamp}</span>}
                              <span style={{ 
                                color: isError ? '#ff7b72' : isSystem ? '#79c0ff' : '#d2a8ff',
                                wordWrap: 'break-word', whiteSpace: 'pre-wrap', flex: 1
                              }}>
                                {text}
                              </span>
                            </div>
                          );
                        })}
                        {agent.logs.length === 0 && (
                          <div style={{ padding: 12, color: '#8b949e', fontSize: 11, fontStyle: 'italic' }}>No logs tracked yet...</div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
