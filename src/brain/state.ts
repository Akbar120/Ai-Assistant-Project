/**
 * Brain State Manager
 * Unified store for pending actions awaiting user confirmation.
 */

export interface PendingAction {
  type: 'dm' | 'agent_spawn' | 'agent_edit';
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

export let agentNotifications: { agentId: string, agentName: string, text: string, timestamp: string }[] = [];

export function addAgentNotification(agentId: string, agentName: string, text: string) {
  agentNotifications.push({
    agentId,
    agentName,
    text,
    timestamp: new Date().toLocaleTimeString()
  });
  // Keep only last 10 notifications to avoid memory bloat
  if (agentNotifications.length > 10) agentNotifications.shift();
}

export function clearAgentNotifications() {
  agentNotifications = [];
}
