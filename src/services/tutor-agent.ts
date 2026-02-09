/**
 * Tutor Agent Service
 *
 * Orchestrates the AI Japanese tutor — manages conversation threads,
 * sends messages via the Gemini client, and persists conversation
 * history using the SQLite checkpointer.
 */

import { initGeminiClient, getGeminiClient, type ModelType } from './gemini-client';
import { saveCheckpoint, getLatestCheckpoint, listCheckpoints } from '../db/checkpointer';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationState {
  messages: ConversationMessage[];
}

// ─── System Prompt ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are a friendly and encouraging Japanese language tutor named Sensei.

Your responsibilities:
- Teach Japanese vocabulary, grammar, and kanji at the student's level
- Provide clear explanations with romaji, hiragana/katakana, and kanji as appropriate
- Give example sentences with translations
- Correct mistakes gently and explain why
- Use spaced repetition concepts — review previously taught items periodically
- Adapt your teaching to the student's apparent skill level
- When the student asks to practice, create mini-exercises or quizzes
- Celebrate progress and encourage continued study

Guidelines:
- Keep responses concise but informative
- Use emoji sparingly for friendliness (🎌, ✨, 📝)
- Always show Japanese text alongside English translations
- For grammar, explain the pattern and give 2-3 examples
- For vocab, include reading (furigana), meaning, and usage
- Format responses for easy reading on mobile`;

// ─── In-memory conversation cache ────────────────────────────

const conversationCache = new Map<string, ConversationMessage[]>();

// ─── Public API ──────────────────────────────────────────────

/**
 * Initialize the tutor with API keys and model selection.
 */
export function initTutor(apiKeys: string[], model: ModelType = 'gemini-3-flash'): void {
  initGeminiClient(apiKeys, model);
}

/**
 * Create a new conversation thread and return its ID.
 */
export function createNewThread(): string {
  const threadId = uuidv4();
  conversationCache.set(threadId, []);
  return threadId;
}

/**
 * Send a message to the tutor and get a response.
 */
export async function sendMessage(threadId: string, userMessage: string): Promise<string> {
  const client = getGeminiClient();

  // Get or initialize conversation history
  let messages = conversationCache.get(threadId);
  if (!messages) {
    // Try to load from database
    const history = loadConversationHistory(threadId);
    messages = history;
    conversationCache.set(threadId, messages);
  }

  // Add user message
  const userMsg: ConversationMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  messages.push(userMsg);

  // Build conversation context for the model
  const conversationContext = messages
    .slice(-20) // Keep last 20 messages for context
    .map((m) => `${m.role === 'user' ? 'Student' : 'Sensei'}: ${m.content}`)
    .join('\n\n');

  const prompt = `${conversationContext}\n\nSensei:`;

  // Generate response
  const response = await client.generate(prompt, SYSTEM_PROMPT);

  // Add assistant message
  const assistantMsg: ConversationMessage = {
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
  };
  messages.push(assistantMsg);

  // Persist conversation state
  try {
    const checkpointId = uuidv4();
    const state: ConversationState = { messages };
    saveCheckpoint(threadId, checkpointId, state as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn('Failed to save conversation checkpoint:', err);
  }

  return response;
}

/**
 * Load conversation history from database for a given thread.
 */
export function loadConversationHistory(threadId: string): ConversationMessage[] {
  try {
    const checkpoint = getLatestCheckpoint(threadId);
    if (checkpoint?.data) {
      const state = checkpoint.data as unknown as ConversationState;
      if (Array.isArray(state.messages)) {
        return state.messages;
      }
    }
  } catch {
    // Database may not be ready yet
  }
  return [];
}
