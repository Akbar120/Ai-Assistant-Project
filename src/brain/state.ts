/**
 * Brain State Manager
 * Unified store for pending actions and agent notifications.
 */

export interface PendingAction {
  type: 'dm' | 'agent_spawn' | 'agent_edit' | 'agent_delete';
  data: any;
}

let pendingAction: PendingAction | null = null;

export function setPendingAction(action: PendingAction) {
  pendingAction = action;
}

export function getPendingAction() {
  return pendingAction;
}

export function clearPendingAction() {
  pendingAction = null;
}

// ─── Agent Notification System ────────────────────────────────────────────────

export interface AgentNotification {
  id: string;
  agentId: string;
  agentName: string;
  text: string;
  timestamp: string;
  type: 'approval_needed' | 'completion' | 'error';
  read: boolean;
  requiresApproval: boolean;
}

export let agentNotifications: AgentNotification[] = [];

export function addAgentNotification(
  agentId: string,
  agentName: string,
  text: string,
  type: AgentNotification['type'] = 'completion',
  requiresApproval = false
) {
  // Deduplicate: skip if same agent sent same text within last 60 seconds
  const now = Date.now();
  const duplicate = agentNotifications.find(
    n => n.agentId === agentId && n.text === text && !n.read
  );
  if (duplicate) return;

  const notification: AgentNotification = {
    id: `notif_${now}_${Math.random().toString(36).slice(2, 6)}`,
    agentId,
    agentName,
    text,
    timestamp: new Date().toLocaleTimeString(),
    type,
    read: false,
    requiresApproval,
  };

  agentNotifications.push(notification);

  // Keep last 20 notifications
  if (agentNotifications.length > 20) agentNotifications.shift();
}

export function markNotificationRead(id: string) {
  const notif = agentNotifications.find(n => n.id === id);
  if (notif) notif.read = true;
}

export function markAllNotificationsRead() {
  agentNotifications.forEach(n => { n.read = true; });
}

export function getPendingNotifications(): AgentNotification[] {
  return agentNotifications.filter(n => !n.read);
}

export function getUnreadCount(): number {
  return agentNotifications.filter(n => !n.read).length;
}

export function getPendingApprovalCount(): number {
  return agentNotifications.filter(n => !n.read && n.requiresApproval).length;
}

export function clearAgentNotifications() {
  agentNotifications = [];
}
