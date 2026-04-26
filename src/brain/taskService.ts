import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * ENHANCED TASK STATUS SYSTEM
 * 
 * New status types with clear meanings:
 * - created: Task just created, analyzing what to do
 * - planning: Analyzing tools and dependencies needed
 * - waiting_permission: Blocked - waiting for user approval
 * - ready: Ready to execute (permissions granted)
 * - processing: Actively executing tools
 * - waiting_input: Blocked - waiting for user input
 * - partial: Some tools completed, some failed
 * - completed: All tools executed successfully
 * - failed: Task failed (error or denied)
 * - abandoned: User cancelled the task
 */
export type TaskStatus = 'created' | 'planning' | 'waiting_permission' | 'ready' | 'processing' | 'waiting_input' | 'partial' | 'completed' | 'failed' | 'abandoned';
export type LogLevel = 'info' | 'warning' | 'error';

export interface LogItem {
  timestamp: string;
  level: LogLevel;
  step?: string;
  message: string;
  meta?: any;
}

export interface TaskStep {
  id: string;
  label: string;
  status: 'pending' | 'completed';
}

/**
 * Tool Execution Plan - Tracks what tools need to be executed
 */
export interface PlannedTool {
  id: string;
  name: string;
  args: Record<string, any>;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  estimatedDuration: number;
  requiresUserInput: boolean;
  dependsOn: string[];
  result?: any;
  error?: string;
}

export interface ToolExecutionPlan {
  tools: PlannedTool[];
  currentToolIndex: number;
  executionOrder: string[];
  dependencies: Record<string, string[]>;
  estimatedDuration: number;
  completedTools: string[];
  failedTools: string[];
}

/**
 * Permission Requirement - Tracks permissions needed for a task
 */
export interface PermissionRequirement {
  toolName: string;
  permissionLevel: 'safe' | 'major' | 'blocked';
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  respondedAt?: string;
  response?: string;
}

/**
 * Task Error - Tracks errors during task execution
 */
export interface TaskError {
  toolName?: string;
  step?: string;
  message: string;
  timestamp: string;
  recoverable: boolean;
}

/**
 * Enhanced Task Interface with tool planning and permission tracking
 */
export interface Task {
  id: string;
  type: string;
  name: string;
  description?: string;  // NEW: human-readable description
  
  owner: string; // The agent or process that owns this task
  locked: boolean; // If true, only owner can modify
  
  session_id?: string;
  source: string;
  
  status: TaskStatus;
  progress: number;
  
  steps: TaskStep[];
  
  // NEW: Tool execution plan
  toolPlan?: ToolExecutionPlan;
  
  // NEW: Permission tracking
  permissions?: PermissionRequirement[];
  
  // NEW: Error tracking
  errors?: TaskError[];
  
  logs: LogItem[];
  created_at: string;
  updated_at: string;
  
  // NEW: Links
  missing_fields?: string[];
  parent_id?: string;
  linked_notification_id?: string;
  
  // NEW: Timing
  started_at?: string;
  completed_at?: string;
  estimated_completion_time?: number;
  
  result?: any;
}

const TASKS_DIR = path.join(process.cwd(), 'src/data/tasks');

export const TASK_TEMPLATES: Record<string, string[]> = {
  create_agent: ['analyze_intent', 'provision_workspace', 'generate_dna', 'register_agent'],
  dataset_creation: ['parse_history', 'tag_turns', 'structure_json', 'persist_dataset'],
  sandbox: ['validate_sandbox_tool', 'execute_experiment', 'log_results'],
  execution: ['prepare_tools', 'execute_payload', 'verify_output'],
  generic: ['initialize', 'process', 'finalize'],
};

/**
 * Ensures the tasks directory exists.
 */
async function ensureDir() {
  try {
    await fs.mkdir(TASKS_DIR, { recursive: true });
  } catch (err) {}
}

/**
 * Generates a unique task ID.
 */
