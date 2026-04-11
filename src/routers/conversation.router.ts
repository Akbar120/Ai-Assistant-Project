/**
 * CONVERSATION ROUTER
 * Handles general chat responses — no actions, no API calls.
 * Simply passes through the orchestrator's reply.
 */

export interface ConversationRouterInput {
  reply: string;
}

export interface ConversationRouterResult {
  reply: string;
}

/**
 * handleConversation — pass-through for general chat.
 * Provides a safe fallback if reply is empty.
 */
export function handleConversation(input: ConversationRouterInput): ConversationRouterResult {
  return {
    reply: input.reply?.trim() || 'Haan bolo! Main sun rahi hoon 😊',
  };
}
