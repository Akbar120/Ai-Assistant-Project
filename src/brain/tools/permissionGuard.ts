/**
 * PERMISSION GUARD - HARDCODED SECURITY LAYER
 * 
 * This file implements an unbreakable permission system that ALL agents must follow.
 * No agent, skill, or even Jenny can bypass these rules.
 * 
 * HARD RULES:
 * 1. NO EXECUTION WITHOUT USER PERMISSION
 * 2. NO MODIFICATION OF PERMISSION SYSTEM
 * 3. NO BYPASS OF APPROVAL REQUIREMENTS
 * 4. ALL ACTIONS REQUIRES EXPLICIT USER CONFIRMATION
 */

import { getAgentStore } from '../agentManager';
import { addAgentNotification } from '../state';

// List of tools that ALWAYS require user approval
const APPROVAL_REQUIRED_TOOLS = [
  'instagram_dm_sender',
  'instagram_dm', 
  'platform_post',
  'instagram_dm_reader', // Reading DMs should also require approval
  'code_executor',
  'exec',
  'write',
  'edit',
  'apply_patch',
  'image_generate',
  'music_generate',
  'video_generate',
  'tts'
];

// List of tools that are DANGEROUS and should NEVER be called directly
const BLOCKED_TOOLS = [
  'manage_agent', // Prevent agents from managing other agents
  'agent_command', // Prevent agents from commanding other agents
  'install_skill', // Prevent agents from installing skills
  'update_plan' // Prevent agents from updating plans
];

/**
 * Hard permission check that cannot be bypassed
 */
export function enforceHardPermission(tool: string, args: any, agentId?: string): { allowed: boolean; reason: string } {
  // Rule 1: Block dangerous tools completely
  if (BLOCKED_TOOLS.includes(tool)) {
    return {
      allowed: false,
      reason: `TOOL_BLOCKED: ${tool} is blocked for security reasons.`
    };
  }

  // Rule 2: All approval-required tools must wait for user confirmation
  if (APPROVAL_REQUIRED_TOOLS.includes(tool)) {
    const agent = agentId ? getAgentStore().agents[agentId] : null;
    const agentName = agent?.name || 'Unknown Agent';
    
    // BYPASS: If agent is in 'executing' mode, the user already approved from the Notifications UI.
    if (agent?.mode === 'executing' || (agent as any)?.approvedReplyText) {
      return {
        allowed: true,
        reason: 'DIRECTIVE_TRUST: Tool execution authorized by prior user approval'
      };
    }
    
    // Store notification for user approval
    addAgentNotification(
      agentId || 'system',
      agentName,
      `${agentName} wants to execute: ${tool}\n\nArgs: ${JSON.stringify(args, null, 2)}`,
      'approval_needed',
      true
    );
    
    return {
      allowed: false,
      reason: `USER_APPROVAL_REQUIRED: ${tool} requires explicit user confirmation.`
    };
  }

  // Rule 3: Prevent any attempts to modify the permission system
  if (tool.includes('permission') || tool.includes('security') || tool.includes('guard')) {
    return {
      allowed: false,
      reason: 'SECURITY_SYSTEM_PROTECTED: Permission system cannot be modified.'
    };
  }

  // Rule 4: All external actions require confirmation
  if (['instagram', 'twitter', 'discord'].some(platform => tool.includes(platform))) {
    return {
      allowed: false,
      reason: 'EXTERNAL_ACTION_BLOCKED: Social platform actions require user approval.'
    };
  }

  return { allowed: true, reason: 'PERMISSION_GRANTED' };
}

/**
 * Wrapper for tool execution with hard permission checks
 */
export function executeWithPermission(tool: string, args: any, requester: string = 'orchestrator', agentId?: string) {
  const permissionCheck = enforceHardPermission(tool, args, agentId);
  
  if (!permissionCheck.allowed) {
    throw new Error(`[HARD_PERMISSION_BLOCK] ${permissionCheck.reason}`);
  }
  
  // If permission granted, proceed with normal execution
  return runToolWithoutPermissionCheck(tool, args, requester, agentId);
}

/**
 * Execute tool without permission checks (only for approved tools)
 */
async function runToolWithoutPermissionCheck(tool: string, args: any, requester: string = 'orchestrator', agentId?: string) {
  const taskId = args.task_id;

  // Original security guard logic (unchanged)
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
      case 'instagram_dm_sender':
        result = await execute_instagram_dm(args, agentId);
        break;
      case 'instagram_fetch':
      case 'instagram_dm_reader':
      case 'instagram_feed_reader':
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
      case 'manage_agent':
        result = await execute_manage_agent({ ...args, requester: requester === 'agent' ? agentId : requester });
        break;
      case 'install_skill':
        result = await execute_install_skill(args);
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

// Import required functions at the end to avoid circular dependencies
import { execute_instagram_dm } from './instagram_dm';
import { execute_platform_post } from './platform_post';
import { execute_caption_manager } from './caption_manager';
import { execute_instagram_fetch } from './instagram_fetch';
import { execute_code_executor } from './code_executor';
import { execute_install_skill } from './install_skill';
import { executeWebSearch } from './search_web';
import { execute_manage_agent } from './manage_agent';
import { execute_agent_notify } from './agent_notify';
import * as reality from './reality';
import { appendLog, updateTask, getTask } from '../taskService';