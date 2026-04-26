/**
 * SKILL-BASED TOOL MANAGEMENT
 * 
 * This system allows skills to access necessary tools while maintaining security.
 * Skills are pre-approved for specific tool categories based on their purpose.
 */

import { classifyTool } from '../tools/refinedPermissionGuard';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  allowedTools: string[];
  requiredApprovalTools: string[];
  blockedTools: string[];
  purpose: string;
}

// Pre-defined skill configurations
export const SKILL_CONFIGURATIONS: Record<string, SkillDefinition> = {
  'instagram_dm_handler': {
    id: 'instagram_dm_handler',
    name: 'Instagram DM Handler',
    description: 'Handles Instagram direct messages with user approval',
    allowedTools: ['instagram_dm_reader', 'instagram_dm_sender', 'get_tasks', 'memory_search'],
    requiredApprovalTools: ['instagram_dm_sender'],
    blockedTools: ['manage_agent', 'install_skill'],
    purpose: 'Manage Instagram conversations with user oversight'
  },
  
  'social_media_poster': {
    id: 'social_media_poster',
    name: 'Social Media Poster',
    description: 'Posts content to social platforms with monitoring',
    allowedTools: ['platform_post', 'caption_manager', 'search_web', 'get_channels'],
    requiredApprovalTools: ['platform_post'],
    blockedTools: ['manage_agent', 'agent_command'],
    purpose: 'Create and schedule social media posts'
  },
  
  'content_manager': {
    id: 'content_manager',
    name: 'Content Manager',
    description: 'Manages content creation and optimization',
    allowedTools: ['caption_manager', 'image', 'memory_search', 'search_web'],
    requiredApprovalTools: [],
    blockedTools: ['manage_agent', 'install_skill'],
    purpose: 'Create and optimize content for social media'
  },
  
  'research_assistant': {
    id: 'research_assistant',
    name: 'Research Assistant',
    description: 'Conducts research and information gathering',
    allowedTools: ['search_web', 'memory_search', 'web_fetch', 'get_tasks'],
    requiredApprovalTools: [],
    blockedTools: ['manage_agent', 'install_skill'],
    purpose: 'Gather and analyze information'
  },
  
  'code_specialist': {
    id: 'code_specialist',
    name: 'Code Specialist',
    description: 'Handles code-related tasks with approval',
    allowedTools: ['code_executor', 'read', 'write', 'edit'],
    requiredApprovalTools: ['code_executor', 'write', 'edit'],
    blockedTools: ['manage_agent', 'install_skill'],
    purpose: 'Code analysis and execution with oversight'
  }
};

/**
 * Get skill configuration for a specific skill
 */
export function getSkillConfiguration(skillName: string): SkillDefinition | null {
  const skillKey = skillName.toLowerCase().replace(/[-_]/g, '_');
  return SKILL_CONFIGURATIONS[skillKey] || null;
}

/**
 * Check if a skill can use a specific tool
 */
export function canSkillUseTool(skillName: string, tool: string): {
  canUse: boolean;
  approvalRequired: boolean;
  reason: string;
} {
  const skill = getSkillConfiguration(skillName);
  if (!skill) {
    return {
      canUse: false,
      approvalRequired: false,
      reason: `Skill ${skillName} not found`
    };
  }
  
  // Check if tool is completely blocked for this skill
  if (skill.blockedTools.includes(tool)) {
    return {
      canUse: false,
      approvalRequired: false,
      reason: `Tool ${tool} is blocked for skill ${skillName}`
    };
  }
  
  // Check if tool requires approval
  const requiresApproval = skill.requiredApprovalTools.includes(tool);
  const canUse = skill.allowedTools.includes(tool) || requiresApproval;
  
  return {
    canUse,
    approvalRequired: requiresApproval,
    reason: canUse ? 
      (requiresApproval ? `Requires user approval` : `Tool allowed`) : 
      `Tool not in skill's allowed list`
  };
}

/**
 * Get all tools available to a skill with their status
 */
export function getSkillToolsStatus(skillName: string): Record<string, {
  status: 'allowed' | 'approval_required' | 'blocked';
  reason: string;
}> {
  const skill = getSkillConfiguration(skillName);
  if (!skill) return {};
  
  const tools: Record<string, { status: 'allowed' | 'approval_required' | 'blocked'; reason: string }> = {};
  
  // Add allowed tools
  skill.allowedTools.forEach(tool => {
    tools[tool] = {
      status: 'allowed',
      reason: 'Tool is in skill\'s allowed list'
    };
  });
  
  // Add approval-required tools
  skill.requiredApprovalTools.forEach(tool => {
    tools[tool] = {
      status: 'approval_required',
      reason: 'Tool requires user approval'
    };
  });
  
  // Add blocked tools
  skill.blockedTools.forEach(tool => {
    tools[tool] = {
      status: 'blocked',
      reason: 'Tool is blocked for this skill'
    };
  });
  
  return tools;
}

/**
 * Validate skill tool usage before execution
 */
export function validateSkillToolUsage(skillName: string, tool: string, args: any): {
  valid: boolean;
  reason: string;
  requiresApproval: boolean;
} {
  const toolCheck = canSkillUseTool(skillName, tool);
  
  if (!toolCheck.canUse) {
    return {
      valid: false,
      reason: toolCheck.reason,
      requiresApproval: false
    };
  }
  
  return {
    valid: true,
    reason: toolCheck.reason,
    requiresApproval: toolCheck.approvalRequired
  };
}

/**
 * Create a custom skill with specific tool permissions
 */
export function createSkillConfiguration(
  name: string,
  description: string,
  allowedTools: string[],
  requiredApprovalTools: string[] = [],
  blockedTools: string[] = []
): SkillDefinition {
  const id = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  
  return {
    id,
    name,
    description,
    allowedTools,
    requiredApprovalTools,
    blockedTools,
    purpose: `Custom skill: ${description}`
  };
}

/**
 * Get recommended tools for a specific use case
 */
export function getRecommendedToolsForUseCase(useCase: string): {
  safeTools: string[];
  majorTools: string[];
  blockedTools: string[];
} {
  const useCaseLower = useCase.toLowerCase();
  
  if (useCaseLower.includes('instagram') || useCaseLower.includes('dm')) {
    return {
      safeTools: ['get_tasks', 'memory_search', 'search_web'],
      majorTools: ['instagram_dm_reader', 'instagram_dm_sender', 'caption_manager'],
      blockedTools: ['manage_agent', 'install_skill']
    };
  }
  
  if (useCaseLower.includes('post') || useCaseLower.includes('social')) {
    return {
      safeTools: ['get_channels', 'search_web', 'caption_manager'],
      majorTools: ['platform_post'],
      blockedTools: ['manage_agent', 'install_skill']
    };
  }
  
  if (useCaseLower.includes('research') || useCaseLower.includes('search')) {
    return {
      safeTools: ['search_web', 'memory_search', 'web_fetch'],
      majorTools: [],
      blockedTools: ['manage_agent', 'install_skill']
    };
  }
  
  if (useCaseLower.includes('code') || useCaseLower.includes('develop')) {
    return {
      safeTools: ['read'],
      majorTools: ['code_executor', 'write', 'edit'],
      blockedTools: ['manage_agent', 'install_skill']
    };
  }
  
  // Default fallback
  return {
    safeTools: ['get_tasks', 'memory_search'],
    majorTools: [],
    blockedTools: ['manage_agent', 'install_skill']
  };
}