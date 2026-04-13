import fs from 'fs';
import path from 'path';

const WORKSPACE_BASE = path.join(process.cwd(), 'workspace', 'agents');

export interface WorkspaceConfig {
  name: string;
  role: string;
  goal: string;
  personality?: string;
  tools?: string[];
}

export function initializeWorkspace(agentId: string, config: WorkspaceConfig) {
  const agentDir = path.join(WORKSPACE_BASE, agentId);
  
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  const files = {
    'IDENTITY.md': `# IDENTITY\nName: ${config.name}\nRole: ${config.role}\nPurpose: ${config.goal}`,
    'SOUL.md': `# SOUL\nPersonality: ${config.personality || 'Friendly, helpful, and proactive Hinglish assistant.'}\nTone: Professional yet engaging.`,
    'TOOLS.md': `# TOOLS\n${(config.tools || ['instagram_dm', 'instagram_fetch', 'platform_post', 'caption_manager']).map(t => `- ${t}: Dynamic capability`).join('\n')}`,
    'AGENTS.md': `# INSTRUCTIONS\n1. Maintain absolute professionalism.\n2. Prioritize user safety and data integrity.\n3. Keep logs concise but informative.`,
    'USER.md': `# USER CONTEXT\nNo specific user context provided yet.`,
    'MEMORY.md': `# MEMORY\n\n## Critical\n- System initialized.\n\n## Useful\n\n## Temporary\n`
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(agentDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
}

export function getWorkspaceFiles(agentId: string) {
  const agentDir = path.join(WORKSPACE_BASE, agentId);
  if (!fs.existsSync(agentDir)) return [];
  return fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
}

export function readWorkspaceFile(agentId: string, filename: string) {
  const filePath = path.join(WORKSPACE_BASE, agentId, filename);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeWorkspaceFile(agentId: string, filename: string, content: string) {
  const agentDir = path.join(WORKSPACE_BASE, agentId);
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, filename), content, 'utf-8');
}

/**
 * Builds the Hybrid Prompt block from workspace files.
 * Inclusion Priority: IDENTITY > SOUL > TOOLS > AGENTS > MEMORY
 */
export function buildHybridPrompt(agentId: string): string {
  const agentDir = path.join(WORKSPACE_BASE, agentId);
  if (!fs.existsSync(agentDir)) {
    // Return a safe fallback context if workspace is missing
    return `IDENTITY: Friendly Hinglish Assistant\nSOUL: Helpful and proactive.`;
  }

  const identity = readWorkspaceFile(agentId, 'IDENTITY.md');
  const soul = readWorkspaceFile(agentId, 'SOUL.md');
  const tools = readWorkspaceFile(agentId, 'TOOLS.md');
  const agents = readWorkspaceFile(agentId, 'AGENTS.md');
  const memoryRaw = readWorkspaceFile(agentId, 'MEMORY.md');

  // Memory Parsing (Size Control)
  let memoryBlock = '';
  if (memoryRaw) {
    const lines = memoryRaw.split('\n');
    const critical = lines.filter((_, i) => i > lines.indexOf('## Critical') && i < (lines.indexOf('## Useful') === -1 ? lines.length : lines.indexOf('## Useful')));
    const useful = lines.filter((_, i) => i > lines.indexOf('## Useful') && i < (lines.indexOf('## Temporary') === -1 ? lines.length : lines.indexOf('## Temporary'))).slice(-10);
    const temporary = lines.filter((_, i) => i > lines.indexOf('## Temporary')).slice(-5);
    
    memoryBlock = `\n### LONG-TERM MEMORY\n${critical.join('\n')}\n${useful.join('\n')}\n${temporary.join('\n')}`;
  }

  return `
[AGENT_IDENTITY]
${identity || 'Friendly Assistant'}

[AGENT_SOUL]
${soul || 'Proactive and Hinglish-speaking.'}

[BEHAVIOR_GUIDELINES]
${agents || 'Follow user objectives.'}

[CAPABILITIES_CONTEXT]
${tools || 'Standard toolset available.'}
${memoryBlock}
`.trim();
}
