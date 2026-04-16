import { NextResponse } from 'next/server';
import {
  getPendingNotifications,
  getUnreadCount,
  getPendingApprovalCount,
  markNotificationRead,
  markAllNotificationsRead,
  agentNotifications,
} from '@/brain/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/notifications
 * Returns all pending (unread) notifications + counts.
 * Used by Sidebar badge and ChatPage proactive injection.
 */
export async function GET() {
  return NextResponse.json({
    notifications: getPendingNotifications(),
    unreadCount: getUnreadCount(),
    pendingApprovalCount: getPendingApprovalCount(),
    all: agentNotifications,
  });
}

/**
 * POST /api/agents/notifications
 * body: { action: 'dismiss', id: string }
 *    or { action: 'dismiss_all' }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'dismiss' && body.id) {
      markNotificationRead(body.id);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'dismiss_all') {
      markAllNotificationsRead();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
