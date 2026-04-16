'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ALL_TOOLS, ALL_TOOL_IDS, groupToolsByCategory } from '@/brain/toolRegistry';


// ─── Types ────────────────────────────────────────────────────────────────────
type LogType = 'THINK' | 'ACTION' | 'TOOL' | 'RESULT' | 'ERROR' | 'BOOT' | 'SYSTEM' | 'INFO';
type TabType = 'Overview' | 'Files' | 'Tools' | 'Skills' | 'Channels' | 'Cron Jobs' | 'System Logs' | 'Control';

interface AgentLog {
  id: string;
  type: LogType;
  timestamp: string;
  title?: string;
  message: string;
  metadata?: Record<string, any>;
}

interface Agent {
  id: string;
  name: string;
  role?: string;
  goal?: string;
  status: 'sleeping' | 'running' | 'completed' | 'error' | 'paused';
  mode?: string;
  logs: AgentLog[];
  maxTokens?: number;
  useRotorQuant?: boolean;
  skills?: string[];
  tools?: string[];
  isAutonomous?: boolean;
  pollingInterval?: number;
  allowedTools?: string[];
  folder?: string;
  isSystem?: boolean;
  cycleCount?: number;
  lastCycle?: { think?: string; action?: string; tool?: string; result?: string };
}

// ─── Log Colors ───────────────────────────────────────────────────────────────
const LOG_STYLES: Record<LogType, { bg: string; border: string; label: string; color: string; dot: string }> = {
  THINK:  { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.3)',  label: 'THINK',  color: '#a78bfa', dot: '#8b5cf6' },
  ACTION: { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  label: 'ACTION', color: '#60a5fa', dot: '#3b82f6' },
  TOOL:   { bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.3)',   label: 'TOOL',   color: '#22d3ee', dot: '#06b6d4' },
  RESULT: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  label: 'RESULT', color: '#34d399', dot: '#10b981' },
  ERROR:  { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.4)',   label: 'ERROR',  color: '#f87171', dot: '#ef4444' },
  BOOT:   { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.3)',  label: 'BOOT',   color: '#fbbf24', dot: '#f59e0b' },
  SYSTEM: { bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.2)', label: 'SYS',    color: '#9ca3af', dot: '#6b7280' },
  INFO:   { bg: 'rgba(156,163,175,0.04)', border: 'rgba(156,163,175,0.15)',label: 'INFO',   color: '#6b7280', dot: '#4b5563' },
};

