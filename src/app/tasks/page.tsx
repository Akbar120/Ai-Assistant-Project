'use client';
import { useState, useEffect } from 'react';

// ─── Types (Production Grade) ──────────────────────────────────────────────────

type TaskStatus = 'created' | 'processing' | 'waiting_input' | 'partial' | 'completed' | 'failed' | 'abandoned';
type LogLevel = 'info' | 'warning' | 'error';

interface LogItem {
  timestamp: string;
  level: LogLevel;
  step?: string;
  message: string;
  meta?: any;
}

interface TaskStep {
  id: string;
  label: string;
  status: 'pending' | 'completed';
}

interface Task {
  id: string;
  type: string;
  name: string;
  owner: string;
  status: TaskStatus;
  progress: number;
  steps: TaskStep[];
  logs: LogItem[];
  created_at: string;
  updated_at: string;
}

// ─── Status Styles ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { color: string, label: string }> = {
  created: { color: '#94a3b8', label: 'Created' },
  processing: { color: '#facc15', label: 'Processing' },
  waiting_input: { color: '#3b82f6', label: 'Waiting Input' },
  partial: { color: '#fb923c', label: 'Partial Success' },
  completed: { color: '#22c55e', label: 'Completed' },
  failed: { color: '#ef4444', label: 'Failed' },
  abandoned: { color: '#64748b', label: 'Abandoned' },
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  info: '#94a3b8',
  warning: '#fb923c',
  error: '#ef4444'
};

const TYPE_ICONS: Record<string, string> = {
  dataset_creation: '🧠',
  agent_creation: '🤖',
  sandbox: '🧪',
  skill_creation: '⚡',
  execution: '⚙️',
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.created;
  const icon = TYPE_ICONS[task.type] || '⚙️';

  return (
    <div style={{
      padding: '24px',
      borderRadius: '20px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'pointer',
      marginBottom: 16
    }} 
    onClick={() => setExpanded(!expanded)}
    className="hover-bright"
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ 
            width: 48, height: 48, borderRadius: 12, 
            background: 'var(--bg-surface)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', fontSize: 28,
            border: '1px solid var(--border-subtle)'
          }}>
            {icon}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{task.name}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span style={{ opacity: 0.5, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{task.type.replace('_', ' ')}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ opacity: 0.5, fontSize: 11 }}>Owner: <b>{task.owner}</b></span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
           <span style={{
            fontSize: 10,
            fontWeight: 800,
            color: cfg.color,
            textTransform: 'uppercase',
            background: `${cfg.color}15`,
            padding: '4px 10px',
            borderRadius: '6px',
            border: `1px solid ${cfg.color}20`
          }}>
            {cfg.label}
          </span>
          <div style={{ fontSize: 10, opacity: 0.4, marginTop: 8 }}>ID: {task.id}</div>
        </div>
      </div>

      {/* PROGRESS AREA */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
           <span style={{ fontWeight: 600 }}>Mission Progress</span>
           <span style={{ color: cfg.color, fontWeight: 700 }}>{task.progress}%</span>
        </div>
        <div style={{ height: '8px', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{
            width: `${task.progress}%`,
            background: cfg.color,
            height: '100%',
            borderRadius: '10px',
            transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: `0 0 15px ${cfg.color}40`
          }} />
        </div>
      </div>

      {/* STEP CHECKLIST (New) */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        {task.steps.map(step => (
          <div key={step.id} style={{ 
            display: 'flex', alignItems: 'center', gap: 6, 
            fontSize: 11, padding: '4px 10px', borderRadius: 8,
            background: 'rgba(0,0,0,0.1)',
            border: step.status === 'completed' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.05)',
            opacity: step.status === 'completed' ? 1 : 0.4
          }}>
            <span>{step.status === 'completed' ? '✅' : '⏳'}</span>
            <span style={{ fontWeight: 600 }}>{step.label}</span>
          </div>
        ))}
      </div>

      {/* STRUCTURED LOGS */}
      {expanded && (
        <div style={{ 
          marginTop: 24, 
          padding: 16, 
          background: 'rgba(0,0,0,0.3)', 
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.05)',
          fontFamily: 'var(--font-mono)',
          maxHeight: 300,
          overflowY: 'auto'
        }}>
           <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 12, textTransform: 'uppercase' }}>Mission Timeline</div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             {task.logs.map((log, i) => (
               <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12, lineHeight: 1.5 }}>
                 <span style={{ opacity: 0.3, whiteSpace: 'nowrap' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                 <span style={{ color: LOG_LEVEL_COLORS[log.level], fontWeight: 700, minWidth: 50 }}>{log.level.toUpperCase()}</span>
                 <span style={{ flex: 1 }}>
                    {log.step && <b style={{ color: 'var(--accent)', marginRight: 6 }}>[{log.step}]</b>}
                    {log.message}
                 </span>
               </div>
             ))}
           </div>
        </div>
      )}

      {!expanded && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.4, fontSize: 11 }}>
           <span>{task.logs[task.logs.length-1]?.message || 'Initializing mission...'}</span>
           <span>Click to view timeline ({task.logs.length} events)</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/tasks${filter !== 'all' ? `?status=${filter}` : ''}`);
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, [filter]);

  return (
    <div style={{ padding: '40px', background: 'var(--bg-main)', minHeight: '100%' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        <header style={{ marginBottom: 40 }}>
           <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>Mission Control</h1>
           <p style={{ opacity: 0.6, marginTop: 8 }}>Supervise active agents and system-wide task execution pipelines.</p>
        </header>

        {/* STATS BAR */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: 20, marginBottom: 40 
        }}>
           <StatCard label="Active Tasks" value={tasks.filter(t => t.status === 'processing').length} icon="⚡" />
           <StatCard label="Success Rate" value="98%" icon="🎯" />
           <StatCard label="Awaiting Input" value={tasks.filter(t => t.status === 'waiting_input').length} icon="💬" />
           <StatCard label="Failed" value={tasks.filter(t => t.status === 'failed').length} icon="🧨" />
        </div>

        {/* FILTERS */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
          {(['all', 'processing', 'waiting_input', 'completed', 'failed', 'abandoned'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: filter === f ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                color: filter === f ? 'white' : 'var(--text-secondary)',
                border: filter === f ? 'none' : '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.2s ease',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* TASK LIST */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading && tasks.length === 0 ? (
            <div style={{ padding: '80px', textAlign: 'center', opacity: 0.5 }}>Loading missions...</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '80px', textAlign: 'center', opacity: 0.3, border: '2px dashed var(--border-subtle)', borderRadius: 24 }}>
               No missions found in this category.
            </div>
          ) : (
            tasks.map(task => <TaskCard key={task.id} task={task} />)
          )}
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: any, icon: string }) {
  return (
    <div style={{ 
      padding: 24, borderRadius: 20, background: 'rgba(255,255,255,0.02)', 
      border: '1px solid rgba(255,255,255,0.05)', display: 'flex', 
      alignItems: 'center', gap: 20 
    }}>
       <div style={{ fontSize: 32 }}>{icon}</div>
       <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
          <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
       </div>
    </div>
  );
}
