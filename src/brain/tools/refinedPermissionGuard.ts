/**
 * ENHANCED PERMISSION GUARD WITH TASK INTEGRATION
 * 
 * This system provides:
 * 1. Safe tools are always accessible (read-only, safe operations)
 * 2. Major tools require user approval (monitoring + confirmation)
 * 3. Dangerous tools are completely blocked
 * 4. Agents can perform their tasks with proper oversight
 * 5. NEW: Integration with task system for permission tracking
 */

import { getAgentStore } from '../agentManager';
import { addAgentNotification } from '../state';
import { createTaskPermissionNotification } from '../taskPermissionService';
import { isExecutionApproved } from '../modeManager';

// Category 1: ALWAYS SAFE - No approval needed
const SAFE_TOOLS = [
  'read',
  'get_tasks', 
  'get_agents',
  'get_config',
  'get_channels',
  'get_skills',
  'sessions_list',
  'sessions_history',
  'sessions_status',
  'memory_search',
  'memory_get',
  'search_web',
  'web_fetch',
  'image',
  'sessions_yield',
  'get_agent_output',
  'agent_notify',
  'instagram_dm_reader',
  'instagram_feed_reader',
  'improvement_propose',
  'read_file',
  'reasoning_engine'
];

// Category 2: MAJOR TOOLS - Require user approval with monitoring
const MAJOR_TOOLS = [
  'instagram_dm_sender', 
  'platform_post',
  'caption_manager',
  'code_executor',
  'exec',
  'write',
  'edit',
  'apply_patch',
  'write_file',
  'define_tool',
  'image_generate',
  'music_generate',
  'video_generate',
  'tts',
  'cron',
  'gateway',
  'browser',
  'canvas'
];

// Category 3: DANGEROUS TOOLS - Completely blocked (admin only)
const BLOCKED_TOOLS = [
  'manage_agent', // Only admin should manage agents
  'agent_command', // Only admin should command agents
  'install_skill', // Only admin should install skills
  'update_plan' // Only admin should update plans
];



/**
 * Tool classification for permission management
 * Special handling for Jenny (system orchestrator) - she can request blocked tools but needs approval
 */
export function classifyTool(tool: string, agentId?: string): 'safe' | 'major' | 'blocked' {
  const normalizedTool = tool.trim().toLowerCase();
  
  // Special case: Jenny can request blocked tools but needs approval (treated as major)
  if (agentId === 'system_jenny' && BLOCKED_TOOLS.includes(normalizedTool)) {
    return 'major';
  }
  
  if (SAFE_TOOLS.includes(normalizedTool)) return 'safe';
  if (MAJOR_TOOLS.includes(normalizedTool)) return 'major';
  if (BLOCKED_TOOLS.includes(normalizedTool)) return 'blocked';
  return 'major'; // Default to major for unknown tools
}

/**
 * Enhanced permission check with monitoring
 */
export function enforceRefinedPermission(tool: string, args: any, agentId?: string): { 
  allowed: boolean; 
  reason: string;
  requiresApproval: boolean;
  monitoringLevel: 'none' | 'basic' | 'detailed';
} {
  const agent = agentId ? getAgentStore().agents[agentId] : null;
  const agentName = agent?.name || 'Unknown Agent';
  
  // Check tool classification (with Jenny special case)
  const classification = classifyTool(tool, agentId);
  
  switch (classification) {
    case 'safe':
      return {
        allowed: true,
        reason: 'SAFE_TOOL: Tool approved for immediate use',
        requiresApproval: false,
        monitoringLevel: 'none'
      };
      
    case 'blocked':
      return {
        allowed: false,
        reason: `TOOL_BLOCKED: ${tool} is restricted to admin use only`,
        requiresApproval: false,
        monitoringLevel: 'none'
      };
      
    case 'major':
      // 🔥 GLOBAL BYPASS: If global execution was approved (confirmation mode), skip permission
      if (isExecutionApproved()) {
        console.log('[PermissionGuard] ✅ Global execution approved — bypassing permission');
        return {
          allowed: true,
          reason: 'GLOBAL_APPROVAL: Execution approved via confirmation',
          requiresApproval: false,
          monitoringLevel: 'basic'
        };
      }

      // BYPASS: If agent is in 'executing' mode, the user already approved from the Notifications UI.
      // Allow ALL major tools when executing — this prevents double-permission loops.
      if (agent?.mode === 'executing' || (agent as any)?.approvedReplyText) {
        return {
          allowed: true,
          reason: 'DIRECTIVE_TRUST: Tool execution authorized by prior user approval in Notifications UI',
          requiresApproval: false,
          monitoringLevel: 'detailed'
        };
      }

      // Create detailed monitoring notification
      const actionDetails = generateActionDetails(tool, args, agentName);
      addAgentNotification(
        agentId || 'system',
        agentName,
        `🔍 MONITORING REQUEST\n\n${agentName} wants to execute: ${tool}\n\n${actionDetails}`,
        'approval_needed',
        true
      );
      
      return {
        allowed: false,
        reason: `USER_APPROVAL_REQUIRED: ${tool}\n\n${actionDetails}`,
        requiresApproval: true,
        monitoringLevel: 'detailed'
      };
  }
}

