import { writeWorkspaceFile, readWorkspaceFile } from './workspace';
import { ollamaChat } from '@/lib/ollama';

/**
 * Memory Service: Handles hybrid extraction (Regex + LLM) and structured sync.
 */

// In-RAM Session Memory Layer
const sessionMemories: Record<string, string[]> = {};

export function addSessionMemory(agentId: string, fact: string) {
  if (!sessionMemories[agentId]) sessionMemories[agentId] = [];
  sessionMemories[agentId].push(fact);
  // Cap session memory to last 20 turns
  if (sessionMemories[agentId].length > 20) sessionMemories[agentId].shift();
}

export function getSessionMemory(agentId: string) {
  return sessionMemories[agentId] || [];
}

/**
 * Extracts facts from the latest turn.
 * Uses Regex for explicit facts (I am, My name is, etc)
 * Falls back to LLM for nuanced context.
 */
export async function extractAndSyncMemory(agentId: string, userMsg: string, agentReply: string) {
  const facts: string[] = [];

  // 1. Regex Extraction (Fast Path)
  const patterns = [
    { regex: /my name is (.*?)([.!]|$)/i, label: 'User Name' },
    { regex: /call me (.*?)([.!]|$)/i, label: 'User Nickname' },
    { regex: /i prefer (.*?)([.!]|$)/i, label: 'Preference' },
    { regex: /i hate (.*?)([.!]|$)/i, label: 'Dislike' },
    { regex: /my (instagram|twitter|discord) is (.*?)([.!]|$)/i, label: 'Social Handle' }
  ];

  for (const p of patterns) {
    const match = userMsg.match(p.regex);
    if (match) facts.push(`${p.label}: ${match[1].trim()}`);
  }

  // 2. LLM Extraction (Nuance Path) - Only if length is significant or patterns missed
  if (facts.length === 0 && userMsg.length > 20) {
    try {
      const extractionPrompt = `Extract 1-2 key facts (preferences, contacts, names) from this user message as short bullet points. If nothing useful, return "NONE".\n\nUser: "${userMsg}"`;
      const res = await ollamaChat({
        messages: [{ role: 'system', content: 'You are a memory extraction unit. Reply only with bullet points or NONE.' }, { role: 'user', content: extractionPrompt }],
        temperature: 0.1
      });
      if (!res.includes('NONE')) {
        facts.push(...res.split('\n').map(s => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean));
      }
    } catch (e) {
      console.error('Memory extraction failed:', e);
    }
  }

  if (facts.length > 0) {
    await syncToMemoryFile(agentId, facts);
  }
}

async function syncToMemoryFile(agentId: string, newFacts: string[]) {
  const currentMemory = readWorkspaceFile(agentId, 'MEMORY.md');
  if (!currentMemory) return;

  const lines = currentMemory.split('\n');
  const criticalIdx = lines.indexOf('## Critical');
  const usefulIdx = lines.indexOf('## Useful');
  const tempIdx = lines.indexOf('## Temporary');

  // De-duplicate against existing lines
  const filteredFacts = newFacts.filter(f => !currentMemory.toLowerCase().includes(f.toLowerCase()));
  if (filteredFacts.length === 0) return;

  // Insert into "Useful" by default for extraction
  if (usefulIdx !== -1) {
    lines.splice(usefulIdx + 1, 0, ...filteredFacts.map(f => `- ${f}`));
  }

  // Retention Logic: Truncate Temporary if too long (Simplified logic for now)
  if (lines.length > 100) {
    const tempSection = lines.slice(tempIdx + 1);
    if (tempSection.length > 10) {
       lines.splice(tempIdx + 1, tempSection.length - 10);
    }
  }

  writeWorkspaceFile(agentId, 'MEMORY.md', lines.join('\n'));
}
