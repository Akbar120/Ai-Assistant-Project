/**
 * ORCHESTRATOR TYPES & CONSTANTS
 * ─────────────────────────────────────────────────────
 * Type definitions and configuration constants used
 * across the orchestrator system.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AgentContext extends EnrichedInput {
  workspacePrompt?: string;
  sessionContext?: string;
}

export type OrchestratorAction =
  | 'conversation'
  | 'tool_call'
  | 'create_agent'
  | 'confirm_agent'
  | 'edit_agent'
  | 'restart_agent'
  | 'learn_knowledge';

export interface OrchestratorResult {
  action: OrchestratorAction;
  data: Record<string, unknown>;
  reply: string;
  taskId?: string;
  mode: JennyMode;
}

// ── STRICT EXECUTION TOOLS WHITELIST ──────────────────────────────────────────
export const EXECUTABLE_TOOLS = [
  'instagram_dm_sender', 'platform_post', 'caption_manager', 'code_executor', 
  'exec', 'write', 'edit', 'apply_patch', 'write_file', 'define_tool', 
  'image_generate', 'music_generate', 'video_generate', 'tts', 'cron', 
  'gateway', 'browser', 'canvas', 'manage_agent', 'agent_command', 
  'install_skill', 'update_plan'
];

// Tools that ALWAYS require explicit user permission before execution
export const TOOLS_REQUIRING_APPROVAL = [
  'instagram_dm_sender', 'platform_post', 'caption_manager', 'code_executor', 
  'exec', 'write', 'edit', 'apply_patch', 'write_file', 'define_tool', 
  'image_generate', 'music_generate', 'video_generate', 'tts', 'cron', 
  'gateway', 'browser', 'canvas', 'manage_agent', 'agent_command', 
  'install_skill', 'update_plan'
];

// Import types that are used in interfaces
import type { EnrichedInput } from '@/services/inputEnrichment';
import type { JennyMode } from './modeManager';