/**
 * CAPTION ROUTER
 * Handles the "caption" action — no posting, just returns suggestions.
 * The orchestrator already generated caption suggestions in `data.suggestions`.
 * This router formats them into a user-friendly reply.
 */

export interface CaptionRouterInput {
  suggestions: string[];
  reply: string; // from orchestrator
}

export interface CaptionRouterResult {
  reply: string;
}

/**
 * handleCaption — formats caption suggestions into a clean reply.
 * No API calls, no side effects.
 */
export function handleCaption(input: CaptionRouterInput): CaptionRouterResult {
  const { suggestions, reply } = input;

  if (!suggestions || suggestions.length === 0) {
    return { reply: reply || 'Yeh lo ek caption idea! Batao kaisa laga?' };
  }

  // If the orchestrator already embedded suggestions in `reply`, use it directly
  if (reply && reply.trim().length > 20) {
    return { reply };
  }

  // Otherwise, format the suggestions list
  const formatted = suggestions
    .map((s, i) => {
      const labels = ['✨ Main', '🔥 Viral', '💎 Short'];
      const label = labels[i] ?? `Option ${i + 1}`;
      return `**${label}:**\n${s}`;
    })
    .join('\n\n');

  return {
    reply: `${formatted}\n\nKaunsa choose karoge? Ya koi edit chahiye? 😊`,
  };
}
