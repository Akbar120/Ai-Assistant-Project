import { NextRequest, NextResponse } from 'next/server';
import { getAllTasks, createTask, updateTask, TaskStatus } from '@/brain/taskService';

export const runtime = 'nodejs';

/**
 * GET - List all tasks with optional status filter
 * Usage: GET /api/tasks?status=processing
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') as TaskStatus | 'all' | null;

    let tasks = await getAllTasks();

    if (statusFilter && statusFilter !== 'all') {
      tasks = tasks.filter(t => t.status === statusFilter);
    }

    return NextResponse.json(tasks);
  } catch (err) {
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
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

/**
 * PATCH - Update task status, progress, or add logs
 */
export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, ...updates } = data;

    if (!id) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const updatedTask = await updateTask(id, updates);
    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(updatedTask);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
