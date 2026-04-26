import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks, createTask, updateTask, TaskStatus, getTasksByWaitingStatus, getTask } from '@/brain/taskService';
import { handleTaskPermissionResponse } from '@/brain/taskPermissionService';

export const runtime = 'nodejs';

/**
 * GET - List all tasks with optional status filter
 * Usage: 
 *   GET /api/tasks 
 *   GET /api/tasks?status=processing
 *   GET /api/tasks?waiting_for=permission  (NEW)
 *   GET /api/tasks?waiting_for=input      (NEW)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') as TaskStatus | 'all' | null;
    const waitingFor = searchParams.get('waiting_for') as 'permission' | 'input' | 'any' | null;
    const taskId = searchParams.get('id');

    // Get single task by ID
    if (taskId) {
      const task = await getTask(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json(task);
    }

    // Filter by waiting status
    if (waitingFor) {
      const tasks = await getTasksByWaitingStatus(waitingFor);
      return NextResponse.json(tasks);
    }

    let tasks = await getAllTasks();

    if (statusFilter && statusFilter !== 'all') {
      tasks = tasks.filter(t => t.status === statusFilter);
    }

    return NextResponse.json(tasks);
  } catch (err) {
    console.error('[Tasks API] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/**
 * POST - Create a new task
 */
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const task = await createTask(data);
    return NextResponse.json(task);
  } catch (err) {
    console.error('[Tasks API] POST error:', err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

/**
 * PATCH - Update task status, progress, or add logs
 * Also handles permission responses (NEW)
 */
export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, ...updates } = data;

    if (!id) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    // Handle permission response (NEW)
    if (data.action === 'respond_permission') {
      const { notificationId, approved, message } = data;
      
      if (!notificationId) {
        return NextResponse.json({ error: 'Notification ID required' }, { status: 400 });
      }

      const result = await handleTaskPermissionResponse(notificationId, approved, message);
      
      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        task: result.task,
        message: result.message
      });
    }

    // Handle regular task updates (existing functionality)
    const updatedTask = await updateTask(id, updates);
    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(updatedTask);
  } catch (err) {
    console.error('[Tasks API] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