function generateId() {
  return `task_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates sub-tasks/steps based on a template type.
 */
function getStepsForType(type: string): TaskStep[] {
  const steps = TASK_TEMPLATES[type] || TASK_TEMPLATES.generic;
  return steps.map(label => ({
    id: label.toLowerCase().replace(/\s+/g, '_'),
    label: label.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    status: 'pending'
  }));
}

/**
 * Creates a new task and persists it to disk.
 */
export async function createTask(data: Partial<Task>): Promise<Task> {
  await ensureDir();
  const id = data.id || generateId();
  const now = new Date().toISOString();
  const type = data.type || 'generic';

  const task: Task = {
    id,
    type,
    name: data.name || 'Untitled Task',
    owner: data.owner || 'orchestrator',
    locked: data.locked ?? true, // Default to locked for safety
    session_id: data.session_id,
    source: data.source || 'orchestrator',
    status: 'created',
    progress: 0,
    steps: getStepsForType(type),
    logs: data.logs || [{
      timestamp: now,
      level: 'info',
      message: `[SYSTEM] Task "${data.name}" initialized.`,
    }],
    created_at: now,
    updated_at: now,
    parent_id: data.parent_id,
    ...data,
  };

  await fs.writeFile(
    path.join(TASKS_DIR, `${id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8'
  );

  return task;
}

/**
 * Checks if a task exists on disk.
 */
export async function exists(id: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path.join(TASKS_DIR, `${id}.json`));
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Fetches a task by ID.
 */
