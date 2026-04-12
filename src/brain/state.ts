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
