/**
 * ORCHESTRATOR APPROVAL & REJECTION DETECTION
 * ─────────────────────────────────────────────────────
 * Pure deterministic logic for detecting user approval,
 * rejection, and planning abort messages. No LLM involved.
 */

import { ALL_TOOL_IDS, TOOL_MAP } from './toolRegistry';

// ── Approval Detection Words ──────────────────────────────────────────────────
const APPROVAL_WORDS = [
  'yes', 'proceed', 'go ahead', 'theek hai', 'haan', 'approved',
  'kar do', 'chalo', 'bilkul', 'confirm', 'let\'s go',
  'okay', 'ok', 'sure', 'absolutely', 'correct', 'sahi hai', 'done',
  'execute it', 'do it', 'run it'
];

/**
 * isApprovalMessage — checks if user message contains approval intent
 * Uses pure regex matching, no LLM involved.
 */
export function isApprovalMessage(msg: string): boolean {
  const clean = msg.toLowerCase().trim();
  
  // Short message (< 100 chars) containing an approval word
  if (clean.length > 100) return false;
  
  // If it asks a question or asks to explain, it's not an approval
  if (clean.includes('?') || /\b(kya|kaise|kyun|how|why|what|explain|tell|batao)\b/i.test(clean)) {
    return false;
  }

  // Common simple approvals
  if (/^(yes|haan|ok|okay|yep|sure|y|go|chalo|done|kar do|sahi hai|perfect)$/i.test(clean)) return true;

  return APPROVAL_WORDS.some(w => {
    const re = new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|[!?.,])`, 'i');
    return re.test(clean) || clean === w;
  });
}

const REJECTION_WORDS = ['no', 'nahi', 'nahi chahiye', 'cancel', 'abort', 'stop', 'rehne do', 'ruk', 'wait', 'change'];

/**
 * isRejectionMessage — checks if user message contains rejection intent
 */
export function isRejectionMessage(msg: string): boolean {
  const clean = msg.toLowerCase().trim();
  if (clean.length > 60) return false;
  return REJECTION_WORDS.some(w => clean.includes(w));
}

/**
 * isFinalAgreement — checks if user has AGREED to finalize the plan.
 * Reads FULL SENTENCE INTENT, never isolated words.
 * Used only inside Planning Mode (Interactive Stage).
 */
export function isFinalAgreement(msg: string): boolean {
  const clean = msg.toLowerCase().trim();

  // Long messages are discussion/refinement — not agreements
  if (clean.split(/\s+/).length > 24) return false;

  // Questions are never agreements
  if (clean.includes('?') || /\b(kya|kaise|kyun|how|why|what|explain|batao)\b/i.test(clean)) return false;

  // Correction/negative intent
  if (/\b(nahi|nhi|mat|na|no|sahi karo|change|isko|isse|thoda|modify|update|aur|alag|warna|galat|wrong|fix|badle)\b/i.test(clean)) return false;

  // Must match a clear agreement PHRASE
  const AGREEMENT_PHRASES = [
    'yes this works', 'yeah this works', 'this works', 'this is good', "let's do this", 'lets do this',
    'perfect', 'go ahead', 'proceed', 'we can do this', 'we can build this', 'build this',
    'theek hai yeh', 'haan yeh sahi hai', 'bilkul', 'haan proceed',
    'looks good', 'sounds good', 'finalize', 'finalize it', 'finalize this',
    'haan theek hai', 'kar lo', 'yes proceed', 'yes go ahead',
    'i approve', 'approve this', 'approve', 'yes sure', 'haan bilkul',
    'karo proceed', 'start execution', 'theek hai karo', 'carry on',
    'go for it', 'kar de', 'kardo', 'theek hai kardo', 'lets proceed', "let's proceed",
    'continue with this', 'move forward', 'this plan is fine'
  ];

  if (AGREEMENT_PHRASES.some(phrase => clean.includes(phrase))) return true;
  
  // Simple "yes" or "haan" or "ok" also counts if it's short
  if (/^(yes|haan|ok|okay|yep|sure|y)$/i.test(clean)) return true;

  return false;
}

/**
 * isPlanningAbort — checks if user wants to abort planning entirely
 */
export function isPlanningAbort(msg: string): boolean {
  const clean = msg.toLowerCase().trim();
  // STRICT CHECK: Only trigger on exact standalone commands, not natural sentences
  return clean === 'abort' || clean === 'abort karo';
}

/**
 * buildToolCatalog — builds a formatted string of available tools
 */
export function buildToolCatalog(toolIds: string[]): string {
  if (!toolIds.length) return 'None';
  return toolIds
    .map(id => {
      const tool = TOOL_MAP[id];
      return tool ? `- ${tool.id}: ${tool.description}` : `- ${id}: registered tool`;
    })
    .join('\n');
}