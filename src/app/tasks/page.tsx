'use client';
import { useState, useEffect } from 'react';

// ─── Types (Production Grade) ──────────────────────────────────────────────────

type TaskStatus = 'created' | 'planning' | 'waiting_permission' | 'ready' | 'processing' | 'waiting_input' | 'partial' | 'completed' | 'failed' | 'abandoned';
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

interface PlannedTool {
  id: string;
  name: string;
  args: Record<string, any>;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
}

interface ToolExecutionPlan {
  tools: PlannedTool[];
  currentToolIndex: number;
}

interface PermissionRequirement {
  toolName: string;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
}

interface Task {
  id: string;
  type: string;
  name: string;
  description?: string;
  owner: string;
  status: TaskStatus;
  progress: number;
  steps: TaskStep[];
  toolPlan?: ToolExecutionPlan;
  permissions?: PermissionRequirement[];
  logs: LogItem[];
  created_at: string;
  updated_at: string;
  linked_notification_id?: string;
}

// ─── Status Styles ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { color: string, label: string }> = {
  created: { color: '#94a3b8', label: 'Created' },
  planning: { color: '#8b5cf6', label: 'Planning' },
  waiting_permission: { color: '#f59e0b', label: 'Waiting Permission' },
  ready: { color: '#22c55e', label: 'Ready' },
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