/**
 * Generate detailed action description for monitoring
 */
export function generateActionDetails(tool: string, args: any, agentName: string): string {
  switch (tool) {
    case 'instagram_dm_sender':
      return `Recipient: @${args.username || 'unknown'}\nMessage: "${args.message || 'No message'}"\nPlatform: ${args.platform || 'Instagram'}`;
      
    case 'platform_post':
      return `Platforms: ${Array.isArray(args.platforms) ? args.platforms.join(', ') : 'unknown'}\nCaption: "${args.caption?.substring(0, 100)}${args.caption?.length > 100 ? '...' : ''}"\nScheduled: ${args.schedule ? 'Yes' : 'No'}`;
      
    case 'instagram_dm_reader':
      return `Action: Reading Instagram DMs\nPurpose: ${args.purpose || 'Message monitoring'}\nAgent: ${agentName}`;
      
    case 'code_executor':
      const getArg = (keys: string[]) => {
        for (const k of keys) {
          if (args[k]) return args[k];
          const normalizedK = k.toLowerCase().replace(/[\s_-]/g, '');
          for (const actualK in args) {
            if (actualK.toLowerCase().replace(/[\s_-]/g, '') === normalizedK) return args[actualK];
          }
        }
        return 'unknown';
      };

      if (args.operation?.toLowerCase().replace(/[\s_-]/g, '') === 'renameskill') {
         const oldName = getArg(['old_name', 'name', 'path', 'current_name', 'old']);
         const newName = getArg(['new_name', 'newName', 'content', 'target_name', 'new']);
         return `Operation: Rename Skill\nOld Name: ${oldName}\nNew Name: ${newName}\nDescription: Renaming a core system skill definition.`;
      }
      if (args.operation?.toLowerCase().replace(/[\s_-]/g, '') === 'renamefile') {
         const oldPath = getArg(['path', 'old_path', 'name', 'old']);
         const newPath = getArg(['new_name', 'newName', 'new_path', 'new']);
         return `Operation: Rename File\nOld Path: ${oldPath}\nNew Path: ${newPath}\nDescription: Moving or renaming a project file.`;
      }
      return `Operation: ${args.operation || 'unknown'}\nTarget: ${args.name || args.path || 'none'}\nDescription: ${args.description || args.goal || 'No description'}`;
      
    case 'exec':
      return `Command: ${args.command || 'unknown'}\nWorking directory: ${args.cwd || 'current'}\nTimeout: ${args.timeout || 'default'}s`;
      
    case 'write':
    case 'edit':
      return `File: ${args.path || 'unknown'}\nOperation: ${tool}\nSize: ${args.content ? args.content.length : 0} characters`;
      
    case 'caption_manager':
      return `Platform: ${args.platform || 'multi'}\nGoal: ${args.goal || 'general'}\nTone: ${args.tone || 'neutral'}`;
      
    default:
      if (!args || typeof args !== 'object') return `Tool: ${tool}\nArguments: none`;
      
      const lines = Object.entries(args).map(([key, value]) => {
         if (typeof value === 'object') {
            return `- ${key}: [Complex Data]`;
         }
         const strVal = String(value);
         return `- ${key}: ${strVal.length > 60 ? strVal.substring(0, 60) + '...' : strVal}`;
      });
      
      return `Tool: ${tool}\nArguments:\n${lines.join('\n')}`;
  }
}

/**
 * Execute tool with refined permission handling
 */
export async function executeWithRefinedPermission(tool: string, args: any, requester: string = 'orchestrator', agentId?: string): Promise<any> {
  const permissionCheck = enforceRefinedPermission(tool, args, agentId);
  
  if (!permissionCheck.allowed) {
    throw new Error(`[PERMISSION_BLOCK] ${permissionCheck.reason}`);
  }
  
  // If approval required but user has confirmed, proceed with monitoring
  if (permissionCheck.requiresApproval) {
    return await executeWithMonitoring(tool, args, requester, agentId, permissionCheck.monitoringLevel);
  }
  
  // Safe tool - execute directly
  return await executeTool(tool, args, requester, agentId);
}

/**
 * Execute tool with monitoring and logging
 */
