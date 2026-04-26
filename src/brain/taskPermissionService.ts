/**
 * TASK PERMISSION SERVICE
 * 
 * Manages permissions for tasks, links notifications to tasks,
 * and handles user approval/denial flows.
 * 
 * This service bridges:
 * - The task system (src/brain/taskService.ts)
 * - The permission guard (src/brain/tools/refinedPermissionGuard.ts)
 * - The notification system (src/brain/state.ts)
 */

import { getTask, updateTask, respondToTaskPermission, Task } from './taskService';
import { addAgentNotification, updateNotificationStatus, AgentNotification } from './state';
import { classifyTool } from './tools/refinedPermissionGuard';
import { isExecutionApproved } from './modeManager';

export interface TaskPermissionRequest {
  taskId: string;
  toolName: string;
  args: any;
  agentId: string;
  agentName: string;
  permissionLevel?: string;
  reason?: string;
}

/**
 * Create a permission notification linked to a task
 * This is called when an agent tries to use a tool that requires approval
 * 
 * 🔥 If execution was already approved via confirmation mode,
 *    skip permission check entirely
 */
export async function createTaskPermissionNotification(
  request: TaskPermissionRequest
): Promise<{
  allowed: boolean;
  notification: AgentNotification | null;
  task: Task | null;
}> {
  const { taskId, toolName, args, agentId, agentName } = request;
  
  // 🔥 CHECK: If execution was approved, skip permission entirely
  if (isExecutionApproved()) {
    console.log('[TaskPermission] ✅ Execution already approved — skipping permission check');
    return {
      allowed: true,
      notification: null,
      task: null
    };
  }
  
  // Get the task to update it
  const task = await getTask(taskId);
  if (!task) {
    console.error('[TaskPermission] Task not found:', taskId);
    return {
      allowed: false,
      notification: null,
      task: null
    };
  }
  
  // Create notification with detailed information
  const notificationMessage = generatePermissionRequestMessage(request, task);
  
  const notification = addAgentNotification(
    agentId,
    agentName,
    notificationMessage,
    'approval_needed',
    true  // requiresApproval - always true for task permissions
  );
  
  if (!notification) {
    return {
      allowed: false,
      notification: null,
      task: null
    };
  }
  
  // Update task with permission requirement
  const permissionLevel = classifyTool(toolName, agentId);
  
  const updatedTask = await updateTask(taskId, {
    status: 'waiting_permission',
    linked_notification_id: notification.id,
    permissions: [
      ...(task.permissions || []),
      {
        toolName,
        permissionLevel,
        status: 'pending',
        requestedAt: new Date().toISOString()
      }
    ],
    logs: [
      ...task.logs,
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        step: toolName,
        message: `Permission requested for ${toolName} (${permissionLevel})`,
        meta: { notificationId: notification.id }
      }
    ]
  });
  
  return {
    allowed: false,  // Block execution until approved
    notification,
    task: updatedTask
  };
}

/**
 * Handle user's response to a permission request
 * Called when user approves or denies a permission in chat or notification panel
 */
export async function handleTaskPermissionResponse(
  notificationId: string,
  approved: boolean,
  userMessage?: string
): Promise<{
  success: boolean;
  task: Task | null;
  message: string;
}> {
  // Find task by linked notification
  const tasks = await getAllTasks();
  const task = tasks.find(t => t.linked_notification_id === notificationId);
  
  if (!task) {
    return {
      success: false,
      task: null,
      message: 'Task not found for this notification'
    };
  }
  
  // Find the pending permission in this task
  const pendingPermission = task.permissions?.find(
    p => p.status === 'pending'
  );
  
  if (!pendingPermission) {
    return {
      success: false,
      task: null,
      message: 'No pending permission found for this task'
    };
  }
  
  // Update the permission status
  const updatedTask = await respondToTaskPermission(
    task.id,
    pendingPermission.toolName,
    approved,
    userMessage
  );
  
  if (!updatedTask) {
    return {
      success: false,
      task: null,
      message: 'Failed to update task permission status'
    };
  }
  
  // Update notification status
  await updateNotificationStatus(
    notificationId,
    approved ? 'handled' : 'abandoned',
    { respondedAt: new Date().toISOString() } as any
  );
  
  const statusMessage = approved 
    ? `Permission approved for ${pendingPermission.toolName}`
    : `Permission denied for ${pendingPermission.toolName}`;
  
  return {
    success: true,
    task: updatedTask,
    message: statusMessage
  };
}

/**
 * Get all tasks waiting for user permission
 */
export async function getTasksWaitingPermission(): Promise<Task[]> {
  const tasks = await getAllTasks();
  return tasks.filter(t => t.status === 'waiting_permission');
}

/**
 * Get tasks waiting for user input
 */
export async function getTasksWaitingInput(): Promise<Task[]> {
  const tasks = await getAllTasks();
  return tasks.filter(t => t.status === 'waiting_input');
}

/**
 * Generate a user-friendly permission request message
 */
function generatePermissionRequestMessage(request: TaskPermissionRequest, task: Task): string {
  const { toolName, args, agentName, permissionLevel, reason } = request;
  
  const argsSummary = formatToolArguments(toolName, args);
  
  return `
🔒 **Permission Required for Task**

**Task:** ${task.name}
**Task ID:** ${task.id}
**Agent:** ${agentName}
**Tool:** ${toolName}
**Permission Level:** ${(permissionLevel || 'STANDARD').toUpperCase()}

**Task Description:**
${task.description || task.name}

**Tool Details:**
${argsSummary}

${reason ? `**Reason:** ${reason}` : ''}

**Action Required:**
Please confirm or deny this action by replying "yes" or "no"
`.trim();
}

/**
 * Format tool arguments for display in notifications
 */
function formatToolArguments(toolName: string, args: Record<string, any>): string {
  // Remove sensitive or verbose fields
  const safeArgs = { ...args };
  delete safeArgs.task_id;
  delete safeArgs.requesting_user;
  
  const entries = Object.entries(safeArgs);
  
  if (entries.length === 0) {
    return 'No additional details';
  }
  
  return entries
    .slice(0, 5)  // Show max 5 args
    .map(([key, value]) => {
      const valStr = typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : String(value);
      return `• ${key}: ${valStr}`;
    })
    .join('\n');
}

/**
 * Get permission status summary for a task
 */
export function getTaskPermissionSummary(task: Task): {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  allApproved: boolean;
  anyDenied: boolean;
} {
  const permissions = task.permissions || [];
  
  return {
    total: permissions.length,
    pending: permissions.filter(p => p.status === 'pending').length,
    approved: permissions.filter(p => p.status === 'approved').length,
    denied: permissions.filter(p => p.status === 'denied').length,
    allApproved: permissions.length > 0 && permissions.every(p => p.status === 'approved'),
    anyDenied: permissions.some(p => p.status === 'denied')
  };
}

/**
 * Check if a task is ready to execute (all permissions approved)
 */
export function isTaskReadyToExecute(task: Task): boolean {
  const summary = getTaskPermissionSummary(task);
  return task.status === 'ready' || 
         (task.status === 'waiting_permission' && summary.allApproved);
}

// Import getAllTasks for finding tasks by notification
import { getAllTasks } from './taskService';