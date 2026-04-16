import fs from 'fs/promises';
import path from 'path';

export type TaskStatus = 'created' | 'processing' | 'waiting_input' | 'partial' | 'completed' | 'failed' | 'abandoned';
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

export interface Task {
  id: string;
  type: string;
  name: string;
  owner: string; // The agent or process that owns this task
  locked: boolean; // If true, only owner can modify
  session_id?: string;
  source: string;
  status: TaskStatus;
  progress: number;
  steps: TaskStep[];
  logs: LogItem[];
  created_at: string;
  updated_at: string;
  missing_fields?: string[];
  parent_id?: string;
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

  // Lifecycle Enforcement: created -> processing -> (waiting_input <-> processing) -> completed/failed
  if (updates.status && updates.status !== task.status) {
    const current = task.status;
    const next = updates.status;

    const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
      'created': ['processing', 'failed', 'abandoned'],
      'processing': ['waiting_input', 'completed', 'failed', 'partial'],
      'waiting_input': ['processing', 'abandoned', 'failed'],
      'partial': ['processing', 'completed', 'failed'],
      'completed': [],
      'failed': [],
      'abandoned': []
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
