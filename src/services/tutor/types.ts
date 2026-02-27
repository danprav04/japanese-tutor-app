export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationState {
  messages: ConversationMessage[];
}

export interface ParsedProgress {
  item: string;
  correct: boolean;
}