function TaskCard({ task, onApprovePermission, onDenyPermission }: { 
  task: Task; 
  onApprovePermission?: (toolName: string) => void;
  onDenyPermission?: (toolName: string) => void;
}) {
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

      {/* PERMISSION REQUIREMENTS */}
      {task.permissions && task.permissions.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#f59e0b' }}>🔒 Required Permissions</div>
          {task.permissions.map((perm, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < (task.permissions?.length || 0) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>{perm.status === 'pending' ? '⏳' : perm.status === 'approved' ? '✅' : '❌'}</span>
                <span style={{ fontSize: 13 }}>{perm.toolName}</span>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: perm.permissionLevel === 'major' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: perm.permissionLevel === 'major' ? '#f59e0b' : '#ef4444' }}>{perm.permissionLevel}</span>
              </div>
              {perm.status === 'pending' && onApprovePermission && onDenyPermission && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onApprovePermission(perm.toolName); }}
                    style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: 'none', background: '#22c55e', color: 'white', cursor: 'pointer' }}
                  >
                    Approve
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDenyPermission(perm.toolName); }}
                    style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer' }}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TOOL EXECUTION PLAN */}
      {task.toolPlan && task.toolPlan.tools.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>🛠️ Execution Plan</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {task.toolPlan.tools.map((tool, i) => (
              <div key={i} style={{ 
                display: 'flex', alignItems: 'center', gap: 6, 
                fontSize: 11, padding: '6px 10px', borderRadius: 8,
                background: tool.status === 'completed' ? 'rgba(34,197,94,0.1)' : 
                           tool.status === 'executing' ? 'rgba(250,204,21,0.1)' :
                           tool.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.2)',
                border: tool.status === 'completed' ? '1px solid rgba(34,197,94,0.3)' : 
                       tool.status === 'executing' ? '1px solid rgba(250,204,21,0.3)' :
                       tool.status === 'failed' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.05)',
                opacity: tool.status === 'completed' || tool.status === 'executing' ? 1 : 0.5
              }}>
                <span>{tool.status === 'completed' ? '✅' : tool.status === 'executing' ? '⚡' : tool.status === 'failed' ? '❌' : '⏳'}</span>
                <span style={{ fontWeight: 600 }}>{tool.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* STEP CHECKLIST */}
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

type TabType = 'Active' | 'Waiting Permission' | 'Waiting Input' | 'Completed' | 'Failed';

const ACTIVE_STATUSES: TaskStatus[] = ['created', 'planning', 'ready', 'processing'];
const WAITING_PERMISSION_STATUSES: TaskStatus[] = ['waiting_permission'];
const WAITING_INPUT_STATUSES: TaskStatus[] = ['waiting_input'];
const COMPLETED_STATUSES: TaskStatus[] = ['completed', 'partial'];
const FAILED_STATUSES: TaskStatus[] = ['failed', 'abandoned'];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('Active');

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
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
  }, []);

  const handlePermissionResponse = async (taskId: string, toolName: string, approved: boolean) => {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond_permission',
          notificationId: tasks.find(t => t.id === taskId)?.linked_notification_id,
          approved,
          message: approved ? 'Approved via task panel' : 'Denied via task panel'
        })
      });
      fetchTasks();
    } catch (e) {
      console.error('Failed to respond to permission:', e);
    }
  };

  const activeTasks = tasks.filter(t => ACTIVE_STATUSES.includes(t.status));
  const waitingPermissionTasks = tasks.filter(t => WAITING_PERMISSION_STATUSES.includes(t.status));
  const waitingInputTasks = tasks.filter(t => WAITING_INPUT_STATUSES.includes(t.status));
  const completedTasks = tasks.filter(t => COMPLETED_STATUSES.includes(t.status));
  const failedTasks = tasks.filter(t => FAILED_STATUSES.includes(t.status));

  const getDisplayTasks = () => {
    switch (activeTab) {
      case 'Active': return activeTasks;
      case 'Waiting Permission': return waitingPermissionTasks;
      case 'Waiting Input': return waitingInputTasks;
      case 'Completed': return completedTasks;
      case 'Failed': return failedTasks;
      default: return [];
    }
  };

  const displayTasks = getDisplayTasks();

  return (
    <div style={{ padding: '40px', background: 'var(--bg-main)', minHeight: '100%' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        <header style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>Mission Control</h1>
          <p style={{ opacity: 0.6, marginTop: 8 }}>Real task execution only — no casual chat noise.</p>
        </header>

        {/* STATS BAR */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20, marginBottom: 36 }}>
          <StatCard label="Active" value={activeTasks.length} icon="⚡" />
          <StatCard label="Waiting Permission" value={waitingPermissionTasks.length} icon="🔒" />
          <StatCard label="Waiting Input" value={waitingInputTasks.length} icon="💬" />
          <StatCard label="Completed" value={completedTasks.length} icon="✅" />
          <StatCard label="Failed" value={failedTasks.length} icon="🧨" />
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', marginBottom: 28, flexWrap: 'wrap' }}>
          {(['Active', 'Waiting Permission', 'Waiting Input', 'Completed', 'Failed'] as TabType[]).map(tab => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {tab === 'Active' ? '⚡' : tab === 'Waiting Permission' ? '🔒' : tab === 'Waiting Input' ? '💬' : tab === 'Completed' ? '✅' : '🧨'} {tab}
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 10,
                background: activeTab === tab ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.05)',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: 800
              }}>
                {tab === 'Active' ? activeTasks.length : tab === 'Waiting Permission' ? waitingPermissionTasks.length : tab === 'Waiting Input' ? waitingInputTasks.length : tab === 'Completed' ? completedTasks.length : failedTasks.length}
              </span>
            </div>
          ))}
        </div>

        {/* TASK LIST */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading && displayTasks.length === 0 ? (
            <div style={{ padding: '80px', textAlign: 'center', opacity: 0.5 }}>Loading missions...</div>
          ) : displayTasks.length === 0 ? (
            <div style={{ padding: '80px', textAlign: 'center', opacity: 0.3, border: '2px dashed var(--border-subtle)', borderRadius: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{activeTab === 'Active' ? '🟢' : activeTab === 'Waiting Permission' ? '🔒' : activeTab === 'Waiting Input' ? '💬' : activeTab === 'Completed' ? '📦' : '💀'}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {activeTab === 'Active' ? 'No active tasks right now' : 
                 activeTab === 'Waiting Permission' ? 'No tasks waiting for permission' :
                 activeTab === 'Waiting Input' ? 'No tasks waiting for input' :
                 activeTab === 'Completed' ? 'No completed tasks yet' : 'No failed tasks'}
              </div>
              <div style={{ fontSize: 13, marginTop: 8, opacity: 0.7 }}>
                {activeTab === 'Active' ? 'Tasks only appear when Jenny is doing real work — not for casual chat.' : 
                 activeTab === 'Waiting Permission' ? 'Tasks requiring your approval will appear here.' :
                 activeTab === 'Waiting Input' ? 'Tasks needing more information from you will appear here.' :
                 'Completed agent creation, tool runs, and skill executions will appear here.'}
              </div>
            </div>
          ) : (
            displayTasks.map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onApprovePermission={(toolName) => handlePermissionResponse(task.id, toolName, true)}
                onDenyPermission={(toolName) => handlePermissionResponse(task.id, toolName, false)}
              />
            ))
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

