import { addAgentNotification } from '../state';

/**
 * TOOL: agent_notify
 * Allows an autonomous agent to send a structured notification/report to Jenny.
 * Use this when findings need operator (user) attention or approval.
 *
 * type:
 *   'approval_needed' — agent is paused, waiting for user decision
 *   'completion'      — agent finished a task, reporting result
 *   'error'           — agent encountered an unrecoverable error
 */
export async function execute_agent_notify(
  args: {
    text: string;
    type?: 'approval_needed' | 'completion' | 'error';
    metadata?: any;
  },
  agentId: string,
  agentName: string
) {
  try {
    if (!args.text) {
      throw new Error('Notification text is required.');
    }

    const type = args.type || 'completion';
    const requiresApproval = type === 'approval_needed';

    addAgentNotification(agentId, agentName, args.text, type, requiresApproval);

    return {
      success: true,
      reply: `✅ Notification sent to Jenny [${type}]: "${args.text.slice(0, 60)}..."`,
      data: {
        sent: true,
        type,
        requiresApproval,
        timestamp: new Date().toISOString()
      }
    };
  } catch (err: any) {
    return {
      success: false,
      reply: `❌ Failed to send notification: ${err.message}`,
      error: err.message
    };
  }
}