const STATUS_COLORS: Record<string, string> = {
  running: '#10b981',
  paused: '#f59e0b',
  sleeping: '#6b7280',
  completed: '#3b82f6',
  error: '#ef4444',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FILE_ICONS: Record<string, string> = {
  'IDENTITY.md': '🧬',
  'SOUL.md': '🧠',
  'TOOLS.md': '🛠',
  'AGENTS.md': '📜',
  'MEMORY.md': '🗄',
  'HEARTBEAT.md': '💓',
  'BOOTSTRAP.md': '🚀',
  'USER.md': '👤',
  'SKILL.md': '⚡',
};

const FILE_ROLES: Record<string, string> = {
  'IDENTITY.md': 'identity',
  'SOUL.md': 'personality',
  'TOOLS.md': 'capabilities',
  'AGENTS.md': 'instructions',
  'MEMORY.md': 'memory',
  'HEARTBEAT.md': 'schedule',
  'BOOTSTRAP.md': 'startup',
  'USER.md': 'user-profile',
  'SKILL.md': 'skill-set',
};

const TOOL_ICONS: Record<string, string> = {
  instagram_dm_reader: '📥', instagram_dm_sender: '📤', instagram_dm: '📸',
  instagram_fetch: '🔍', instagram_feed_reader: '📰',
  caption_manager: '✏️', platform_post: '🚀',
  search_web: '🌐', get_tasks: '📋', get_channels: '📡',
  get_agents: '🤖', get_config: '⚙️', get_skills: '🧠',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function LogCard({ log, expanded, onToggle }: { log: AgentLog; expanded: boolean; onToggle: () => void }) {
  const style = LOG_STYLES[log.type] || LOG_STYLES.INFO;
  const hasExtra = log.metadata && Object.keys(log.metadata).length > 0;
  const isLong = log.message.length > 120;

  return (
    <div
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        cursor: (hasExtra || isLong) ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, opacity 0.15s ease',
      }}
      onClick={onToggle}
      className="log-card-hover"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Type pill */}
        <div style={{
          flexShrink: 0,
          background: style.dot,
          color: '#fff',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 1,
          padding: '2px 7px',
          borderRadius: 4,
          marginTop: 1,
        }}>
          {style.label}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {log.title && (
            <div style={{ fontSize: 12, fontWeight: 700, color: style.color, marginBottom: 2 }}>
              {log.title}
            </div>
          )}
          <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            overflow: expanded ? 'visible' : 'hidden',
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 3,
            WebkitBoxOrient: 'vertical',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {log.message}
          </div>
          {expanded && hasExtra && (
            <div style={{
              marginTop: 8,
              padding: '8px 10px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              fontSize: 10,
              fontFamily: 'monospace',
              color: '#9ca3af',
            }}>
              {JSON.stringify(log.metadata, null, 2)}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {log.timestamp}
        </div>
      </div>
    </div>
  );
}

function FileModal({ agentId, filename, role, onClose }: {
  agentId: string; filename: string; role: string; onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/files/${filename}`)
      .then(r => r.json())
      .then(res => { setContent(res.content || ''); setOriginal(res.content || ''); });
  }, [agentId, filename]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/agents/${agentId}/files/${filename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setOriginal(content);
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: '#0f1117',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        width: '100%', maxWidth: 800,
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{FILE_ICONS[filename] || '📄'}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{filename}</div>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase' }}>{role}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={saving || content === original}
              onClick={save}
              style={{ minWidth: 100 }}
            >
              {saving ? 'Saving…' : '💾 Save'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        {/* Editor */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            color: '#e5e7eb',
            border: 'none',
            outline: 'none',
            padding: '20px 24px',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 13,
            lineHeight: 1.7,
            resize: 'none',
            minHeight: 400,
          }}
        />
      </div>
    </div>
  );
}

function SkillModal({ agentId, skillId, onClose }: {
  agentId: string; skillId: string; onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState('');

  useEffect(() => {
    fetch(`/api/agents/${agentId}/files/SKILL.md`)
      .then(r => r.json())
      .then(res => { setContent(res.content || ''); setOriginal(res.content || ''); });
  }, [agentId, skillId]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/agents/${agentId}/files/SKILL.md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    setOriginal(content);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(10px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, #0f1117 0%, #12151e 100%)',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 20, width: '100%', maxWidth: 780,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.1)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa' }}>{skillId}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Agent Skill Definition</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {!editing ? (
              <button className="btn btn-ghost btn-sm" style={{ color: '#a78bfa' }} onClick={() => setEditing(true)}>✏️ Edit</button>
            ) : (
              <>
                <button className="btn btn-primary btn-sm" disabled={saving || content === original} onClick={save}>{saving ? 'Saving…' : '💾 Save'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setContent(original); setEditing(false); }}>Cancel</button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        {editing ? (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, background: 'transparent', color: '#e5e7eb', border: 'none', outline: 'none',
              padding: '20px 24px', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7, resize: 'none',
            }}
          />
        ) : (
          <div style={{
            flex: 1, overflowY: 'auto', padding: '20px 24px',
            color: '#d1d5db', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
          }}>
            {content || 'No skill content found. Click Edit to create content.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentsDashboard() {
  const [data, setData] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Overview');

  const [workspaceFiles, setWorkspaceFiles] = useState<any[]>([]);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [fileModal, setFileModal] = useState<{ name: string; role: string } | null>(null);

  const [skillModal, setSkillModal] = useState<string | null>(null);
  const [toolEditModal, setToolEditModal] = useState<string | null>(null);
  const [toolDescription, setToolDescription] = useState('');
  const [toolNotes, setToolNotes] = useState<Record<string, string>>({});

  const [installedSkills, setInstalledSkills] = useState<string[]>([]);
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/skills')
      .then(r => r.json())
      .then(res => {
        setAllSkills(res.skills || []);
        setInstalledSkills((res.skills || []).map((s: any) => s.id));
      })
      .catch(() => undefined);
  }, []);

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(res => {
        setData(res);
        if (!selectedAgentId && res.agents && Object.keys(res.agents).length > 0) {
          const jennyId = 'system_jenny';
          if (res.agents[jennyId]) {
            setSelectedAgentId(jennyId);
          } else {
            const agents = Object.values(res.agents) as any[];
            setSelectedAgentId(agents[agents.length - 1]?.id);
          }
        }
      })
      .catch(() => null);
  }, [selectedAgentId]);

  useEffect(() => {
    fetchAgents();
    const inv = setInterval(fetchAgents, 2000);
    return () => clearInterval(inv);
  }, [selectedAgentId]);

  // Auto-scroll logs to top when new ones arrive (unless user scrolled)
  useEffect(() => {
    if (!userScrolled && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  });

  useEffect(() => {
    if (activeTab === 'Files' && selectedAgentId) {
      setIsFilesLoading(true);
      fetch(`/api/agents/${selectedAgentId}/files`)
        .then(r => r.json())
        .then(res => { setWorkspaceFiles(res.files || []); })
        .finally(() => setIsFilesLoading(false));
    }

    if (activeTab === 'Tools' && selectedAgentId) {
      fetch(`/api/agents/${selectedAgentId}/files/tool_notes.json`)
        .then(r => r.json())
        .then(res => {
           if (res.content) {
             try {
               setToolNotes(JSON.parse(res.content));
             } catch {}
           } else {
             setToolNotes({});
           }
        }).catch(() => setToolNotes({}));
    }
  }, [activeTab, selectedAgentId]);

  const saveToolNotes = async (tool: string, notes: string) => {
    if (!selectedAgentId) return;
    const updated = { ...toolNotes, [tool]: notes };
    setToolNotes(updated);
    await fetch(`/api/agents/${selectedAgentId}/files/tool_notes.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: JSON.stringify(updated, null, 2) }),
    });
  };

  const updateConfig = async (id: string | null, maxTokens?: number, useRotorQuant?: boolean, overallLimit?: number, isAutonomous?: boolean, pollingInterval?: number) => {
    const payload: any = { action: 'updateConfig' };
    if (id) payload.agentId = id;
    if (maxTokens !== undefined) payload.maxTokens = maxTokens;
    if (useRotorQuant !== undefined) payload.useRotorQuant = useRotorQuant;
    if (overallLimit !== undefined) payload.overallLimit = overallLimit;
    if (isAutonomous !== undefined) payload.isAutonomous = isAutonomous;
    if (pollingInterval !== undefined) payload.pollingInterval = pollingInterval;
    await fetch('/api/agents', { method: 'POST', body: JSON.stringify(payload) });
    fetchAgents();
  };

  const agentAction = async (action: string, id: string) => {
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    fetchAgents();
  };

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Initializing Agent Control Center…</div>
      </div>
    );
  }

  // Sort: Jenny first, then newest last (reverse of creation order)
  const agents = Object.values(data.agents || {}) as Agent[];
  const jenny = agents.find(a => a.isSystem || a.id === 'system_jenny');
  const otherAgents = agents.filter(a => !a.isSystem && a.id !== 'system_jenny').reverse();
  const sortedAgents = jenny ? [jenny, ...otherAgents] : otherAgents;

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || sortedAgents[0];
  const tabs: TabType[] = ['Overview', 'Files', 'Tools', 'Skills', 'Channels', 'Cron Jobs', 'System Logs', 'Control'];

  const workspacePath = selectedAgent?.folder
    ? `workspace/agents/${selectedAgent.folder}/`
    : null;

  // Last 3 cycles for Live Execution Flow
  const lastCycle = selectedAgent?.lastCycle || {};
  const cycleSteps = [
    { key: 'think', label: 'THINK', color: '#8b5cf6', icon: '🧠' },
    { key: 'action', label: 'ACTION', color: '#3b82f6', icon: '⚡' },
    { key: 'tool', label: 'TOOL', color: '#06b6d4', icon: '🔧' },
    { key: 'result', label: 'RESULT', color: '#10b981', icon: '✅' },
  ] as const;

  const controlActions = [
    { action: 'wakeAgent', label: 'Start Agent', icon: '▶️', color: '#10b981', desc: 'Resume or start the agent worker' },
    { action: 'pauseAgent', label: 'Pause Agent', icon: '⏸', color: '#f59e0b', desc: 'Pause between cycles' },
    { action: 'resumeAgent', label: 'Resume Agent', icon: '⏩', color: '#3b82f6', desc: 'Resume from paused state' },
    { action: 'killAgent', label: 'Kill Process', icon: '🛑', color: '#ef4444', desc: 'Force stop the agent', disabled: selectedAgent?.isSystem },
    { action: 'restartAgent', label: 'Restart Agent', icon: '🔄', color: '#8b5cf6', desc: 'Full restart with bootstrap' },
    { action: 'forceCycle', label: 'Force Execute', icon: '⚡', color: '#06b6d4', desc: 'Trigger one cycle immediately' },
    { action: 'clearMemory', label: 'Clear Memory', icon: '🗑', color: '#6b7280', desc: 'Wipe session memory + MEMORY.md' },
    { action: 'reloadSkills', label: 'Reload Skills', icon: '🔁', color: '#a78bfa', desc: 'Refresh skill list from /brain/skills/' },
    { action: 'reloadTools', label: 'Reload Tools', icon: '🔧', color: '#22d3ee', desc: 'Refresh tool configuration' },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 100px)', padding: '24px 32px' }}>

      {/* ─── LEFT PANEL: AGENT SELECTOR ────────────────────────────────── */}
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Agents</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Agent Control Center</p>
        </div>

        {/* Global Memory Pool */}
        <div style={{
          padding: 16,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
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
            const statusColor = STATUS_COLORS[agent.status] || '#6b7280';
            const isRunning = agent.status === 'running';

            return (
              <div
                key={agent.id}
                onClick={() => { setSelectedAgentId(agent.id); setActiveTab('Overview'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                  background: isActive ? 'rgba(108,99,255,0.12)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(108,99,255,0.25)' : 'transparent'}`,
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? '0 0 20px rgba(108,99,255,0.08)' : 'none',
                }}
                className="agent-item-hover"
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: isActive ? 'var(--accent)' : agent.isSystem ? 'rgba(139,92,246,0.2)' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: '#fff',
                  border: `2px solid ${isActive ? 'var(--accent)' : agent.isSystem ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'}`,
                  boxShadow: isRunning ? `0 0 10px ${statusColor}40` : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  {agent.isSystem ? '🌐' : agent.name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {agent.name}
                    </span>
                    {agent.isSystem && (
                      <span style={{
                        fontSize: 8, padding: '1px 5px',
                        background: 'rgba(139,92,246,0.2)',
                        color: '#a78bfa', borderRadius: 3, fontWeight: 700,
                      }}>SYSTEM</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', background: statusColor,
                      boxShadow: isRunning ? `0 0 6px ${statusColor}` : 'none',
                      animation: isRunning ? 'pulse 2s infinite' : 'none',
                    }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{agent.status}</span>
                    {agent.cycleCount && agent.cycleCount > 0 && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>· #{agent.cycleCount}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── RIGHT PANEL: WORKSPACE ────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.07)',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        {selectedAgent ? (
          <>
            {/* Workspace Header & Tabs */}
            <div style={{ padding: '24px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedAgent.name}</h2>
                    {selectedAgent.isSystem && (
                      <span style={{
                        fontSize: 9, padding: '2px 8px',
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3))',
                        border: '1px solid rgba(139,92,246,0.4)',
                        color: '#a78bfa', borderRadius: 6, fontWeight: 800, letterSpacing: 1,
                      }}>SYSTEM</span>
                    )}
                    {/* Status dot */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: STATUS_COLORS[selectedAgent.status] || '#6b7280',
                        boxShadow: selectedAgent.status === 'running' ? `0 0 6px ${STATUS_COLORS.running}` : 'none',
                      }} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {selectedAgent.status}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{selectedAgent.role}</p>
                  {workspacePath && (
                    <p style={{
                      fontSize: 11, color: '#06b6d4',
                      fontFamily: 'monospace',
                      background: 'rgba(6,182,212,0.06)',
                      padding: '2px 8px', borderRadius: 4,
                      display: 'inline-block',
                    }}>
                      📁 {workspacePath}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {!selectedAgent.isSystem && ['running', 'error'].includes(selectedAgent.status) && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => agentAction('killAgent', selectedAgent.id)}>🛑 Kill</button>
                  )}
                  {selectedAgent.status === 'sleeping' && (
                    <button className="btn btn-primary btn-sm" style={{ background: 'var(--success)', border: 'none' }}
                      onClick={() => agentAction('wakeAgent', selectedAgent.id)}>💡 Wake Up</button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
                {tabs.map(tab => (
                  <div
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 16px',
                      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                      color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                      borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.2s',
                      borderRadius: '6px 6px 0 0',
                      background: activeTab === tab ? 'rgba(108,99,255,0.06)' : 'transparent',
                    }}
                  >
                    {tab}
                  </div>
                ))}
              </div>
            </div>

            {/* Workspace Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

              {/* ─── OVERVIEW ─────────────────────────────────────── */}
              {activeTab === 'Overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

                  {/* Objective */}
                  <section>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Current Objective</h3>
                    <div style={{
                      padding: 16, background: 'rgba(255,255,255,0.03)',
                      borderRadius: 12, border: '1px solid var(--border-subtle)',
                      lineHeight: 1.7, fontSize: 14, color: 'var(--text-secondary)',
                    }}>
                      {selectedAgent.goal || 'No objective set.'}
                    </div>
                  </section>

                  {/* Live Execution Flow */}
                  <section>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                      Live Execution Flow {selectedAgent.cycleCount ? `— Cycle #${selectedAgent.cycleCount}` : ''}
                    </h3>
                    <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                      {cycleSteps.map(({ key, label, color, icon }, i) => {
                        const val = lastCycle[key];
                        const isActive = !!val;
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                            <div style={{
                              flex: 1,
                              padding: '14px 16px',
                              background: isActive ? `${color}12` : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${isActive ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: i === 0 ? '12px 0 0 12px' : i === 3 ? '0 12px 12px 0' : 0,
                              transition: 'all 0.3s ease',
                              boxShadow: isActive ? `inset 0 0 20px ${color}08` : 'none',
                            }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? color : 'var(--text-muted)', letterSpacing: 1, marginBottom: 6 }}>
                                {icon} {label}
                              </div>
                              <div style={{
                                fontSize: 11, color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)',
                                lineHeight: 1.4, fontFamily: 'monospace',
                                overflow: 'hidden', display: '-webkit-box',
                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                              }}>
                                {val || '—'}
                              </div>
                            </div>
                            {i < 3 && (
                              <div style={{
                                fontSize: 16, color: isActive ? color : 'rgba(255,255,255,0.1)',
                                padding: '0 4px', flexShrink: 0, transition: 'color 0.3s',
                              }}>→</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Config */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Memory</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--info)' }}>{selectedAgent.maxTokens}</span>
                      </div>
                      <input type="range" min="1024" max="32768" step="1024"
                        value={selectedAgent.maxTokens ?? 4096}
                        onChange={e => updateConfig(selectedAgent.id, parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--info)', height: 4 }} />
                    </div>
                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedAgent.isAutonomous}
                          onChange={e => updateConfig(selectedAgent.id, undefined, undefined, undefined, e.target.checked)} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Autonomous</span>
                      </label>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Track goals automatically</div>
                    </div>
                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedAgent.useRotorQuant}
                          onChange={e => updateConfig(selectedAgent.id, undefined, e.target.checked)} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>RotorQuant</span>
                      </label>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Optimized KV caching</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── FILES ────────────────────────────────────────── */}
              {activeTab === 'Files' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Workspace Files</h3>
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{workspaceFiles.length} files</span>
                  </div>
                  {isFilesLoading ? (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading files…</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                      {workspaceFiles.map((f: any) => (
                        <div
                          key={f.name}
                          onClick={() => setFileModal({ name: f.name, role: FILE_ROLES[f.name] || f.role || 'context' })}
                          className="file-card-hover"
                          style={{
                            padding: '22px 18px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: 14,
                            border: '1px solid rgba(255,255,255,0.07)',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 10, textAlign: 'center',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ fontSize: 32 }}>{FILE_ICONS[f.name] || '📄'}</div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                              {FILE_ROLES[f.name] || f.role || 'context'}
                            </div>
                          </div>
                        </div>
                      ))}
                      {workspaceFiles.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                          <div style={{ fontSize: 40, marginBottom: 16 }}>📂</div>
                          <div>Workspace is being provisioned…</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── TOOLS ────────────────────────────────────────── */}
              {activeTab === 'Tools' && (() => {
                // Import registry data inline (available at module level after import)
                const enabledSet = new Set([
                  ...(selectedAgent.allowedTools || []),
                  ...(selectedAgent.tools || []),
                ]);
                const enabledCount = ALL_TOOLS.filter(t => enabledSet.has(t.id)).length;
                const totalCount = ALL_TOOLS.length;
                const grouped = groupToolsByCategory(ALL_TOOLS);

                const toggleTool = async (toolId: string, nowEnabled: boolean) => {
                  await fetch('/api/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'toggleTool', id: selectedAgentId, toolId, enabled: nowEnabled }),
                  });
                  fetchAgents();
                };

                const enableAll = async () => {
                  await fetch('/api/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'enableAllTools', id: selectedAgentId, toolIds: ALL_TOOL_IDS }),
                  });
                  fetchAgents();
                };

                const disableAll = async () => {
                  await fetch('/api/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'disableAllTools', id: selectedAgentId }),
                  });
                  fetchAgents();
                };

                const badgeStyle = (badge: string) => {
                  if (badge === 'BUILT-IN') return { background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' };
                  if (badge === 'CONNECTED') return { background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' };
                  return { background: 'rgba(156,163,175,0.1)', color: '#9ca3af', border: '1px solid rgba(156,163,175,0.15)' };
                };

                return (
                  <div>
                    {/* Header */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Tool Access</h3>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            Profile + per-tool overrides for this agent. <strong style={{ color: 'var(--accent)' }}>{enabledCount}/{totalCount} enabled.</strong>
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={enableAll} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 7, color: '#34d399', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            Enable All
                          </button>
                          <button onClick={disableAll} style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            Disable All
                          </button>
                        </div>
                      </div>

                      {/* Profile row */}
                      <div style={{ display: 'flex', gap: 32, padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>PROFILE</div>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{selectedAgent?.isSystem ? 'system' : (selectedAgent?.role || 'general')}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>SOURCE</div>
                          <div style={{ color: 'var(--text-secondary)' }}>agent config</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>SCOPE</div>
                          <div style={{ color: '#a78bfa' }}>agent:{selectedAgent?.id}</div>
                        </div>
                      </div>
                    </div>

                    {/* Categories */}
                    {Object.entries(grouped).map(([category, tools]) => (
                      <div key={category} style={{ marginBottom: 28 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>
                          {category}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                          {tools.map(tool => {
                            const isEnabled = enabledSet.has(tool.id);
                            return (
                              <div
                                key={tool.id}
                                style={{
                                  padding: '14px 16px',
                                  background: isEnabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                                  borderRadius: 12,
                                  border: `1px solid ${isEnabled ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                                  opacity: isEnabled ? 1 : 0.55,
                                  transition: 'all 0.2s ease',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 8,
                                }}
                              >
                                {/* Top: name + toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: isEnabled ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {tool.id}
                                  </div>
                                  {/* Toggle */}
                                  <button
                                    onClick={() => toggleTool(tool.id, !isEnabled)}
                                    style={{
                                      flexShrink: 0,
                                      width: 36,
                                      height: 20,
                                      borderRadius: 10,
                                      border: 'none',
                                      background: isEnabled ? '#10b981' : 'rgba(255,255,255,0.1)',
                                      cursor: 'pointer',
                                      position: 'relative',
                                      transition: 'background 0.2s ease',
                                      boxShadow: isEnabled ? '0 0 8px rgba(16,185,129,0.4)' : 'none',
                                    }}
                                    title={isEnabled ? 'Disable this tool' : 'Enable this tool'}
                                  >
                                    <div style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      background: '#fff',
                                      position: 'absolute',
                                      top: 3,
                                      left: isEnabled ? 18 : 3,
                                      transition: 'left 0.2s ease',
                                    }} />
                                  </button>
                                </div>

                                {/* Description */}
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                  {tool.description}
                                </div>

                                {/* Badge */}
                                <div style={{
                                  display: 'inline-block',
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: 0.8,
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  ...badgeStyle(tool.badge),
                                  alignSelf: 'flex-start',
                                }}>
                                  {tool.badge === 'CONNECTED' ? `CONNECTED: ${tool.source.toUpperCase()}` : tool.badge}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}



              {/* ─── SKILLS ───────────────────────────────────────── */}
              {activeTab === 'Skills' && (() => {
                const assignedIds = (selectedAgent.skills || []) as string[];
                const assignedSkills = allSkills.filter(s => assignedIds.includes(s.id));
                const availableSkills = allSkills.filter(s => 
                  !assignedIds.includes(s.id) && 
                  (s.name.toLowerCase().includes(skillSearchQuery.toLowerCase()) || 
                   s.id.toLowerCase().includes(skillSearchQuery.toLowerCase()))
                );

                const handleAssign = async (skillId: string) => {
                  await fetch('/api/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'assignSkill', id: selectedAgentId, skillId }),
                  });
                  fetchAgents();
                };

                const handleUnassign = async (skillId: string) => {
                  await fetch('/api/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'unassignSkill', id: selectedAgentId, skillId }),
                  });
                  fetchAgents();
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Search Bar */}
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search repository skills to assign..."
                        value={skillSearchQuery}
                        onChange={e => setSkillSearchQuery(e.target.value)}
                        style={{
                          width: '100%', padding: '12px 18px', paddingLeft: 44,
                          background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                          border: '1px solid rgba(139,92,246,0.2)', color: '#fff',
                          fontSize: 14, outline: 'none', transition: 'border 0.2s ease',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#8b5cf6')}
                        onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.2)')}
                      />
                      <span style={{ position: 'absolute', left: 18, top: 13, fontSize: 16 }}>🔍</span>
                    </div>

                    {/* Assigned Skills */}
                    <div>
                      <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                        Assigned Skills ({assignedSkills.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {assignedSkills.map(skill => (
                          <div key={skill.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            background: 'rgba(139,92,246,0.07)', borderRadius: 10,
                            padding: '12px 16px', border: '1px solid rgba(139,92,246,0.2)',
                          }}>
                            <span style={{ fontSize: 20, cursor: 'pointer' }} onClick={() => setSkillModal(skill.id)}>🧠</span>
                            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSkillModal(skill.id)}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>{skill.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{skill.description.slice(0, 80)}...</div>
                            </div>
                            <button 
                              onClick={() => handleUnassign(skill.id)}
                              style={{ 
                                padding: '4px 8px', background: 'rgba(239,68,68,0.1)', 
                                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6,
                                color: '#f87171', fontSize: 10, fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {assignedSkills.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12, padding: '8px 4px' }}>No skills assigned yet.</div>
                        )}
                      </div>
                    </div>

                    {/* Available Skills Results */}
                    {skillSearchQuery && (
                      <div style={{ marginTop: 8 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                          Search Results ({availableSkills.length})
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                          {availableSkills.map(skill => (
                            <div key={skill.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                              padding: '12px 16px', border: '1px solid var(--border-subtle)',
                            }}>
                              <span style={{ fontSize: 18 }}>🧠</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{skill.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{skill.description.slice(0, 60)}...</div>
                              </div>
                              <button 
                                onClick={() => handleAssign(skill.id)}
                                style={{ 
                                  padding: '4px 10px', background: 'rgba(16,185,129,0.1)', 
                                  border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6,
                                  color: '#34d399', fontSize: 10, fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                + Assign
                              </button>
                            </div>
                          ))}
                          {availableSkills.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontSize: 12 }}>No matching skills found in repository.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ─── CHANNELS ─────────────────────────────────────── */}
              {activeTab === 'Channels' && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Platform channels this agent has access to</div>
                  {(() => {
                    const tools: string[] = selectedAgent.tools || selectedAgent.allowedTools || [];
                    const channelMap: Record<string, string> = {
                      instagram: '📸', discord: '💬', twitter: '🐦', facebook: '👤', whatsapp: '📱', telegram: '✈️', youtube: '▶️',
                    };
                    const detectedChannels = Object.keys(channelMap).filter(c => tools.some((t: string) => t.includes(c)));
                    if (detectedChannels.length === 0)
                      return <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>No channels detected.</div>;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {detectedChannels.map(ch => (
                          <div key={ch} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            background: 'rgba(20,184,166,0.07)', borderRadius: 10,
                            padding: '14px 18px', border: '1px solid rgba(20,184,166,0.2)',
                          }}>
                            <span style={{ fontSize: 22 }}>{channelMap[ch]}</span>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{ch}</div>
                              <div style={{ fontSize: 11, color: 'var(--accent)' }}>Connected · Browser Session</div>
                            </div>
                            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ─── CRON JOBS ────────────────────────────────────── */}
              {activeTab === 'Cron Jobs' && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Agent heartbeat schedule</div>
                  <div style={{
                    background: 'rgba(251,191,36,0.06)', borderRadius: 12,
                    padding: '16px 20px', border: '1px solid rgba(251,191,36,0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>💓</span>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>HEARTBEAT</div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Polling every <strong style={{ color: '#fbbf24' }}>{Math.round((selectedAgent.pollingInterval || 60000) / 60000)} minute(s)</strong>
                    </div>
                    <div style={{ fontSize: 11, color: selectedAgent.isAutonomous ? '#10b981' : 'var(--text-muted)' }}>
                      {selectedAgent.isAutonomous ? '● Running autonomously' : '○ Autonomous Mode Off'}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── SYSTEM LOGS ──────────────────────────────────── */}
              {activeTab === 'System Logs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      System Logs <span style={{ color: 'var(--accent)', marginLeft: 6 }}>{selectedAgent.logs?.length || 0}</span>
                    </h3>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#ef4444', fontSize: 11 }}
                      onClick={() => agentAction('clearLogs', selectedAgent.id)}
                    >
                      🗑 Clear Logs
                    </button>
                  </div>
                  <div
                    ref={logsContainerRef}
                    onScroll={e => {
                      const el = e.currentTarget;
                      setUserScrolled(el.scrollTop > 50);
                    }}
                    style={{
                      flex: 1, overflowY: 'auto',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      maxHeight: 'calc(100vh - 300px)',
                    }}
                  >
                    {/* Newest first */}
                    {[...(selectedAgent.logs || [])].reverse().map(log => (
                      <LogCard
                        key={log.id}
                        log={log}
                        expanded={expandedLogs.has(log.id)}
                        onToggle={() => {
                          setExpandedLogs(prev => {
                            const next = new Set(prev);
                            next.has(log.id) ? next.delete(log.id) : next.add(log.id);
                            return next;
                          });
                        }}
                      />
                    ))}
                    {(!selectedAgent.logs || selectedAgent.logs.length === 0) && (
                      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No logs yet.</div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── CONTROL ──────────────────────────────────────── */}
              {activeTab === 'Control' && (
                <div>
                  {/* Current State */}
                  <div style={{
                    padding: '14px 20px', marginBottom: 20,
                    background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: STATUS_COLORS[selectedAgent.status] || '#6b7280',
                      boxShadow: selectedAgent.status === 'running' ? `0 0 10px ${STATUS_COLORS.running}` : 'none',
                      animation: selectedAgent.status === 'running' ? 'pulse 2s infinite' : 'none',
                    }} />
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {selectedAgent.status}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                        · Mode: {selectedAgent.mode || 'idle'} · Cycles: {selectedAgent.cycleCount || 0}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {controlActions.map(({ action, label, icon, color, desc, disabled }) => (
                      <button
                        key={action}
                        disabled={disabled}
                        onClick={() => !disabled && agentAction(action, selectedAgent.id)}
                        style={{
                          padding: '16px 18px',
                          background: disabled ? 'rgba(255,255,255,0.02)' : `${color}10`,
                          border: `1px solid ${disabled ? 'rgba(255,255,255,0.05)' : color + '30'}`,
                          borderRadius: 12,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s ease',
                          opacity: disabled ? 0.4 : 1,
                        }}
                        className={disabled ? '' : 'control-btn-hover'}
                      >
                        <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: disabled ? 'var(--text-muted)' : color, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</div>
                      </button>
                    ))}
                  </div>
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

      {/* ─── MODALS ───────────────────────────────────────────────────── */}
      {fileModal && selectedAgent && (
        <FileModal
          agentId={selectedAgent.id}
          filename={fileModal.name}
          role={fileModal.role}
          onClose={() => setFileModal(null)}
        />
      )}
      {skillModal && selectedAgent && (
        <SkillModal
          agentId={selectedAgent.id}
          skillId={skillModal}
          onClose={() => setSkillModal(null)}
        />
      )}
      {toolEditModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setToolEditModal(null)}>
          <div style={{
            background: '#0f1117', border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 20, padding: 28, width: 480,
            boxShadow: '0 0 40px rgba(6,182,212,0.1)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 26 }}>{TOOL_ICONS[toolEditModal] || '🔧'}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#22d3ee', fontFamily: 'monospace' }}>{toolEditModal}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tool Definition</div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Description / Notes</label>
              <textarea
                value={toolDescription}
                onChange={e => setToolDescription(e.target.value)}
                placeholder="Add custom notes about this tool…"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(6,182,212,0.2)', borderRadius: 8,
                  padding: '10px 14px', color: 'var(--text-primary)',
                  fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
                  resize: 'vertical', outline: 'none', minHeight: 80,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ fontSize: 12, color: '#10b981' }}>Enabled</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  if (toolEditModal) saveToolNotes(toolEditModal, toolDescription);
                  setToolEditModal(null);
                }}>💾 Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setToolEditModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
        .agent-item-hover:hover {
          background: rgba(255,255,255,0.04) !important;
          border-color: rgba(255,255,255,0.08) !important;
        }
        .file-card-hover:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(108,99,255,0.25) !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .tool-card-hover:hover {
          background: rgba(6,182,212,0.1) !important;
          border-color: rgba(6,182,212,0.3) !important;
          transform: translateX(3px);
        }
        .skill-card-hover:hover {
          background: rgba(139,92,246,0.12) !important;
          border-color: rgba(139,92,246,0.3) !important;
          transform: translateX(3px);
        }
        .control-btn-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .log-card-hover:hover {
          opacity: 0.92;
          transform: translateX(2px);
        }
        input[type="range"] {
          -webkit-appearance: none;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          background: var(--accent);
          border-radius: 50%; cursor: pointer;
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
