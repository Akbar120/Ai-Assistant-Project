import fs from 'fs';
import path from 'path';
import { ollamaChat } from '@/lib/ollama';
import { getActiveModel } from '@/lib/ollama';

const WORKSPACE_BASE = path.join(process.cwd(), 'workspace', 'agents');

export interface WorkspaceConfig {
  name: string;
  role: string;
  goal: string;
  identity?: string;
  soul?: string;
  tools?: string[];
  instructions?: string;
  personality?: string;
  channels?: string[];
  pollingInterval?: number;
  skills?: string[];
}

// ── Static fallback content — used when LLM is unavailable ────────────────────
function buildStaticFiles(config: WorkspaceConfig): Record<string, string> {
  const today = new Date().toISOString().split('T')[0];
  const toolsList = (config.tools || []).map(t => `- ${t}`).join('\n') || '- get_tasks\n- get_channels';
  const channelsList = (config.channels || []).map(c => `- ${c}`).join('\n') || '- none configured';
  const skillsList = (config.skills || []).map(s => `- ${s}`).join('\n') || '- general_assistant';
  const intervalMins = Math.round(((config.pollingInterval || 60000) / 60000));

  return {
    'IDENTITY.md': config.identity || `# IDENTITY
Name: ${config.name}
Role: ${config.role || 'AI Assistant'}
Purpose: ${config.goal || 'Assist with tasks'}
Created: ${today}`,

    'SOUL.md': config.soul || `# SOUL
Personality: Casual, smart, adaptive. Speaks Hinglish naturally.
Tone: Matches user's speaking style — can be aggressive, playful, or formal.
Hard Limits:
- NEVER send messages without explicit user approval.
- NEVER expose internal tool calls or raw JSON to the user.
- NEVER fabricate data or hallucinate capabilities.`,

    'AGENTS.md': config.instructions || `# OPERATING MANUAL — ${config.name}
Role: ${config.role}
Goal: ${config.goal}

## Workflow
1. Check triggers every ${intervalMins} minute(s).
2. Analyze context using memory and session history.
3. Propose 2-3 action options based on the situation.
4. Wait for explicit user approval before executing.
5. Log every action to memory/daily log.
6. NEVER act autonomously without confirmation.`,

    'USER.md': `# USER PROFILE
Agent: ${config.name}
Status: Provisioned — awaiting user interaction

## Permissions
- Read access: Granted
- Write access: Requires confirmation
- External API calls: Requires confirmation

## Preferences
- Language: Hinglish (Hindi + English mix)
- Reply style: Short, direct, with emojis
- Approval required: YES for all major actions`,

    'HEARTBEAT.md': `# HEARTBEAT — ${config.name}
Scheduled Behaviors:

## Every ${intervalMins} Minute(s)
- Check for new triggers or incoming data
- Update memory with any new observations
- Report to orchestrator if action needed

## Daily (on first run)
- Write daily log entry to memory/${today}.md
- Review pending tasks
- Check channel connectivity`,

    'BOOTSTRAP.md': `# BOOTSTRAP — ${config.name}
Startup sequence executed on agent initialization.

## Step 1: Load Identity
Read IDENTITY.md → Set role, name, goal.

## Step 2: Load Memory
Read MEMORY.md → Load critical context.
Read latest memory/daily log if exists.

## Step 3: Check Tools
Verify tool availability:
${toolsList}

## Step 4: Check Channels
${channelsList}

## Step 5: Begin Heartbeat
Start polling every ${intervalMins} minute(s).

## Step 6: Log Start
Append "Agent started" to today's memory log.`,

    'TOOLS.md': `# TOOLS — ${config.name}
## Assigned Tools
${toolsList}

## Usage Guidelines
- Always check tool availability before calling.
- Pass task_id with every tool call for audit trail.
- Log tool result to memory after execution.
- Never retry a failed tool more than 2 times.`,

    'MEMORY.md': `# MEMORY — ${config.name}

## Critical (Always Loaded)
- Agent initialized: ${today}
- Goal: ${config.goal}
- Role: ${config.role}

## Useful (Session Context)

## Temporary (Cleared on Restart)
`,

    [`memory/${today}.md`]: `# Daily Log — ${today}
Agent: ${config.name}

## ${new Date().toLocaleTimeString()}
- Agent workspace initialized.
- Goal set: ${config.goal}
- Tools provisioned: ${(config.tools || []).join(', ') || 'default set'}
`,

    'SKILL.md': `# SKILL — ${config.name}

## Primary Skill: ${config.name.replace(/[-_]/g, ' ')} Handler
**Purpose**: ${config.goal}

**Trigger**:
- User requests related to: ${config.role}
- Keywords: ${config.name.toLowerCase().split(/[-_]/).join(', ')}

**Required Tools**:
${toolsList}

**Execution Steps**:
1. Detect trigger or incoming request.
2. Load relevant memory context.
3. Analyze request and generate 2-3 options.
4. Present options to user with reasoning.
5. Wait for user selection/approval.
6. Execute selected action using assigned tools.
7. Log result to memory.

**Hard Rules**:
- NEVER execute step 6 without explicit approval.
- If tool fails: report to user, do NOT retry silently.`,
  };
}

