'use client';
import { useEffect, useState } from 'react';

type TabType = 'Overview' | 'Files' | 'Tools' | 'Skills' | 'Channels' | 'Cron Jobs';

export default function AgentsDashboard() {
  const [data, setData] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Overview');
  
  // Workspace Files State
  const [workspaceFiles, setWorkspaceFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFilesLoading, setIsFilesLoading] = useState(false);

  const fetchAgents = () => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(res => {
        setData(res);
        if (!selectedAgentId && res.agents && Object.keys(res.agents).length > 0) {
          // Select the latest agent by default
          const agents = Object.values(res.agents);
          setSelectedAgentId((agents[agents.length - 1] as any).id);
        }
      })
      .catch(() => null);
  };

  useEffect(() => {
    fetchAgents();
    const inv = setInterval(fetchAgents, 2000);
    return () => clearInterval(inv);
  }, [selectedAgentId]);

  // Fetch Workspace Files
  useEffect(() => {
    if (activeTab === 'Files' && selectedAgentId) {
      setIsFilesLoading(true);
      fetch(`/api/agents/${selectedAgentId}/files`)
        .then(r => r.json())
        .then(res => {
          setWorkspaceFiles(res.files || []);
          if (res.files?.length > 0 && !activeFile) {
            setActiveFile(res.files[0].name);
          }
        })
        .finally(() => setIsFilesLoading(false));
    }
  }, [activeTab, selectedAgentId]);

  // Fetch File Content
  useEffect(() => {
    if (activeFile && selectedAgentId) {
      fetch(`/api/agents/${selectedAgentId}/files/${activeFile}`)
        .then(r => r.json())
        .then(res => {
          setFileContent(res.content);
          setOriginalContent(res.content);
        });
    }
  }, [activeFile, selectedAgentId]);

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

  const killAgent = async (id: string) => {
    await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ action: 'killAgent', id })
    });
    fetchAgents();
  };

  const saveFile = async () => {
    if (!selectedAgentId || !activeFile) return;
    setIsSaving(true);
    try {
      await fetch(`/api/agents/${selectedAgentId}/files/${activeFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContent })
      });
      setOriginalContent(fileContent);
    } catch (e) {
      console.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  if (!data) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Initializing Brain Interface...</div>;

  const agents = Object.values(data.agents || {}) as any[];
  // Sort latest first for display
  const sortedAgents = [...agents].reverse();
  const selectedAgent = agents.find(a => a.id === selectedAgentId) || sortedAgents[0];

  const tabs: TabType[] = ['Overview', 'Files', 'Tools', 'Skills', 'Channels', 'Cron Jobs'];

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 100px)', padding: '24px 32px' }}>
      
      {/* ─── LEFT PANEL: AGENT SELECTOR ────────────────────────────────── */}
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Agents</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Workspace Orchestrator</p>
        </div>

        {/* Global Memory Pool (Mini Card in Sidebar) */}
        <div style={{ 
          padding: 16, 
          background: 'rgba(255,255,255,0.03)', 
          borderRadius: 12, 
          border: '1px solid var(--border-subtle)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>GLOBAL MEMORY</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{(data.overallKvLimit / 1000).toFixed(0)}k</span>
          </div>
          <input 
            type="range" min="8192" max="200000" step="1024"
            value={data.overallKvLimit} 
            onChange={e => updateConfig(null, undefined, undefined, parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)', height: 4 }} 
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedAgents.map(agent => {
            const isActive = selectedAgentId === agent.id;
            const statusColor = agent.status === 'running' ? 'var(--info)' : 
                                agent.status === 'completed' ? 'var(--success)' : 
                                agent.status === 'error' ? 'var(--error)' : 
                                agent.status === 'sleeping' ? 'var(--text-muted)' : 'var(--text-secondary)';
            
            return (
              <div 
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: isActive ? 'rgba(108,99,255,0.1)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(108,99,255,0.2)' : 'transparent'}`,
                  transition: 'all 0.2s ease'
                }}
                className="agent-item-hover"
              >
                <div style={{ 
                  width: 36, height: 36, borderRadius: '50%', 
                  background: isActive ? 'var(--accent)' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#fff',
                  border: `1px solid ${isActive ? 'transparent' : 'var(--border-subtle)'}`
                }}>
                  {agent.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{agent.name}</span>
                    <span style={{ fontSize: 8, padding: '1px 4px', background: 'var(--bg-base)', borderRadius: 3, color: 'var(--text-muted)', visibility: isActive ? 'visible' : 'hidden' }}>DEFAULT</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{agent.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── RIGHT PANEL: WORKSPACE ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        
        {selectedAgent ? (
          <>
            {/* Workspace Header & Tabs */}
            <div style={{ padding: '24px 24px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedAgent.name}</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{selectedAgent.role}</p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {['running', 'error'].includes(selectedAgent.status) && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => killAgent(selectedAgent.id)}>🛑 Kill Process</button>
                  )}
                  {selectedAgent.status === 'sleeping' && (
                    <button 
                      className="btn btn-primary btn-sm" 
                      style={{ background: 'var(--success)', border: 'none' }} 
                      onClick={() => fetch('/api/agents', { method: 'POST', body: JSON.stringify({ action: 'wakeAgent', id: selectedAgent.id }) }).then(fetchAgents)}
                    >
                      💡 Wake Up
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 24 }}>
                {tabs.map(tab => (
                  <div 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{ 
                      padding: '10px 0', 
                      fontSize: 13, 
                      fontWeight: 600, 
                      color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                      borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tab}
                  </div>
                ))}
              </div>
            </div>

            {/* Workspace Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {activeTab === 'Overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                  
                  {/* Objective Section */}
                  <section>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Current Objective</h3>
                    <div style={{ padding: 16, background: 'var(--bg-base)', borderRadius: 12, border: '1px solid var(--border-subtle)', lineHeight: 1.6, fontSize: 14 }}>
                      {selectedAgent.goal}
                    </div>
                  </section>

                  {/* Configuration & Toggles */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Memory</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--info)' }}>{selectedAgent.maxTokens}</span>
                      </div>
                      <input 
                        type="range" min="1024" max="32768" step="1024"
                        value={selectedAgent.maxTokens ?? 4096}
                        onChange={e => updateConfig(selectedAgent.id, parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--info)', height: 4 }} 
                      />
                    </div>

                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedAgent.isAutonomous}
                          onChange={e => updateConfig(selectedAgent.id, undefined, undefined, undefined, e.target.checked)}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Autonomous</span>
                      </label>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Track goals automatically</div>
                    </div>

                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedAgent.useRotorQuant}
                          onChange={e => updateConfig(selectedAgent.id, undefined, e.target.checked)}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>RotorQuant</span>
                      </label>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Optimized KV caching</div>
                    </div>
                  </div>

                  {/* Timeline / Logs */}
                  <section>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>System Logs</h3>
                    <div style={{ 
                      background: '#0d1117', border: '1px solid #30363d', borderRadius: 12, 
                      padding: '8px 0', maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace'
                    }}>
                      {selectedAgent.logs.map((L: string, i: number) => (
                        <div key={i} style={{ padding: '6px 16px', fontSize: 12, borderBottom: '1px solid #21262d', color: L.includes('ERROR') ? '#ff7b72' : '#d2a8ff' }}>
                          <span style={{ color: '#8b949e', marginRight: 12 }}>{L.match(/^\[(.*?)\]/)?.[1] || '--:--'}</span>
                          {L.replace(/^\[.*?\]\s*/, '')}
                        </div>
                      ))}
                      {selectedAgent.logs.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No logs available for this session.</div>}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'Files' && (
                <div style={{ display: 'flex', gap: 24, height: '100%', minHeight: 0 }}>
                  {/* File List Sidebar */}
                  <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid var(--border-subtle)', paddingRight: 24 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Workspace Files</h3>
                    {isFilesLoading ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>Loading...</div>
                    ) : (
                      workspaceFiles.map(f => (
                        <div 
                          key={f.name}
                          onClick={() => setActiveFile(f.name)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            background: activeFile === f.name ? 'rgba(255,255,255,0.05)' : 'transparent',
                            color: activeFile === f.name ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontSize: 13,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: activeFile === f.name ? 600 : 400 }}>{f.name}</span>
                            {f.name === activeFile && fileContent !== originalContent && (
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                            )}
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.role}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* File Editor */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{activeFile}</h3>
                        {workspaceFiles.find(f => f.name === activeFile) && (
                          <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 12, color: 'var(--text-muted)' }}>
                            {workspaceFiles.find(f => f.name === activeFile).role.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <button 
                        className="btn btn-primary btn-sm"
                        disabled={isSaving || fileContent === originalContent}
                        onClick={saveFile}
                        style={{ height: 32, minHeight: 0 }}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                    
                    <textarea 
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      spellCheck={false}
                      style={{
                        flex: 1,
                        background: '#0d1117',
                        color: '#d1d5db',
                        border: '1px solid #30363d',
                        borderRadius: 12,
                        padding: 20,
                        fontFamily: 'monospace',
                        fontSize: 13,
                        lineHeight: 1.6,
                        outline: 'none',
                        resize: 'none'
                      }}
                    />
                  </div>
                </div>
              )}

              {['Tools', 'Skills', 'Channels', 'Cron Jobs'].includes(activeTab) && (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14, fontStyle: 'italic' }}>
                  {activeTab} module is coming soon to this agent workspace.
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select an agent to view workspace
          </div>
        )}
      </div>

      <style jsx>{`
        .agent-item-hover:hover {
          background: rgba(255,255,255,0.03) !important;
        }
        input[type="range"] {
          -webkit-appearance: none;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: var(--accent);
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
