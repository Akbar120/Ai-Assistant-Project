/**
 * skillsEngine.ts — Two-Tier Skill Matching Engine
 * ─────────────────────────────────────────────────────────────
 * Tier 1: Fast keyword/regex match against skill files (zero cost)
 * Tier 2: LLM semantic fallback when Tier 1 returns nothing
 *         (handles Hinglish, messy, implicit prompts)
 *
 * Skills live in: src/brain/skills/*.md
 */

import fs from 'fs';
import path from 'path';
import { ollamaChat } from '@/lib/ollama';
import { getActiveModel } from '@/lib/ollama';

const SKILLS_DIR = path.join(process.cwd(), 'src', 'brain', 'skills');

export interface SkillMatch {
  file: string;
  name: string;
  content: string;
  score: number;
}

// ── Parse a skill .md file ────────────────────────────────────────────────────
function parseSkillFile(filePath: string): { name: string; keywords: string[]; content: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract name from first heading (# Skill: Name or 🧠 Skill: Name or # Name)
    const nameMatch = content.match(/^(?:#{1,2}\s*(?:skill:?\s*)?|🧠\s*skill:\s*)(.+)$/im);
    const name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');

    // Extract keywords from: Trigger, Purpose, Description, tool names, step verbs
    const triggerMatch = content.match(/##\s*trigger[s]?\s*\n([^#]+)/i);
    const descMatch = content.match(/##\s*(?:description|purpose)[s]?\s*\n([^#]+)/i);
    const toolMatch = content.match(/##\s*tool\s*access[s]?\s*\n([^#]+)/i);

    const rawKeywords: string[] = [];

    // Add name words as keywords
    rawKeywords.push(...name.toLowerCase().split(/[\s_\-]+/));

    // Add words from trigger/description blocks
    [triggerMatch?.[1], descMatch?.[1]].forEach(block => {
      if (block) {
        rawKeywords.push(
          ...block
            .toLowerCase()
            .replace(/[`*#\-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3)
        );
      }
    });

    // Add tool names (e.g. instagram_dm_reader → instagram, dm, reader)
    if (toolMatch?.[1]) {
      rawKeywords.push(
        ...toolMatch[1]
          .toLowerCase()
          .split(/[\s_\-`*\n,]+/)
          .filter(w => w.length > 2)
      );
    }

    // Dedup
    const keywords = [...new Set(rawKeywords)];

    return { name, keywords, content };
  } catch {
    return { name: path.basename(filePath, '.md'), keywords: [], content: '' };
  }
}

// ── Load all skills from /brain/skills/*.md ───────────────────────────────────
export function loadAllSkills(): Array<{ file: string; name: string; keywords: string[]; content: string }> {
  try {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    return fs.readdirSync(SKILLS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ file: f, ...parseSkillFile(path.join(SKILLS_DIR, f)) }));
  } catch {
    return [];
  }
}

// ── Tier 1: Keyword match ─────────────────────────────────────────────────────
function keywordMatch(message: string, skills: ReturnType<typeof loadAllSkills>): SkillMatch[] {
  const cleaned = message
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = new Set(cleaned.split(' '));

  const scored = skills.map(skill => {
    let score = 0;
    for (const kw of skill.keywords) {
      if (cleaned.includes(kw)) score += 2;          // substring match
      else if (words.has(kw)) score += 1;            // exact word match
    }
    return { file: skill.file, name: skill.name, content: skill.content, score };
  });

  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
}

// ── Tier 2: LLM semantic fallback ─────────────────────────────────────────────
async function semanticMatchUsingLLM(
  message: string,
  skills: ReturnType<typeof loadAllSkills>
): Promise<SkillMatch[]> {
  if (skills.length === 0) return [];

  const skillList = skills.map((s, i) => `${i + 1}. ${s.name} (${s.file})`).join('\n');

  const prompt = `You are a skill router. Given the user request, pick the most relevant skills from this list.

User request: "${message}"

Available skills:
${skillList}

Reply ONLY with a JSON array of skill file names that apply. Example: ["agent_creator.md","social_manager.md"]
If none apply, return: []`;

  try {
    const raw = await ollamaChat({
      model: getActiveModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      num_predict: 100,
    });

    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const files: string[] = JSON.parse(match[0]);
    return skills
      .filter(s => files.includes(s.file))
      .map(s => ({ file: s.file, name: s.name, content: s.content, score: 1 }));
  } catch {
    return [];
  }
}

// ── Main export: two-tier match ───────────────────────────────────────────────
export async function matchSkills(message: string): Promise<SkillMatch[]> {
  const allSkills = loadAllSkills();
  if (allSkills.length === 0) return [];

  // Tier 1
  const tier1 = keywordMatch(message, allSkills);
  if (tier1.length > 0) {
    console.log(`[SkillsEngine] Tier1 matched: ${tier1.map(s => s.name).join(', ')}`);
    return tier1.slice(0, 3); // top 3
  }

  // Tier 2 — LLM fallback
  console.log(`[SkillsEngine] Tier1 miss → Tier2 LLM fallback...`);
  const tier2 = await semanticMatchUsingLLM(message, allSkills);
  if (tier2.length > 0) {
    console.log(`[SkillsEngine] Tier2 matched: ${tier2.map(s => s.name).join(', ')}`);
  } else {
    console.log(`[SkillsEngine] No skills matched. Orchestrator will reason freely.`);
  }
  return tier2;
}

// ── Build compressed context block for system prompt injection ─────────────────
export function buildSkillContext(matches: SkillMatch[]): string {
  if (matches.length === 0) return '';

  // Trim each skill content to ~300 chars to stay within token budget
  const sections = matches.map(m => {
    const trimmed = m.content.length > 400
      ? m.content.slice(0, 400) + '...[truncated]'
      : m.content;
    return `--- Skill: ${m.name} ---\n${trimmed}`;
  });

  return `[SKILL_LAYER — MANDATORY]\nRelevant skills for this request:\n\n${sections.join('\n\n')}\n\nRULES:\n- You MUST follow the execution steps defined in these skills.\n- Do NOT invent a new approach if a skill already covers it.\n- If multiple skills match, list them and select the best fit before proceeding.\n- If no skill covers the task, ask before creating a new approach.`;
}