async function executeWithMonitoring(tool: string, args: any, requester: string, agentId?: string, monitoringLevel?: string): Promise<any> {
  const agent = agentId ? getAgentStore().agents[agentId] : null;
  const agentName = agent?.name || 'Unknown Agent';
  
  // Log the execution attempt
  console.log(`[MONITORING] ${agentName} executing ${tool}:`, args);
  
  try {
    const result: any = await executeTool(tool, args, requester, agentId);
    
    // Log successful execution
    console.log(`[MONITORING] ${tool} executed successfully by ${agentName}`);
    
    // Add completion notification
    addAgentNotification(
      agentId || 'system',
      agentName,
      `✅ COMPLETED: ${tool}\n\nResult: ${result.success ? 'Success' : 'Failed'}\nMessage: ${result.reply || 'No message'}`
    );
    
    return result;
    
  } catch (error) {
    // Log failed execution
    console.log(`[MONITORING] ${tool} failed for ${agentName}:`, (error as Error).message);
    
    // Add failure notification
    addAgentNotification(
      agentId || 'system',
      agentName,
      `❌ FAILED: ${tool}\n\nError: ${(error as Error).message}\nAction: Requires investigation`
    );
    
    throw error;
  }
}

/**
 * Execute tool without permission checks (for approved tools)
 */
async function executeTool(tool: string, args: any, requester: string, agentId?: string): Promise<any> {
  // Import tools dynamically to avoid circular dependencies
  const tools = await import('./index');
  const runToolWithoutGuard = tools.runToolWithoutGuard;
  
  return await runToolWithoutGuard(tool, args, requester, agentId);
}

/**
 * Get permission status for a tool (for UI display)
 */
export function getToolPermissionStatus(tool: string): {
  classification: 'safe' | 'major' | 'blocked';
  description: string;
  requiresApproval: boolean;
} {
  const classification = classifyTool(tool);
  
  const descriptions = {
    safe: 'Safe tool - can be used immediately',
    major: 'Major action - requires user approval',
    blocked: 'Admin-only tool - completely restricted'
  };
  
  return {
    classification,
    description: descriptions[classification],
    requiresApproval: classification === 'major'
  };
}

// ============================================================================
// TASK INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Enhanced permission check with task integration
 * This version links permission requests to tasks for better tracking
 */
export async function enforcePermissionWithTask(
  tool: string, 
  args: any, 
  agentId?: string,
  taskId?: string
): Promise<{
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  taskId?: string;
  notificationId?: string;
}> {
  const classification = classifyTool(tool, agentId);
  const agent = agentId ? getAgentStore().agents[agentId] : null;
  const agentName = agent?.name || 'System';
  
  switch (classification) {
    case 'safe':
      return {
        allowed: true,
        reason: 'SAFE_TOOL: Tool approved for immediate use',
        requiresApproval: false
      };
      
    case 'blocked':
      // Check if it's Jenny - she can request blocked tools with approval
      if (agentId === 'system_jenny') {
        if (taskId) {
          // Create permission notification linked to task
          const result = await createTaskPermissionNotification({
            taskId,
            toolName: tool,
            args,
            agentId: agentId || 'system',
            agentName,
            permissionLevel: 'blocked'
          });
          
          return {
            allowed: false,
            reason: 'USER_APPROVAL_REQUIRED: Blocked tool requires your confirmation',
            requiresApproval: true,
            taskId,
            notificationId: result.notification?.id
          };
        }
        return {
          allowed: false,
          reason: 'USER_APPROVAL_REQUIRED: Blocked tool requires your confirmation',
          requiresApproval: true
        };
      }
      return {
        allowed: false,
        reason: 'TOOL_BLOCKED: This tool is restricted to admin use only',
        requiresApproval: false
      };
      
    case 'major':
      if (taskId) {
        // Create permission notification linked to task
        const result = await createTaskPermissionNotification({
          taskId,
          toolName: tool,
          args,
          agentId: agentId || 'system',
          agentName,
          permissionLevel: 'major'
        });
        
        return {
          allowed: false,
          reason: 'USER_APPROVAL_REQUIRED: This action requires your confirmation',
          requiresApproval: true,
          taskId,
          notificationId: result.notification?.id
        };
      }
      
      // Fallback: old behavior without task integration
      const actionDetails = generateActionDetails(tool, args, agentName);
      await addAgentNotification(
        agentId || 'system',
        agentName,
        `🔍 MONITORING REQUEST\n\n${agentName} wants to execute: ${tool}\n\n${actionDetails}`,
        'approval_needed',
        true
      );
      
      return {
        allowed: false,
        reason: `USER_APPROVAL_REQUIRED: ${tool} requires confirmation`,
        requiresApproval: true
      };
  }
}