// ── LLM-generated file content ────────────────────────────────────────────────
async function generateWorkspaceFilesLLM(config: WorkspaceConfig): Promise<Record<string, string> | null> {
  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are a workspace generator for an AI agent system. Generate ALL of the following files for this agent. Return a valid JSON object ONLY, no explanation.

Agent Details:
- Name: ${config.name}
- Role: ${config.role}
- Goal: ${config.goal}
- Tools: ${(config.tools || []).join(', ') || 'get_tasks, get_channels'}
- Channels: ${(config.channels || []).join(', ') || 'none'}
- Polling Interval: ${Math.round(((config.pollingInterval || 60000) / 60000))} minute(s)
- Skills: ${(config.skills || []).join(', ') || 'general'}

Generate these files as a JSON object with file names as keys and file content as values:
{
  "AGENTS.md": "...",
  "SOUL.md": "...",
  "USER.md": "...",
  "IDENTITY.md": "...",
  "HEARTBEAT.md": "...",
  "BOOTSTRAP.md": "...",
  "TOOLS.md": "...",
  "MEMORY.md": "...",
  "SKILL.md": "..."
}

Rules:
- Each file must be specific to this agent's actual goal and role.
- SOUL.md: define unique personality, tone, hard limits for this specific agent.
- SKILL.md: define trigger keywords, exact execution steps, tools — tailored to goal.
- HEARTBEAT.md: use the actual polling interval.
- All content must be non-generic and role-specific.
- Return ONLY valid JSON, no markdown wrapper.`;

  try {
    const raw = await ollamaChat({
      model: getActiveModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      num_predict: 3000,
    });

    // Extract JSON
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    // Add daily log (not in LLM output — always generated fresh)
    parsed[`memory/${today}.md`] = `# Daily Log — ${today}\nAgent: ${config.name}\n\n## ${new Date().toLocaleTimeString()}\n- Agent workspace initialized.\n- Goal: ${config.goal}\n`;

    return parsed;
  } catch (err) {
    console.error('[Workspace] LLM generation failed, using static fallback:', err);
    return null;
  }
}

export async function initializeWorkspace(agentSlug: string, config: WorkspaceConfig) {
  const agentDir = path.join(WORKSPACE_BASE, agentSlug);

  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  // Create memory/ subdirectory
  const memoryDir = path.join(agentDir, 'memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  // Always generate static fallbacks as a baseline
  const staticFiles = buildStaticFiles(config);
  let finalFiles = { ...staticFiles };

  // Try LLM-generated content to override static where provided
  const llmFiles = await generateWorkspaceFilesLLM(config);
  if (llmFiles && Object.keys(llmFiles).length >= 5) {
    console.log(`[Workspace] LLM-generated files for agent: ${agentSlug}`);
    finalFiles = { ...staticFiles, ...llmFiles };
  } else {
    console.log(`[Workspace] Using static fallback for agent: ${agentSlug}`);
  }

  // Write files — skip if already exists (safe for existing agents)
  for (const [filename, content] of Object.entries(finalFiles)) {
    const filePath = path.join(agentDir, filename);
    const fileDir = path.dirname(filePath);

    // Ensure subdirectory exists (e.g. memory/)
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
}

/**
 * Backfill any missing workspace files for existing agents.
 * Uses static content only (does not re-run LLM for established agents).
 */
export function upgradeAgentWorkspace(agentSlug: string, config: WorkspaceConfig) {
  const agentDir = path.join(WORKSPACE_BASE, agentSlug);
  if (!fs.existsSync(agentDir)) return;

  const memoryDir = path.join(agentDir, 'memory');
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

  const staticFiles = buildStaticFiles(config);
  let upgraded = 0;

  for (const [filename, content] of Object.entries(staticFiles)) {
    const filePath = path.join(agentDir, filename);
    const fileDir = path.dirname(filePath);

    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      upgraded++;
    }
  }

  if (upgraded > 0) {
    console.log(`[Workspace] Upgraded ${agentSlug}: backfilled ${upgraded} missing files.`);
  }
}

export function getWorkspaceFiles(agentSlug: string) {
  const agentDir = path.join(WORKSPACE_BASE, agentSlug);
  if (!fs.existsSync(agentDir)) return [];
  return fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
}

export function readWorkspaceFile(agentSlug: string, filename: string) {
  const filePath = path.join(WORKSPACE_BASE, agentSlug, filename);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeWorkspaceFile(agentSlug: string, filename: string, content: string) {
  const agentDir = path.join(WORKSPACE_BASE, agentSlug);
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, filename), content, 'utf-8');
}

/**
 * Builds the Hybrid Prompt block from workspace files.
 * Inclusion Priority: IDENTITY > SOUL > TOOLS > AGENTS > MEMORY
 */
export function buildHybridPrompt(agentSlug: string): string {
  const agentDir = path.join(WORKSPACE_BASE, agentSlug);
  if (!fs.existsSync(agentDir)) {
    return `IDENTITY: Friendly Hinglish Assistant\nSOUL: Helpful and proactive.`;
  }

  const identity = readWorkspaceFile(agentSlug, 'IDENTITY.md');
  const soul = readWorkspaceFile(agentSlug, 'SOUL.md');
  const tools = readWorkspaceFile(agentSlug, 'TOOLS.md');
  const agents = readWorkspaceFile(agentSlug, 'AGENTS.md');
  const memory = readWorkspaceFile(agentSlug, 'MEMORY.md');

  return `
[AGENT_IDENTITY]
${identity || 'Friendly Assistant'}

[AGENT_SOUL]
${soul || 'Proactive and Hinglish-speaking.'}

[BEHAVIOR_GUIDELINES]
${agents || 'Follow user objectives.'}

[CAPABILITIES_CONTEXT]
${tools || 'Standard toolset available.'}

[MEMORY_CONTEXT]
${memory || 'No long-term memory established yet.'}
`.trim();
}
