import fs from 'fs';
import path from 'path';
import { ollamaChat, getActiveModel } from '@/lib/ollama';

const SKILLS_DIR = path.join(process.cwd(), 'src', 'brain', 'skills');
const TOOLS_DIR = path.join(process.cwd(), 'src', 'brain', 'tools');
const TOOLS_INDEX = path.join(TOOLS_DIR, 'index.ts');

export interface CodeExecutorResult {
  success: boolean;
  reply: string;
  error?: string;
  created?: string[];
}

/**
 * code_executor — Jenny's advanced coding tool.
 *
 * Capabilities:
 *  - write_file:    Write arbitrary content to any safe path inside the project
 *  - create_skill:  Generate and install a new .md skill into brain/skills/
 *  - create_tool:   Generate a new TypeScript tool + auto-register it in tools/index.ts
 *  - read_file:     Read any file inside the project workspace
 *  - list_files:    List files in a directory
 *
 * All destructive writes are scoped to workspace (process.cwd()) and disallow
 * traversal attacks (../ attempts are blocked).
 */
export async function execute_code_executor(args: {
  operation: 'write_file' | 'create_skill' | 'create_tool' | 'read_file' | 'list_files';
  path?: string;
  name?: string;
  content?: string;
  description?: string;
  goal?: string; // used by LLM generation
}): Promise<CodeExecutorResult> {
  const { operation } = args;

  // ─── Security guard ────────────────────────────────────────────────────────
  function safePath(p: string): string {
    const resolved = path.resolve(process.cwd(), p);
    if (!resolved.startsWith(process.cwd())) {
      throw new Error(`[Security] Path traversal blocked: ${p}`);
    }
    return resolved;
  }

  try {
    // ── LIST FILES ────────────────────────────────────────────────────────────
    if (operation === 'list_files') {
      const dir = safePath(args.path || '.');
      if (!fs.existsSync(dir)) return { success: false, reply: `Directory not found: ${dir}`, error: 'NOT_FOUND' };
      const files = fs.readdirSync(dir);
      return { success: true, reply: `Files in ${args.path}:\n` + files.join('\n') };
    }

    // ── READ FILE ─────────────────────────────────────────────────────────────
    if (operation === 'read_file') {
      const filePath = safePath(args.path!);
      if (!fs.existsSync(filePath)) return { success: false, reply: `File not found: ${filePath}`, error: 'NOT_FOUND' };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, reply: content };
    }

    // ── WRITE FILE ────────────────────────────────────────────────────────────
    if (operation === 'write_file') {
      const filePath = safePath(args.path!);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, args.content || '', 'utf-8');
      return { success: true, reply: `Written: ${filePath}`, created: [filePath] };
    }

    // ── CREATE SKILL ──────────────────────────────────────────────────────────
    if (operation === 'create_skill') {
      const skillName = (args.name || 'new_skill').toLowerCase().replace(/\s+/g, '_');
      const fileName = `${skillName}.md`;
      const filePath = path.join(SKILLS_DIR, fileName);

      if (fs.existsSync(filePath)) {
        return { success: false, reply: `Skill already exists: ${fileName}. Use write_file to update it.`, error: 'EXISTS' };
      }

      let content = args.content;

      // If no content provided, generate it with LLM
      if (!content) {
        const prompt = `You are an expert at writing OpenClaw agent skill definition files.
Create a professional, complete skill .md file for the following skill:

Name: ${skillName}
Description: ${args.description || args.goal || 'A custom skill'}

The file must include these sections in order:
# Skill: ${skillName}

## Description
[what this skill does]

## Triggers
[keywords and phrases that activate this skill]

## ## 🔐 Tool Access
[list of tools this skill uses]

## Execution Steps
[numbered step-by-step instructions]

## Hard Rules
[non-negotiable constraints]

Output ONLY the raw markdown content, no extra text.`;

        content = await ollamaChat({
          model: getActiveModel(),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          num_predict: 1500,
        });
      }

      if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        reply: `✅ Skill installed: src/brain/skills/${fileName}\nIt is now available in the Skills tab and the skillsEngine will auto-detect it.`,
        created: [filePath],
      };
    }

    // ── CREATE TOOL ───────────────────────────────────────────────────────────
    if (operation === 'create_tool') {
      const toolName = (args.name || 'new_tool').toLowerCase().replace(/\s+/g, '_');
      const fileName = `${toolName}.ts`;
      const filePath = path.join(TOOLS_DIR, fileName);

      if (fs.existsSync(filePath)) {
        return { success: false, reply: `Tool file already exists: ${fileName}. Use write_file to update.`, error: 'EXISTS' };
      }

      let toolCode = args.content;

      // If no code, generate with LLM
      if (!toolCode) {
        const prompt = `You are a TypeScript expert AI. Create a working Next.js-compatible tool function for OpenClaw.

Tool name: ${toolName}
Goal: ${args.description || args.goal || 'A custom automation tool'}

Requirements:
- Export an async function named execute_${toolName}(args: any): Promise<{ success: boolean; reply: string; data?: any; error?: string }>
- Handle errors gracefully and return { success: false, error: message }
- Use only Node.js built-ins (fs, path, https, child_process) — no external npm packages
- Add JSDoc comment explaining what the tool does
- Keep it concise and production-safety focused

Output ONLY the TypeScript code, nothing else.`;

        toolCode = await ollamaChat({
          model: getActiveModel(),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          num_predict: 2000,
        });

        // Strip markdown fences if LLM included them
        toolCode = toolCode.replace(/^```(?:typescript|ts)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      fs.writeFileSync(filePath, toolCode, 'utf-8');

      // ── Auto-register in index.ts ─────────────────────────────────────────
      const fnName = `execute_${toolName}`;
      let indexContent = fs.readFileSync(TOOLS_INDEX, 'utf-8');

      // Add import at top (after last existing import)
      const importLine = `import { ${fnName} } from './${toolName}';\n`;
      const lastImportIdx = indexContent.lastIndexOf('\nimport ');
      const insertAt = indexContent.indexOf('\n', lastImportIdx + 1);
      indexContent = indexContent.slice(0, insertAt + 1) + importLine + indexContent.slice(insertAt + 1);

      // Add case in switch
      const caseEntry = `      case '${toolName}':\n        result = await ${fnName}(args);\n        break;\n`;
      const defaultIdx = indexContent.indexOf("      default:");
      if (defaultIdx !== -1) {
        indexContent = indexContent.slice(0, defaultIdx) + caseEntry + indexContent.slice(defaultIdx);
      }

      fs.writeFileSync(TOOLS_INDEX, indexContent, 'utf-8');

      // ── Auto-register in toolRegistry.ts ──────────────────────────────────
      const REGISTRY_PATH = path.join(process.cwd(), 'src', 'brain', 'toolRegistry.ts');
      if (fs.existsSync(REGISTRY_PATH)) {
        let registryContent = fs.readFileSync(REGISTRY_PATH, 'utf-8');
        const desc = (args.description || args.goal || 'Custom auto-generated tool').replace(/'/g, "\\'").replace(/\n/g, ' ');
        const friendlyName = toolName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        
        const newToolDef = `  {
    id: '${toolName}',
    name: '${friendlyName}',
    description: '${desc}',
    category: 'Automation',
    badge: 'CORE',
    source: 'brain/tools/${fileName}',
  },
`;
        const endOfToolsIdx = registryContent.indexOf('];', registryContent.indexOf('export const ALL_TOOLS'));
        if (endOfToolsIdx !== -1) {
          registryContent = registryContent.slice(0, endOfToolsIdx) + newToolDef + registryContent.slice(endOfToolsIdx);
          fs.writeFileSync(REGISTRY_PATH, registryContent, 'utf-8');
        }
      }

      return {
        success: true,
        reply: `✅ Tool created: src/brain/tools/${fileName}\n✅ Auto-registered in tools/index.ts and toolRegistry.ts.`,
        created: [filePath, TOOLS_INDEX, REGISTRY_PATH],
      };
    }

    // ── CREATE FEATURE (TOOL + SKILL) ─────────────────────────────────────────
    if (operation === 'create_feature' || operation as any === 'create_tool_and_skill') {
      // 1. Generate Tool Prompt
      const toolName = (args.name || 'new_feature').toLowerCase().replace(/\s+/g, '_');
      const toolFile = `${toolName}.ts`;
      const toolPath = path.join(TOOLS_DIR, toolFile);
      
      const toolPrompt = `You are a TypeScript expert. Create a tool function for OpenClaw.
Name: ${toolName}
Goal: ${args.description || args.goal}

- Export async function execute_${toolName}(args: any): Promise<{ success: boolean; reply: string; data?: any; error?: string }>
- Handle errors gracefully. Return only Node.js code. ONLY output code, no markdown.`;
      
      let toolCode = await ollamaChat({ model: getActiveModel(), messages: [{role: 'user', content: toolPrompt}], temperature: 0.2 });
      toolCode = toolCode.replace(/^```(?:typescript|ts)?\n?/, '').replace(/\n?```$/, '').trim();
      fs.writeFileSync(toolPath, toolCode, 'utf-8');

      // Register Tool in Index
      let indexContent = fs.readFileSync(TOOLS_INDEX, 'utf-8');
      indexContent = indexContent.slice(0, indexContent.indexOf('\n', indexContent.lastIndexOf('\nimport ')) + 1) + `import { execute_${toolName} } from './${toolName}';\n` + indexContent.slice(indexContent.indexOf('\n', indexContent.lastIndexOf('\nimport ')) + 1);
      const defaultIdx = indexContent.indexOf("      default:");
      if (defaultIdx !== -1) indexContent = indexContent.slice(0, defaultIdx) + `      case '${toolName}':\n        result = await execute_${toolName}(args);\n        break;\n` + indexContent.slice(defaultIdx);
      fs.writeFileSync(TOOLS_INDEX, indexContent, 'utf-8');

      // Register Tool in Registry
      const REGISTRY_PATH = path.join(process.cwd(), 'src', 'brain', 'toolRegistry.ts');
      let registryContent = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      const newToolDef = `  { id: '${toolName}', name: '${toolName}', description: '${(args.description || "").replace(/'/g, "\\'")}', category: 'Automation', badge: 'CORE', source: 'brain/tools/${toolFile}' },\n`;
      const endOfToolsIdx = registryContent.indexOf('];', registryContent.indexOf('export const ALL_TOOLS'));
      registryContent = registryContent.slice(0, endOfToolsIdx) + newToolDef + registryContent.slice(endOfToolsIdx);
      fs.writeFileSync(REGISTRY_PATH, registryContent, 'utf-8');

      // 2. Generate Skill Prompt
      const skillName = toolName;
      const skillFile = `${skillName}.md`;
      const skillPath = path.join(SKILLS_DIR, skillFile);
      
      const skillPrompt = `You are an expert at writing OpenClaw agent skill definition files.
Create a skill .md file.
Name: ${skillName}
Description: ${args.description}
Tool Access: MUST include ${toolName}

Format:
# Skill: ${skillName}
## Description ...
## Triggers ...
## 🔐 Tool Access ...
## Execution Steps ...
## Hard Rules ...
ONLY output raw markdown.`;
      
      const skillCode = await ollamaChat({ model: getActiveModel(), messages: [{role: 'user', content: skillPrompt}], temperature: 0.3 });
      fs.writeFileSync(skillPath, skillCode.trim(), 'utf-8');

      return {
        success: true,
        reply: `✅ Feature Deployed!\n- Tool created: ${toolFile}\n- Skill created: ${skillFile}\n- Both auto-registered.`,
        created: [toolPath, skillPath],
      };
    }

    return { success: false, reply: `Unknown operation: ${operation}`, error: 'UNKNOWN_OPERATION' };
  } catch (err: any) {
    return { success: false, reply: `Code executor failed: ${err.message}`, error: err.message };
  }
}
