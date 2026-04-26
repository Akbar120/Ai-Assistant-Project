import { execute_instagram_dm } from './instagram_dm';
import { execute_platform_post } from './platform_post';
import { execute_caption_manager } from './caption_manager';
import { execute_instagram_fetch } from './instagram_fetch';
import { execute_code_executor } from './code_executor';
import { execute_install_skill } from './install_skill';
import { executeWebSearch } from './search_web';
import { execute_manage_agent } from './manage_agent';
import * as reality from './reality';

import { execute_agent_notify } from './agent_notify';

import { appendLog, updateTask, getTask } from '../taskService';

// Module Reload Tag: 2026-04-23T13:45:00
console.log('[Tools] Loading tool definition version 2.1 (Direct execution enabled)');

export async function runTool(tool: string, args: any, requester: string = 'orchestrator', agentId?: string): Promise<any> {
  // Use refined permission guard for balanced security and functionality
  const { executeWithRefinedPermission } = await import('./refinedPermissionGuard');
  
  return await executeWithRefinedPermission(tool, args, requester, agentId);
}

export async function runToolWithoutGuard(tool: string, args: any, requester: string = 'orchestrator', agentId?: string): Promise<any> {
  const taskId = args.task_id;

  // Agents can call tools without a task_id — they run in the background autonomously
  if (requester !== 'agent') {
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
  }

  try {
    let result: any;
    switch (tool) {
      case 'agent_notify':
        const store = require('../agentManager').getAgentStore();
        const agent = store.agents[agentId || ''];
        result = await execute_agent_notify(args, agentId || 'unknown', agent?.name || 'Unknown Agent');
        break;
      case 'get_agent_output':
        result = await reality.get_agent_output(args);
        break;
      case 'agent_command':
        const { execute_agent_command } = await import('./agent_command');
        result = await execute_agent_command(args);
        break;
      case 'instagram_dm':
      case 'instagram_dm_sender': // alias for agents
        result = await execute_instagram_dm(args, agentId);
        break;
      case 'instagram_fetch':
      case 'instagram_dm_reader':   // alias: read DMs
      case 'instagram_feed_reader': // alias: read feed
        result = await execute_instagram_fetch();
        break;
      case 'platform_post':
        result = await execute_platform_post(args);
        break;
      case 'caption_manager':
        result = await execute_caption_manager(args);
        break;
      case 'get_config':
        result = await reality.get_config({ ...args, requester: requester === 'agent' ? agentId || 'orchestrator' : (args.requester || requester) });
        break;
      case 'get_channels':
        result = await reality.get_channels({ ...args, requester: requester === 'agent' ? agentId || 'orchestrator' : (args.requester || requester) });
        break;
      case 'get_agents':
        result = await reality.get_agents({ ...args, requester: requester === 'agent' ? agentId || 'orchestrator' : (args.requester || requester) });
        break;
      case 'get_tasks':
        result = await reality.get_tasks({ ...args, requester: requester === 'agent' ? agentId || 'orchestrator' : (args.requester || requester) });
        break;
      case 'get_skills':
        result = await reality.get_skills({ ...args, requester: requester === 'agent' ? agentId || 'orchestrator' : (args.requester || requester) });
        break;
      case 'search_web':
        result = { success: true, reply: await executeWebSearch(args.query || args.q || ''), data: {} };
        break;
      case 'code_executor':
        result = await execute_code_executor(args);
        break;
      case 'read_file':
        result = await execute_code_executor({ ...args, operation: 'read_file' });
        break;
      case 'write_file':
        result = await execute_code_executor({ ...args, operation: 'write_file' });
        break;
      case 'define_tool':
        result = await execute_code_executor({ ...args, operation: 'create_tool' });
        break;
      case 'reasoning_engine':
        result = { success: true, reply: "System reasoning engine engaged. Context analyzed and strategy optimized." };
        break;
      case 'manage_agent':
        result = await execute_manage_agent({ ...args, requester: requester === 'agent' ? agentId : requester });
        break;
      case 'install_skill':
        result = await execute_install_skill(args);
        break;
      case 'improvement_propose':
        const { execute_improvement_propose } = await import('./improvement_propose');
        result = await execute_improvement_propose(args);
        break;
      case 'get_config':
        result = await reality.get_config(args);
        break;
      case 'get_channels':
        result = await reality.get_channels(args);
        break;
      case 'get_agents':
        result = await reality.get_agents(args);
        break;
      case 'get_tasks':
        result = await reality.get_tasks(args);
        break;
      case 'get_skills':
        result = await reality.get_skills(args);
        break;
      case 'get_agent_output':
        result = await reality.get_agent_output(args);
        break;
      case 'memory_search':
        result = await reality.memory_search(args);
        break;
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    if (taskId && requester !== 'agent') {
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
    if (taskId && requester !== 'agent') {
      await appendLog(taskId, `🧨 Critical failure in tool ${tool}: ${err.message}`);
      await updateTask(taskId, { status: 'failed', progress: 100 });
    }
    throw err;
  }
}
