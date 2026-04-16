import fs from 'fs';
import path from 'path';

const SKILLS_DIR = path.join(process.cwd(), 'src', 'brain', 'skills');

/**
 * Known ClawHub skills registry.
 * These are pre-vetted skill definitions that can be installed on demand.
 * When Jenny is commanded to install a skill from ClawHub, she picks from here.
 */
const CLAWHUB_REGISTRY: Record<string, { name: string; description: string; content: string }> = {
  sentiment_analyzer: {
    name: 'Sentiment Analyzer',
    description: 'Analyzes tone, sentiment and urgency of text messages.',
    content: `# Skill: Sentiment Analyzer

## Description
Analyzes the emotional tone, urgency, and intent of any text message or conversation thread.

## Triggers
- Keywords: sentiment, tone, emotional, urgency, analyze text, feeling, mood

## 🔐 Tool Access
- (No external tool required — pure LLM analysis)

## Execution Steps
1. Receive text input from the requesting agent or user.
2. Identify the primary emotion: Positive / Negative / Neutral.
3. Assess urgency level: Urgent / Normal / Low priority.
4. Detect hidden intent (sarcasm, frustration, excitement).
5. Return a structured report: { emotion, urgency, intent, confidence }.

## Hard Rules
- Never expose raw JSON output to the user.
- Always present findings in plain language.
- Flag urgent messages for immediate human review.`,
  },
  email_composer: {
    name: 'Email Composer',
    description: 'Drafts professional emails and message templates from instructions.',
    content: `# Skill: Email Composer

## Description
Drafts high-quality, professional email and message templates based on given context and tone requirements.

## Triggers
- Keywords: email, compose, draft, write message, formal reply, professional

## 🔐 Tool Access
- (No external tool required — LLM generation only)

## Execution Steps
1. Receive the email subject, recipient context, and desired tone.
2. Draft 2-3 variations of the email body.
3. Label each draft: Formal / Semi-Formal / Casual.
4. Present to user for selection.
5. Finalize and hand off selected draft.

## Hard Rules
- Never send emails autonomously.
- Always present drafts before action.`,
  },
  memory_curator: {
    name: 'Memory Curator',
    description: 'Extracts, organizes and updates long-term agent memory files.',
    content: `# Skill: Memory Curator

## Description
Reviews daily logs and execution memory, then extracts key learnings into MEMORY.md for long-term persistence.

## Triggers
- Keywords: memory, remember, curate, clean memory, summarize logs

## 🔐 Tool Access
- code_executor (read_file, write_file operations)

## Execution Steps
1. Read the current MEMORY.md and the last 3 daily memory logs.
2. Identify repeated patterns, key decisions, and important facts.
3. Compress redundant entries into concise statements.
4. Write updated content back to MEMORY.md.
5. Log the curation event with a timestamp.

## Hard Rules
- Never delete MEMORY.md entirely.
- Always back up before overwriting.
- Flag anything marked as critical for manual review.`,
  },
  instagram_strategist: {
    name: 'Instagram Strategist',
    description: 'Plans and executes Instagram content strategy including posting schedules and engagement tactics.',
    content: `# Skill: Instagram Strategist

## Description
Develops and executes data-driven Instagram content strategy including scheduling, caption optimization, hashtag research, and engagement monitoring.

## Triggers
- Keywords: instagram strategy, post plan, content calendar, hashtags, ig growth, engagement

## 🔐 Tool Access
- instagram_feed_reader
- instagram_dm_reader
- caption_manager
- platform_post
- search_web

## Execution Steps
1. Run instagram_feed_reader to analyze recent posts and engagement.
2. Use search_web to identify trending hashtags and content formats in the niche.
3. Draft a 7-day content calendar using caption_manager.
4. Present the plan to the user for approval.
5. Upon confirmation, schedule posts via platform_post.
6. Monitor engagement daily via instagram_feed_reader.

## Hard Rules
- Never post without explicit user confirmation.
- Always include 3 hashtag options per post.
- Maximum 1 post per day unless explicitly instructed otherwise.`,
  },
};

export interface InstallSkillResult {
  success: boolean;
  reply: string;
  installed?: string;
  available?: string[];
  error?: string;
}

/**
 * install_skill — Jenny's ClawHub skill installer.
 *
 * Installs a pre-vetted skill from the ClawHub registry into brain/skills/,
 * making it immediately available to the skillsEngine and all agents.
 */
export async function execute_install_skill(args: {
  skill_name?: string;         // exact key in CLAWHUB_REGISTRY
  action?: 'list' | 'install'; // default: install
}): Promise<InstallSkillResult> {
  const { skill_name, action = args.skill_name ? 'install' : 'list' } = args;

  // ── List available skills ──────────────────────────────────────────────────
  if (action === 'list' || !skill_name) {
    const available = Object.entries(CLAWHUB_REGISTRY).map(
      ([key, v]) => `• ${key} — ${v.description}`
    );
    return {
      success: true,
      reply: `**ClawHub Available Skills:**\n\n${available.join('\n')}\n\nTo install: call install_skill with skill_name = one of the keys above.`,
      available: Object.keys(CLAWHUB_REGISTRY),
    };
  }

  // ── Install a specific skill ───────────────────────────────────────────────
  const normalized = skill_name.toLowerCase().replace(/\s+/g, '_');
  const skill = CLAWHUB_REGISTRY[normalized];

  if (!skill) {
    const keys = Object.keys(CLAWHUB_REGISTRY).join(', ');
    return {
      success: false,
      reply: `Skill "${skill_name}" not found in ClawHub. Available: ${keys}`,
      error: 'NOT_FOUND',
    };
  }

  const fileName = `${normalized}.md`;
  const filePath = path.join(SKILLS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return {
      success: false,
      reply: `Skill "${normalized}" is already installed at src/brain/skills/${fileName}.`,
      error: 'ALREADY_INSTALLED',
    };
  }

  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, skill.content, 'utf-8');

  return {
    success: true,
    reply: `✅ **${skill.name}** installed from ClawHub!\n\nPath: src/brain/skills/${fileName}\nDescription: ${skill.description}\n\nThe skill is now live in the Skills tab and will auto-activate when relevant.`,
    installed: fileName,
  };
}
