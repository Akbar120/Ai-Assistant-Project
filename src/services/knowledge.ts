import fs from 'fs';
import path from 'path';

/**
 * Knowledge Service
 * Handles persistent storage of user corrections and learned name mappings.
 */

const DATA_PATH = path.join(process.cwd(), 'src/data/knowledge.json');

export interface Knowledge {
  nameCorrections: Record<string, string>; // misspelled -> correct
}

function ensureFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_PATH)) {
    const initial: Knowledge = { nameCorrections: {} };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
  }
}

export function getKnowledge(): Knowledge {
  try {
    ensureFile();
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[KnowledgeService] Failed to read knowledge:', err);
    return { nameCorrections: {} };
  }
}

export function saveKnowledge(knowledge: Knowledge) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(knowledge, null, 2));
  } catch (err) {
    console.error('[KnowledgeService] Failed to save knowledge:', err);
  }
}

export function addNameCorrection(misspelled: string, correct: string) {
  const knowledge = getKnowledge();
  knowledge.nameCorrections[misspelled.toLowerCase()] = correct;
  saveKnowledge(knowledge);
}
