/**
 * Tutor Agent Service
 *
 * Orchestrates the AI Japanese tutor — manages conversation threads,
 * sends messages via the Gemini client, and persists conversation
 * history using the SQLite checkpointer.
 */

import { initGeminiClient, getGeminiClient, type ModelType } from './gemini-client';
import { saveCheckpoint, getLatestCheckpoint, listCheckpoints } from '../db/checkpointer';
import { createFlashcard } from './card-service';
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
- Format responses for easy reading on mobile

Flashcard Generation:
When you teach a NEW vocabulary word, grammar point, or kanji, include a flashcard block at the END of your response using this exact format:
[FLASHCARD]{"front":"日本語 text","back":"English meaning (reading)","type":"vocab"}[/FLASHCARD]
Valid types: vocab, grammar, kanji. You may include multiple flashcard blocks.
Do NOT include flashcards for items the student already knows or that were previously taught.`;

// ─── In-memory conversation cache ────────────────────────────

const conversationCache = new Map<string, ConversationMessage[]>();

// ─── Flashcard Parsing ───────────────────────────────────────

interface ParsedFlashcard {
  front: string;
  back: string;
  type: 'vocab' | 'grammar' | 'kanji';
}

function parseFlashcards(response: string): { cleanText: string; cards: ParsedFlashcard[] } {
  const cards: ParsedFlashcard[] = [];
  const regex = /\[FLASHCARD\](\{[^]*?\})\[\/FLASHCARD\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.front && parsed.back && parsed.type) {
        const validTypes = ['vocab', 'grammar', 'kanji'];
        if (validTypes.includes(parsed.type)) {
          cards.push(parsed as ParsedFlashcard);
        }
      }
    } catch {
      // Skip malformed flashcard JSON
    }
  }

  // Remove flashcard markers from display text
  const cleanText = response.replace(/\[FLASHCARD\]\{[^]*?\}\[\/FLASHCARD\]/g, '').trim();

  return { cleanText, cards };
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Initialize the tutor with API keys and model selection.
 */
export function initTutor(apiKeys: string[], model: ModelType = 'gemini-3-flash-preview'): void {
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
/**
 * Send a message to the tutor and get a response.
 */
export async function sendMessage(threadId: string, userMessage: string): Promise<{ text: string; cardsCreated: number }> {
  const client = getGeminiClient();

  // Get or initialize conversation history
  let messages = conversationCache.get(threadId);
  if (!messages) {
    // Try to load from database
    const history = await loadConversationHistory(threadId);
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
  const rawResponse = await client.generate(prompt, SYSTEM_PROMPT);

  // Parse for embedded flashcards
  const { cleanText, cards } = parseFlashcards(rawResponse);
  const response = cleanText || rawResponse;

  // Auto-create flashcards
  let cardsCreated = 0;
  for (const card of cards) {
    try {
      await createFlashcard(card.front, card.back, card.type);
      cardsCreated++;
    } catch (err) {
      console.warn('Failed to create flashcard from chat:', err);
    }
  }

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
    await saveCheckpoint(threadId, checkpointId, state as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn('Failed to save conversation checkpoint:', err);
  }

  return { text: response, cardsCreated };
}

/**
 * Load conversation history from database for a given thread.
 */
export async function loadConversationHistory(threadId: string): Promise<ConversationMessage[]> {
  try {
    const checkpoint = await getLatestCheckpoint(threadId);
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

