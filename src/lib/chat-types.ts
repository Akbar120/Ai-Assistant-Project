export interface ChatMessageFile {
  name: string;
  type: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source: 'chat' | 'voice' | 'agent' | 'system' | 'primary' | 'sync';
  hash?: string;
  status?: 'pending' | 'done' | 'error';
  streaming?: boolean;
  requestId?: string;
  timestamp: number;
  file?: ChatMessageFile;
  isPosting?: boolean;
  postResult?: { success: boolean; results?: Record<string, { success: boolean; error?: string }> };
  silent?: boolean;
  isThought?: boolean;
}
