/**
 * toolRegistry.ts
 * ─────────────────────────────────────────────────────────────
 * Source of truth for all tool definitions. Each tool has:
 *  - id:          Unique key used in agent.allowedTools[]
 *  - name:        Display name
 *  - description: What the tool does (shown in the UI)
 *  - category:    Groups tools into sections in the UI
 *  - badge:       Display badge (BUILT-IN | CONNECTED | CORE)
 *  - source:      Where the tool comes from
 */

export type ToolBadge = 'BUILT-IN' | 'CONNECTED' | 'CORE';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  badge: ToolBadge;
  source: string;
}

export const TOOL_CATEGORIES: Record<string, string> = {
  'Files':       'Files',
  'Runtime':     'Runtime',
  'Web':         'Web',
  'Memory':      'Memory',
  'Sessions':    'Sessions',
  'UI':          'UI',
  'Messaging':   'Messaging',
  'Automation':  'Automation',
  'Nodes':       'Nodes',
  'Agents':      'Agents',
  'Media':       'Media',
  'Social':      'Social',
  'Intelligence':'Intelligence',
};

export const ALL_TOOLS: ToolDefinition[] = [
  // ── Files ─────────────────────────────────────────────────────────────────
  {
    id: 'read',
    name: 'Read',
    description: 'Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments.',
    category: 'Files',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'write',
    name: 'Write',
    description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does. Automatically creates parent directories.',
    category: 'Files',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'edit',
    name: 'Edit',
    description: 'Edit a single file using exact text replacement. Every edit\'s oldText must match a unique, non-overlapping region of the file.',
    category: 'Files',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'apply_patch',
    name: 'Apply Patch',
    description: 'Patch files using a unified diff format. Apply multi-file changes atomically.',
    category: 'Files',
    badge: 'CORE',
    source: 'core',
  },

  // ── Runtime ───────────────────────────────────────────────────────────────
  {
    id: 'exec',
    name: 'Exec',
    description: 'Run shell commands that start now. Full access to the system shell.',
    category: 'Runtime',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'process',
    name: 'Process',
    description: 'Inspect and control running exec sessions. Kill or signal background processes.',
    category: 'Runtime',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'code_executor',
    name: 'Code Executor',
    description: 'Run sandboxed remote code analysis. Create skills, write tools, read and list project files.',
    category: 'Runtime',
    badge: 'CORE',
    source: 'brain/tools/code_executor.ts',
  },

  // ── Web ───────────────────────────────────────────────────────────────────
  {
    id: 'search_web',
    name: 'Web Search',
    description: 'Search the web using the configured search API. Returns titles, URLs, and snippets.',
    category: 'Web',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'web_fetch',
    name: 'Web Fetch',
    description: 'Fetch and extract readable content from a URL (HTML → markdown/text). Use for lightweight page access without JavaScript.',
    category: 'Web',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'x_search',
    name: 'X Search',
    description: 'Search X (Twitter) posts. Returns recent posts matching a query.',
    category: 'Web',
    badge: 'CORE',
    source: 'core',
  },

  // ── Memory ────────────────────────────────────────────────────────────────
  {
    id: 'memory_search',
    name: 'Memory Search',
    description: 'Mandatory recall step: semantically search MEMORY.md + memory/*.md (and optional session transcripts) before answering.',
    category: 'Memory',
    badge: 'CONNECTED',
    source: 'memory-core',
  },
  {
    id: 'memory_get',
    name: 'Memory Get',
    description: 'Safe snippet read from MEMORY.md or memory/*.md with optional from/lines. corpus=wiki reads from registered knowledge.',
    category: 'Memory',
    badge: 'CONNECTED',
    source: 'memory-core',
  },

  // ── Sessions ──────────────────────────────────────────────────────────────
  {
    id: 'sessions_list',
    name: 'Sessions List',
    description: 'List visible sessions and optional recent messages.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'sessions_history',
    name: 'Session History',
    description: 'Read sanitized message history for a visible session.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'sessions_send',
    name: 'Session Send',
    description: 'Send a message to another visible session.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'sessions_spawn',
    name: 'Sessions Spawn',
    description: 'Spawn sub-agent or ACP sessions. Use this for multi-agent orchestration.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'sessions_yield',
    name: 'Yield',
    description: 'End your current turn. Use after spawning subagents to receive their results as the next message.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'subagents',
    name: 'Subagents',
    description: 'List, kill, or steer spawned sub-agents for this requester session. Use this for sub-agent orchestration.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'session_status',
    name: 'Session Status',
    description: 'Show session status, usage, and model state.',
    category: 'Sessions',
    badge: 'BUILT-IN',
    source: 'core',
  },

  // ── UI ────────────────────────────────────────────────────────────────────
  {
    id: 'browser',
    name: 'Browser',
    description: 'Control a web browser. Navigate pages, click elements, fill forms, extract content.',
    category: 'UI',
    badge: 'CORE',
    source: 'core',
  },
  {
    id: 'canvas',
    name: 'Canvas',
    description: 'Control canvases and visual workspaces. Render and manipulate visual content.',
    category: 'UI',
    badge: 'CORE',
    source: 'core',
  },

  // ── Messaging ─────────────────────────────────────────────────────────────
  {
    id: 'instagram_dm_reader',
    name: 'Instagram DM Reader',
    description: 'Read new unread Direct Messages from the configured Instagram session.',
    category: 'Messaging',
    badge: 'CORE',
    source: 'brain/tools/instagram_fetch.ts',
  },
  {
    id: 'instagram_dm_sender',
    name: 'Instagram DM Sender',
    description: 'Send a Direct Message via Instagram. You MUST pass the `threadUrl` if replying to a fetched message. Requires explicit user confirmation.',
    category: 'Messaging',
    badge: 'CORE',
    source: 'brain/tools/instagram_dm.ts',
  },
  {
    id: 'platform_post',
    name: 'Platform Post',
    description: 'Post content to Instagram, Twitter/X, or Discord. Requires explicit user confirmation.',
    category: 'Messaging',
    badge: 'CORE',
    source: 'brain/tools/platform_post.ts',
  },

  // ── Automation ────────────────────────────────────────────────────────────
  {
    id: 'cron',
    name: 'Cron',
    description: 'Schedule cron jobs, reminders, and wake events. Trigger agent cycles on a custom interval.',
    category: 'Automation',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'gateway',
    name: 'Gateway',
    description: 'Gateway control. Manage inbound and outbound connections to external services.',
    category: 'Automation',
    badge: 'CORE',
    source: 'core',
  },

  // ── Agents ────────────────────────────────────────────────────────────────
  {
    id: 'get_agents',
    name: 'Agents List',
    description: 'List all agents: name, ID, status, goal. Use to monitor who is running, idle, or errored.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/reality.ts',
  },
  {
    id: 'get_tasks',
    name: 'Get Tasks',
    description: 'View the pending and completed task queue. Detect stalled or recently completed items.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/reality.ts',
  },
  {
    id: 'get_config',
    name: 'Get Config',
    description: 'Retrieve global system parameters: version, env, token limits, and API key status.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/reality.ts',
  },
  {
    id: 'get_channels',
    name: 'Get Channels',
    description: 'Check which platforms are connected: Instagram, Discord, Twitter — with connection validity.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/reality.ts',
  },
  {
    id: 'get_skills',
    name: 'Get Skills',
    description: 'Audit all installed skill modules from brain/skills/. Verify before assigning skills to agents.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/reality.ts',
  },
  {
    id: 'update_plan',
    name: 'Update Plan',
    description: 'Track a short structured work plan. Mark steps complete, add new sub-tasks.',
    category: 'Agents',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'install_skill',
    name: 'Install Skill',
    description: 'Install skills from the ClawHub registry. Pass action="list" to browse, or skill_name to install.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/install_skill.ts',
  },
  {
    id: 'manage_agent',
    name: 'Manage Agent',
    description: 'Cross-agent orchestration tool. Operations: assign_tool, unassign_tool, assign_skill, unassign_skill, delete_skill, restart_agent, delete_agent, update_config (pass config_updates object).',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/manage_agent.ts',
  },
  {
    id: 'agent_notify',
    name: 'Agent Notify',
    description: 'Send a message or report findings to the master orchestrator (Jenny). Use this to request user approval or provide task updates.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/agent_notify.ts',
  },
  {
    id: 'get_agent_output',
    name: 'Get Agent Output',
    description: 'Read the recent memory and logs of an autonomous agent to understand its current state and findings.',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/reality.ts',
  },
  {
    id: 'agent_command',
    name: 'Agent Command',
    description: 'Send a specific directive or feedback to an autonomous agent (e.g., Approve suggestion, Abandon task).',
    category: 'Agents',
    badge: 'CORE',
    source: 'brain/tools/agent_command.ts',
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  {
    id: 'image',
    name: 'Image',
    description: 'Analyze one or more images with the configured image model. Use for single or multi-image analysis.',
    category: 'Media',
    badge: 'BUILT-IN',
    source: 'core',
  },
  {
    id: 'image_generate',
    name: 'Image Generate',
    description: 'Generate images from a text prompt using the configured image generation model.',
    category: 'Media',
    badge: 'CORE',
    source: 'core',
  },
  {
    id: 'music_generate',
    name: 'Music Generate',
    description: 'Generate music or audio clips from a text description.',
    category: 'Media',
    badge: 'CORE',
    source: 'core',
  },
  {
    id: 'video_generate',
    name: 'Video Generate',
    description: 'Generate short video clips from a text prompt or image sequence.',
    category: 'Media',
    badge: 'CORE',
    source: 'core',
  },
  {
    id: 'tts',
    name: 'TTS',
    description: 'Text-to-speech conversion. Convert agent output to spoken audio using the configured voice.',
    category: 'Media',
    badge: 'CORE',
    source: 'core',
  },

  // ── Intelligence ──────────────────────────────────────────────────────────
  {
    id: 'caption_manager',
    name: 'Caption Manager',
    description: 'Generate and optimize social media captions. Supports hashtag suggestions and tone matching.',
    category: 'Intelligence',
    badge: 'CORE',
    source: 'brain/tools/caption_manager.ts',
  },
  {
    id: 'instagram_feed_reader',
    name: 'Instagram Feed Reader',
    description: 'Read the Instagram feed for trend analysis and engagement monitoring.',
    category: 'Intelligence',
    badge: 'CORE',
    source: 'brain/tools/instagram_fetch.ts',
  },
  {
    id: 'improvement_propose',
    name: 'Propose Improvement',
    description: 'Propose a system upgrade, code change, or skill modification. Sent to the Improvements tab for user review.',
    category: 'Intelligence',
    badge: 'CORE',
    source: 'brain/tools/improvement_propose.ts',
  },
];

/** Fast lookup by id */
export const TOOL_MAP = Object.fromEntries(ALL_TOOLS.map(t => [t.id, t])) as Record<string, ToolDefinition>;

/** All tool IDs */
export const ALL_TOOL_IDS = ALL_TOOLS.map(t => t.id);

/** Group tools by category */
export function groupToolsByCategory(tools: ToolDefinition[]): Record<string, ToolDefinition[]> {
  const groups: Record<string, ToolDefinition[]> = {};
  for (const tool of tools) {
    if (!groups[tool.category]) groups[tool.category] = [];
    groups[tool.category].push(tool);
  }
  return groups;
}
