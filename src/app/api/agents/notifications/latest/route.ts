import { NextResponse } from 'next/server';
import { agentNotifications, markNotificationRead } from '@/brain/state';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Find the latest unannounced notification
  const latest = agentNotifications
    .filter(n => !n.announced && n.status === 'pending')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (!latest) {
    return NextResponse.json({ found: false });
  }

  // Mark as announced in the backend state
  latest.announced = true;
  latest.status = 'announced';

  return NextResponse.json({
    found: true,
    notification: latest
  });
}

/**
 * POST: Handles status updates (abandon or handle)
 */
export async function POST(req: Request) {
  const { id, action } = await req.json();
  const notif = agentNotifications.find(n => n.id === id);

  if (!notif) {
    return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 });
  }

  if (action === 'abandon') {
    notif.status = 'abandoned';
    notif.read = true; // Clear it from sidebar too
  } else if (action === 'handled') {
    notif.status = 'handled';
    notif.read = true;
  }

  return NextResponse.json({ success: true, status: notif.status });
}
