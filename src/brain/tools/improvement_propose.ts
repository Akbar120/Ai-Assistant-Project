import { createImprovement } from '../improvementService';

/**
 * Tool: Propose System Improvement
 * ──────────────────────────────────────────────────────────────
 * Allows an agent to propose a structural change, code modification,
 * or skill upgrade. This request is sent to the 'Improvements' tab
 * for user review.
 */
export async function execute_improvement_propose(args: {
  title: string;
  what: string;
  why: string;
  files: string[];
  patch: string;
  requestedBy?: string;
  if_approved?: string;
  if_rejected?: string;
}) {
  try {
    const request = createImprovement({
      requestedBy: args.requestedBy || 'orchestrator',
      title: args.title,
      what: args.what,
      why: args.why,
      files: args.files,
      patch: args.patch,
      if_approved: args.if_approved || 'Change applied successfully.',
      if_rejected: args.if_rejected || 'Change rejected by user.',
    });

    return {
      success: true,
      reply: `✅ Improvement proposed: "${args.title}". It has been sent to the Improvements tab for review.`,
      id: request.id
    };
  } catch (err: any) {
    return {
      success: false,
      reply: `❌ Failed to propose improvement: ${err.message}`,
      error: err.message
    };
  }
}