export async function getTask(id: string): Promise<Task | null> {
  try {
    const data = await fs.readFile(path.join(TASKS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Updates an existing task with new fields and logs.
 * Implements ownership & locking guards.
 */
export async function updateTask(id: string, updates: Partial<Task>, requester: string = 'orchestrator'): Promise<Task | null> {
  let task = await getTask(id);
  if (!task) return null;

  // Ownership Guard: Only owner can modify locked tasks
  if (task.locked && task.owner !== requester) {
    console.error(`[Task Guard] Update rejected for ${id}. Owner: ${task.owner}, Requester: ${requester}`);
    throw new Error(`Task ${id} is locked by ${task.owner}. Access denied.`);
  }

  // Lifecycle Enforcement with new status types
  // Enhanced transitions: created → planning → waiting_permission → ready → processing → completed/failed
  if (updates.status && updates.status !== task.status) {
    const current = task.status;
    const next = updates.status;

    const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
      'created': ['planning', 'waiting_permission', 'ready', 'processing', 'failed', 'abandoned'],
      'planning': ['waiting_permission', 'ready', 'failed', 'abandoned'],
      'waiting_permission': ['ready', 'processing', 'failed', 'abandoned'],
      'ready': ['processing', 'failed', 'abandoned'],
      'processing': ['waiting_input', 'completed', 'failed', 'partial'],
      'waiting_input': ['processing', 'abandoned', 'failed'],
      'partial': ['processing', 'completed', 'failed'],
      'completed': [],
      'failed': ['processing', 'ready', 'planning', 'abandoned'], // Allow retries
      'abandoned': ['processing', 'ready', 'planning', 'failed'] // Allow recovery
    };

    if (!allowedTransitions[current].includes(next)) {
      console.warn(`[Lifecycle Guard] Illegal transition: ${current} -> ${next}. Skipping status update.`);
      delete updates.status; 
    }
  }

  task = {
    ...task,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // Auto-calculate progress if steps are present
  if (task.steps.length > 0) {
    const completed = task.steps.filter(s => s.status === 'completed').length;
    task.progress = Math.round((completed / task.steps.length) * 100);
  }

  await fs.writeFile(
    path.join(TASKS_DIR, `${id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8'
  );

  return task;
}

/**
 * Marks a specific step as completed and updates task progress.
 */
export async function completeStep(id: string, stepId: string, requester: string = 'orchestrator') {
  const task = await getTask(id);
  if (!task) return;

  const step = task.steps.find(s => s.id === stepId || s.label === stepId);
  if (step) {
    step.status = 'completed';
    await updateTask(id, { steps: task.steps }, requester);
    await appendLog(id, `Step completed: ${step.label}`, 'info', requester, step.id);
  }
}

/**
 * Appends a structured log entry to a task.
 */
export async function appendLog(
  id: string, 
  message: string, 
  level: LogLevel = 'info', 
  requester: string = 'orchestrator',
  step?: string,
  meta?: any
) {
  const task = await getTask(id);
  if (!task) return;

  // Ownership Guard for logs
  if (task.locked && task.owner !== requester) return;

  const logItem: LogItem = {
    timestamp: new Date().toISOString(),
    level,
    step,
    message,
    meta
  };

  task.logs.push(logItem);
  task.updated_at = new Date().toISOString();

  await fs.writeFile(
    path.join(TASKS_DIR, `${id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8'
  );
}

/**
 * Retrieves all tasks from the filesystem.
 */
export async function getAllTasks(): Promise<Task[]> {
  await ensureDir();
  try {
    const files = await fs.readdir(TASKS_DIR);
    const tasks = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const content = await fs.readFile(path.join(TASKS_DIR, f), 'utf-8');
          return JSON.parse(content) as Task;
        })
    );
    return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    return [];
  }
}

// ============================================================================
// ENHANCED TASK FUNCTIONS
// ============================================================================

/**
 * Enhanced task creation with automatic tool analysis
 */
export async function createEnhancedTask(data: {
  id?: string;
  type: string;
  name: string;
  description?: string;
  source: string;
  requirements?: string;
  owner?: string;
  locked?: boolean;
  session_id?: string;
  logs?: LogItem[];
  toolPlan?: ToolExecutionPlan;
}): Promise<Task> {
  await ensureDir();
  const id = data.id || generateId();
  const now = new Date().toISOString();
  const type = data.type || 'generic';

  const task: Task = {
    id,
    type,
    name: data.name,
    description: data.description,
    owner: data.owner || 'orchestrator',
    locked: data.locked ?? true,
    session_id: data.session_id,
    source: data.source || 'orchestrator',
    status: 'created',
    progress: 0,
    steps: getStepsForType(type),
    toolPlan: data.toolPlan,
    permissions: [],
    errors: [],
    logs: data.logs || [{
      timestamp: now,
      level: 'info',
      message: `[SYSTEM] Task "${data.name}" created. Requirements: ${data.requirements || 'none'}`,
    }],
    created_at: now,
    updated_at: now,
  };

  await fs.writeFile(
    path.join(TASKS_DIR, `${id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8'
  );

  return task;
}

/**
 * Set task to waiting_permission status
 */
export async function setTaskWaitingPermission(
  taskId: string,
  permission: PermissionRequirement
): Promise<Task | null> {
  const task = await getTask(taskId);
  if (!task) return null;

  const updatedPermissions = [...(task.permissions || []), permission];
  
  // Check if this is first permission needed
  const wasWaiting = task.status === 'waiting_permission';
  
  const updatedTask = await updateTask(taskId, {
    status: wasWaiting ? 'waiting_permission' : 'waiting_permission',
    permissions: updatedPermissions,
    logs: [...task.logs, {
      timestamp: new Date().toISOString(),
      level: 'info',
      step: permission.toolName,
      message: `Permission required for ${permission.toolName} (${permission.permissionLevel})`
    }]
  });

  return updatedTask;
}

/**
 * Handle permission response for a task
 */
export async function respondToTaskPermission(
  taskId: string,
  toolName: string,
  approved: boolean,
  response?: string
): Promise<Task | null> {
  const task = await getTask(taskId);
  if (!task) return null;

  // Update the specific permission
  const updatedPermissions = (task.permissions || []).map(p => {
    if (p.toolName === toolName) {
      return {
        ...p,
        status: (approved ? 'approved' : 'denied') as 'approved' | 'denied',
        respondedAt: new Date().toISOString(),
        response: response
      };
    }
    return p;
  });

  // Check if all required permissions are approved
  const pendingPerms = updatedPermissions.filter(p => p.status === 'pending');
  const allApproved = pendingPerms.length === 0;
  const anyDenied = updatedPermissions.some(p => p.status === 'denied');

  // Determine new status
  let newStatus: TaskStatus = task.status;
  if (allApproved) {
    newStatus = 'ready';
  } else if (anyDenied) {
    newStatus = 'failed';
  }

  // Determine progress based on permissions
  const approvedCount = updatedPermissions.filter(p => p.status === 'approved').length;
  const totalPerms = updatedPermissions.length;
  const permProgress = totalPerms > 0 ? Math.round((approvedCount / totalPerms) * 30) : 0; // Permissions = 30% of progress

  const newLog = {
    timestamp: new Date().toISOString(),
    level: (approved ? 'info' : 'warning') as LogLevel,
    step: toolName,
    message: `Permission ${approved ? 'approved' : 'denied'} for ${toolName}`,
    meta: { response }
  };

  const updatedTask = await updateTask(taskId, {
    status: newStatus,
    permissions: updatedPermissions,
    progress: task.progress + permProgress,
    logs: [...task.logs, newLog]
  });

  return updatedTask;
}

/**
 * Update tool execution progress in a task
 */
export async function updateToolExecutionProgress(
  taskId: string,
  toolName: string,
  status: 'executing' | 'completed' | 'failed',
  result?: any,
  error?: string
): Promise<void> {
  const task = await getTask(taskId);
  if (!task || !task.toolPlan) return;

  // Update the tool in the plan
  const updatedTools = task.toolPlan.tools.map(tool => {
    if (tool.name === toolName) {
      return {
        ...tool,
        status: (status === 'executing' ? 'executing' : (status === 'completed' ? 'completed' : 'failed')) as any,
        result: result,
        error: error
      };
    }
    return tool;
  });

  // Update completed/failed lists
  const completedTools = updatedTools.filter(t => t.status === 'completed').map(t => t.name);
  const failedTools = updatedTools.filter(t => t.status === 'failed').map(t => t.name);

  // Calculate progress (tool execution = 70% of total progress)
  const totalTools = updatedTools.length;
  const completedCount = completedTools.length;
  const failedCount = failedTools.length;
  const toolProgress = totalTools > 0 ? Math.round(((completedCount + failedCount) / totalTools) * 70) : 0;

  // Base progress from permissions (30%)
  const permProgress = task.permissions ? 
    Math.round((task.permissions.filter(p => p.status === 'approved').length / Math.max(task.permissions.length, 1)) * 30) : 0;

  // Determine overall status
  let newStatus: TaskStatus = task.status;
  if (failedCount > 0 && completedCount + failedCount === totalTools) {
    newStatus = 'partial';
  } else if (failedCount > 0) {
    newStatus = 'failed';
  } else if (completedCount === totalTools) {
    newStatus = 'completed';
  } else if (status === 'executing') {
    newStatus = 'processing';
  }

  const newLog = {
    timestamp: new Date().toISOString(),
    level: status === 'failed' ? 'error' as const : 'info' as const,
    step: toolName,
    message: `Tool ${toolName} ${status}: ${error || (result?.success ? 'completed successfully' : 'completed')}`,
    meta: { result, error }
  };

  await updateTask(taskId, {
    status: newStatus,
    progress: permProgress + toolProgress,
    toolPlan: {
      ...task.toolPlan,
      tools: updatedTools,
      completedTools,
      failedTools
    },
    logs: [...task.logs, newLog],
    completed_at: newStatus === 'completed' ? new Date().toISOString() : undefined
  });
}

/**
 * Get tasks filtered by waiting status
 */
export async function getTasksByWaitingStatus(
  waitingFor: 'permission' | 'input' | 'any'
): Promise<Task[]> {
  const tasks = await getAllTasks();
  
  switch (waitingFor) {
    case 'permission':
      return tasks.filter(t => t.status === 'waiting_permission');
    case 'input':
      return tasks.filter(t => t.status === 'waiting_input');
    case 'any':
      return tasks.filter(t => 
        t.status === 'waiting_permission' || 
        t.status === 'waiting_input'
      );
    default:
      return tasks;
  }
}

/**
 * Get task by linked notification ID
 */
export async function getTaskByNotificationId(notificationId: string): Promise<Task | null> {
  const tasks = await getAllTasks();
  return tasks.find(t => t.linked_notification_id === notificationId) || null;
}
