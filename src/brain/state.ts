/**
 * Brain State Manager
 * Unified store for pending actions and agent notifications.
 * Notifications are persisted to src/data/agent_notifications.json
 * so they survive server restarts.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PendingAction {
  type: 'dm' | 'agent_spawn' | 'agent_edit' | 'agent_delete' | 'error_recovery' | 'tool';
  data: any;
}

let pendingAction: PendingAction | null = null;

// ─── Conversation Context Tracker ─────────────────────────────────────────
// Tracks what topic Jenny was last discussing for context continuity
export interface ConversationContext {
  lastIntent: 'explaining' | 'editing' | 'creating' | 'discussing' | null;
  lastSubject: string; // skill name, agent name, etc.
  lastMessage: string; // what user said
  lastTimestamp: number;
}

let conversationContext: ConversationContext = {
  lastIntent: null,
  lastSubject: '',
  lastMessage: '',
  lastTimestamp: 0
};

export function setConversationContext(intent: ConversationContext['lastIntent'], subject: string, message: string) {
  conversationContext = {
    lastIntent: intent,
    lastSubject: subject,
    lastMessage: message,
    lastTimestamp: Date.now()
  };
}

export function getConversationContext(): ConversationContext {
  return conversationContext;
}

export function clearConversationContext() {
  conversationContext = {
    lastIntent: null,
    lastSubject: '',
    lastMessage: '',
    lastTimestamp: 0
  };
}

export function setPendingAction(action: PendingAction) {
  pendingAction = action;
}

export function getPendingAction() {
  return pendingAction;
}

export function clearPendingAction() {
  pendingAction = null;
}

// ─── Persistent Notification Store ───────────────────────────────────────────

const NOTIFICATIONS_FILE = path.join(process.cwd(), 'src', 'data', 'agent_notifications.json');

export interface AgentNotification {
  id: string;
  agentId: string;
  agentName: string;
  text: string;
  timestamp: string;
  type: 'approval_needed' | 'completion' | 'error';
  read: boolean;
  requiresApproval: boolean;
  announced: boolean; // Has it been presented in chat?
  status: 'pending' | 'announced' | 'abandoned' | 'handled';
  replies?: string[]; // User replies stored here
  selectedOption?: string; // Which A/B/C the user selected
  respondedAt?: string; // NEW: Track when the user responded
}

// ── Load from disk (always reads fresh — call this from API routes) ───────────
export function loadFromFile(): AgentNotification[] {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const raw = fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data.notifications) ? data.notifications : [];
    }
  } catch {
    // File missing or corrupt — start fresh
  }
  return [];
}

// ── Write to disk ─────────────────────────────────────────────────────────────
function saveToFile(notifications: AgentNotification[]) {
  try {
    const dir = path.dirname(NOTIFICATIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify({ notifications }, null, 2));
  } catch (err) {
    console.error('[State] Failed to persist notifications:', err);
  }
}

// ─── Agent Notification System ────────────────────────────────────────────────

export let agentNotifications: AgentNotification[] = loadFromFile();

export function addAgentNotification(
  agentId: string,
  agentName: string,
  text: string,
  type: AgentNotification['type'] = 'completion',
  requiresApproval = false
): AgentNotification | null {
  // ── Suppression Logic ─────────────────────────────────────────────────────
  // If an EXACT same notification was abandoned within the last 5 minutes, 
  // suppress it to prevent "abandon loops" where agents retry immediately.
  const FIVE_MINUTES = 5 * 60 * 1000;
  const wasRecentlyAbandoned = agentNotifications.some(n => 
    n.agentId === agentId && 
    n.text === text && 
    n.status === 'abandoned' && 
    (Date.now() - new Date(n.timestamp).getTime()) < FIVE_MINUTES
  );
  if (wasRecentlyAbandoned) {
    console.log(`[State] Suppressing duplicate abandoned notification for ${agentName}`);
    return null;
  }

  // ── Polling Replacement Logic ─────────────────────────────────────────────
  // For approval_needed: auto-abandon any existing pending/announced notification
  // from the same agent so only the latest DM report is ever active.
  if (type === 'approval_needed') {
    let changed = false;
    agentNotifications = agentNotifications.map(n => {
      if (n.agentId === agentId && (n.status === 'pending' || n.status === 'announced')) {
        changed = true;
        return { ...n, status: 'abandoned' as const, read: true };
      }
      return n;
    });
    if (changed) saveToFile(agentNotifications);
  } else {
    // For non-approval types: skip exact-text duplicates that are still unread
    const duplicate = agentNotifications.find(
      n => n.agentId === agentId && n.text === text && !n.read
    );
    if (duplicate) return duplicate;
  }

  const now = Date.now();
  const notification: AgentNotification = {
    id: `notif_${now}_${Math.random().toString(36).slice(2, 6)}`,
    agentId,
    agentName,
    text,
    timestamp: new Date().toISOString(),
    type,
    read: false,
    requiresApproval,
    announced: false,
    status: 'pending',
    replies: [],
  };

  agentNotifications.push(notification);

  // Keep last 100 notifications
  if (agentNotifications.length > 100) agentNotifications.shift();

  saveToFile(agentNotifications);
  return notification;
}

export function markNotificationRead(id: string) {
  const notif = agentNotifications.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    saveToFile(agentNotifications);
  }
}

export function markAllNotificationsRead() {
  agentNotifications.forEach(n => { n.read = true; });
  saveToFile(agentNotifications);
}

export function updateNotificationStatus(
  id: string,
  status: AgentNotification['status'],
  extra?: Partial<AgentNotification>
) {
  const notif = agentNotifications.find(n => n.id === id);
  if (notif) {
    notif.status = status;
    notif.read = true;
    if (extra) Object.assign(notif, extra);
    saveToFile(agentNotifications);
  }
}

export function addReplyToNotification(id: string, replyText: string) {
  const notif = agentNotifications.find(n => n.id === id);
  if (notif) {
    if (!notif.replies) notif.replies = [];
    notif.replies.push(replyText);
    saveToFile(agentNotifications);
  }
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
  saveToFile(agentNotifications);
}
