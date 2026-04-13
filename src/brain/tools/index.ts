import { execute_instagram_dm } from './instagram_dm';
import { execute_platform_post } from './platform_post';
import { execute_caption_manager } from './caption_manager';
import { execute_instagram_fetch } from './instagram_fetch';

import { appendLog, updateTask } from '../taskService';

export async function runTool(tool: string, args: any, requester: string = 'orchestrator') {
  const taskId = args.task_id;

  if (!taskId) {
    throw new Error(`[Security Guard] Tool ${tool} blocked: No active task_id provided.`);
  }

  const task = await getTask(taskId);
  if (!task) {
    throw new Error(`[Security Guard] Tool ${tool} blocked: Task ${taskId} not found.`);
  }

  if (task.status === 'waiting_input') {
    throw new Error(`[Execution Guard] Tool ${tool} blocked: Task is awaiting user input. Cannot execute.`);
  }

  await appendLog(taskId, `⚙️ Initiating tool: ${tool}...`, 'info', requester, 'execute_payload');
  await updateTask(taskId, { status: 'processing' }, requester);

  try {
    let result: any;
    switch (tool) {
      case 'instagram_dm':
        result = await execute_instagram_dm(args);
        break;
      case 'instagram_fetch':
        result = await execute_instagram_fetch();
        break;
      case 'platform_post':
        result = await execute_platform_post(args);
        break;
      case 'caption_manager':
        result = await execute_caption_manager(args);
        break;
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    if (taskId) {
      if (result.success) {
        await appendLog(taskId, `✅ Tool ${tool} completed successfully.`);
        await updateTask(taskId, { status: 'completed', progress: 100 });
      } else {
        await appendLog(taskId, `❌ Tool ${tool} failed: ${result.error || result.reply}`);
        await updateTask(taskId, { status: 'failed', progress: 100 });
      }
    }

    return result;
  } catch (err: any) {
    if (taskId) {
      await appendLog(taskId, `🧨 Critical failure in tool ${tool}: ${err.message}`);
      await updateTask(taskId, { status: 'failed', progress: 100 });
    }
    throw err;
  }
}
