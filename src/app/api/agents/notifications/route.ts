import { NextResponse } from 'next/server';
import {
  getPendingNotifications,
  getUnreadCount,
  getPendingApprovalCount,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationStatus,
  addReplyToNotification,
  agentNotifications,
  loadFromFile,
} from '@/brain/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/notifications
 * Always reads from disk to guarantee data written by agent_notify is visible.
 */
export async function GET() {
  const fresh = loadFromFile();

  agentNotifications.length = 0;
  fresh.forEach(n => agentNotifications.push(n));

  const unreadCount = fresh.filter(n => !n.read).length;
  const pendingApprovalCount = fresh.filter(n => !n.read && n.requiresApproval).length;
  const pending = fresh.filter(n => !n.read);

  return NextResponse.json({
    notifications: pending,
    all: fresh,
    unreadCount,
    pendingApprovalCount,
  });
}

/**
 * POST /api/agents/notifications
 *
 * Actions:
 *   { action: 'dismiss',     id }
 *   { action: 'dismiss_all' }
 *   { action: 'reply',       id, replyText }
 *   { action: 'approve',     id, selectedOption?, selectedText?, customText? }
 *   { action: 'abandon',     id }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ── Dismiss single ──────────────────────────────────────────────────────
    if (body.action === 'dismiss' && body.id) {
      markNotificationRead(body.id);
      return NextResponse.json({ success: true });
    }

    // ── Dismiss all ─────────────────────────────────────────────────────────
    if (body.action === 'dismiss_all') {
      markAllNotificationsRead();
      return NextResponse.json({ success: true });
    }

    // ── Reply ────────────────────────────────────────────────────────────────
    if (body.action === 'reply' && body.id && body.replyText) {
      addReplyToNotification(body.id, body.replyText);
      return NextResponse.json({ success: true });
    }

    // ── Approve (send to agent via directive.json) ───────────────────────────
    if (body.action === 'approve' && body.id) {
      const freshNotifs = loadFromFile();
      const notif = freshNotifs.find(n => n.id === body.id);
      if (!notif) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      // Determine the text to send
      const sendText = body.customText?.trim() || body.selectedText?.trim() || '';

      const { getAgentStore, saveAgentStore, logAgentAction } = await import('@/brain/agentManager');
      const store = getAgentStore();
      const agentEntry = store.agents[notif.agentId];

      if (agentEntry) {
        // ✅ FIX 1: Set mode to 'executing' BEFORE writing the directive
        // This ensures Directive Trust bypass is active when the engine reads the directive.
        agentEntry.mode = 'executing';
        (agentEntry as any).approvedReplyText = sendText;
        (agentEntry as any).approvedAt = new Date().toISOString();

        // ✅ FIX 2: Resume from paused state immediately
        if (agentEntry.status === 'paused') {
          agentEntry.status = 'running';
          (agentEntry as any).waitingApproval = false;
        }

        saveAgentStore(store);
        logAgentAction(
          notif.agentId,
          `✅ Reply approved via UI: "${sendText.slice(0, 80)}". Mode set to EXECUTING. Agent resumed.`,
          'SYSTEM',
          'Approval Resume'
        );
      }

      // ✅ FIX 3: Write the directive AFTER setting mode, so engine sees correct state
      try {
        const { execute_agent_command } = await import('@/brain/tools/agent_command');
        await execute_agent_command({
          agent_id: notif.agentId,
          operation: 'execute',
          payload: {
            text: sendText,
            selectedOption: body.selectedOption || null,
            approvedAt: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        console.error('[Notifications] agent_command failed:', err.message);
        // Non-fatal: agent is already resumed, it will pick up from memory
      }

      updateNotificationStatus(body.id, 'handled', {
        selectedOption: body.selectedOption,
      });

      return NextResponse.json({ success: true, dispatched: true });
    }

    // ── Abandon ──────────────────────────────────────────────────────────────
    if (body.action === 'abandon' && body.id) {
      const freshNotifs = loadFromFile();
      const notif = freshNotifs.find(n => n.id === body.id);
      if (!notif) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      try {
        const { execute_agent_command } = await import('@/brain/tools/agent_command');
        await execute_agent_command({
          agent_id: notif.agentId,
          operation: 'abandon',
        });
      } catch {
        // Non-fatal: agent may already be stopped
      }

      try {
        const { getAgentStore, saveAgentStore, logAgentAction } = await import('@/brain/agentManager');
        const store = getAgentStore();
        const agentEntry = store.agents[notif.agentId];
        if (agentEntry && agentEntry.status === 'paused') {
          agentEntry.status = 'running';
          (agentEntry as any).waitingApproval = false;
          saveAgentStore(store);
          logAgentAction(notif.agentId, `⏭️ Notification abandoned by user. Agent resumed.`, 'SYSTEM', 'Abandon Resume');
        }
      } catch { /* Non-fatal */ }

      updateNotificationStatus(body.id, 'abandoned');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
