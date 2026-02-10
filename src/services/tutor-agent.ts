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
import { buildCurriculumContext } from './curriculum-context';
import { recordAnswer } from './progress-service';
import { updateStudyStreak } from './progress-service';
import { searchNodes } from './curriculum-service';
import {
  detectDocumentLearningIntent,
  resolveDocument,
  getDocumentLearningContext,
  getAvailableDocuments,
  type DocumentLearningState,
} from './document-learning-service';
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

You have access to the student's CURRICULUM STATUS below. Use it to guide your teaching:

## Teaching Strategy (SRS-Driven)
1. **Prioritize unmastered items** (📕 NOT YET LEARNED section) — introduce these in your lessons
2. **Review weak items** (📙 STILL LEARNING section) — weave them into conversations and exercises
3. **Lightly reinforce** (📗 ALMOST MASTERED section) — mention these occasionally in context
4. **Skip mastered items** (✅) — don't re-teach unless the student asks
5. When starting a new conversation, pick 2-3 unmastered items to teach as a coherent mini-lesson
6. Mix grammar + vocab together (e.g., teach a grammar pattern using vocab from the curriculum)
7. After explaining, quiz the student on what you just taught

## Response Guidelines
- Keep responses concise but informative (mobile screen)
- Use emoji sparingly for friendliness (🎌, ✨, 📝)
- Always show Japanese text alongside English translations
- For grammar, explain the pattern and give 2-3 examples
- For vocab, include reading (furigana), meaning, and usage
- When the student asks to practice, create exercises using curriculum items
- Celebrate progress and encourage continued study

## Flashcard Generation
When you teach a NEW vocabulary word, grammar point, or kanji, include a flashcard block at the END of your response:
[FLASHCARD]{"front":"日本語 text","back":"English meaning (reading)","type":"vocab"}[/FLASHCARD]
Valid types: vocab, grammar, kanji. You may include multiple blocks.
Do NOT include flashcards for items already in the curriculum (check the status below).

## Progress Tracking
When you quiz the student and they answer, record their result using:
[PROGRESS]{"item":"exact item title from curriculum","correct":true}[/PROGRESS]
[PROGRESS]{"item":"exact item title from curriculum","correct":false}[/PROGRESS]
Use this EVERY time you verify the student's understanding — after quizzes, exercises, or when they use a word/pattern correctly in conversation.
The "item" must match a title from the curriculum status above. Set "correct" to true if they got it right, false if wrong.`;

// ─── Document Learning System Prompt ─────────────────────────

const DOCUMENT_LEARNING_PROMPT = `You are a friendly and encouraging Japanese language tutor named Sensei.

You are in DOCUMENT LEARNING MODE. The student wants to learn from a specific document.
Below you will see the document's curriculum items and the student's progress on each.

## Teaching Rules (CRITICAL — follow these strictly)
1. **Teach ONE item at a time** — never introduce multiple new items in a single message
2. **Keep responses SHORT** — 3-5 sentences max. Mobile screen, remember!
3. **Wait for the student's answer** before moving on to the next item
4. **Start from the 🎯 NEXT ITEM TO TEACH** shown in the document status
5. **Follow this flow for each item:**
   a. Introduce the item (what it means, how to read it)
   b. Give one clear example
   c. Ask a simple question to check understanding
   d. If they get it right → mark progress and move to next item
   e. If they get it wrong → explain again briefly, give another example, re-quiz
6. **Never dump a list of items** — the student should only see one item at a time
7. **Celebrate small wins** — when they master an item, acknowledge it! 🎉
8. When ALL items are mastered, congratulate them and suggest reviewing weak items

## Response Guidelines
- Keep responses concise (mobile screen)
- Use emoji sparingly for friendliness (🎌, ✨, 📝)
- Always show Japanese text alongside English translations
- For vocab: include reading (furigana), meaning, and one usage example
- For grammar: explain the pattern and give one example
- For kanji: show readings (on/kun) and meaning

## Flashcard Generation
When you teach a NEW vocabulary word, grammar point, or kanji, include a flashcard block at the END of your response:
[FLASHCARD]{"front":"日本語 text","back":"English meaning (reading)","type":"vocab"}[/FLASHCARD]
Valid types: vocab, grammar, kanji. Only include ONE flashcard per message.

## Progress Tracking
When you quiz the student and they answer, record their result using:
[PROGRESS]{"item":"exact item title from document","correct":true}[/PROGRESS]
[PROGRESS]{"item":"exact item title from document","correct":false}[/PROGRESS]
Use this EVERY time you verify the student's understanding.`;

// ─── In-memory conversation cache ────────────────────────────

const conversationCache = new Map<string, ConversationMessage[]>();

// ─── Per-thread document learning state ──────────────────────

const documentLearningState = new Map<string, DocumentLearningState>();

/**
 * Check if a thread is in document learning mode.
 */
export function getThreadDocumentState(threadId: string): DocumentLearningState | null {
  return documentLearningState.get(threadId) || null;
}

/**
 * Clear document learning mode for a thread.
 */
export function clearThreadDocumentState(threadId: string): void {
  documentLearningState.delete(threadId);
}

// ─── Response Parsing ────────────────────────────────────────

interface ParsedFlashcard {
  front: string;
  back: string;
  type: 'vocab' | 'grammar' | 'kanji';
}

interface ParsedProgress {
  item: string;
  correct: boolean;
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

  const cleanText = response.replace(/\[FLASHCARD\]\{[^]*?\}\[\/FLASHCARD\]/g, '').trim();
  return { cleanText, cards };
}

function parseProgressMarkers(response: string): { cleanText: string; updates: ParsedProgress[] } {
  const updates: ParsedProgress[] = [];
  const regex = /\[PROGRESS\](\{[^]*?\})\[\/PROGRESS\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.item && typeof parsed.correct === 'boolean') {
        updates.push({ item: parsed.item, correct: parsed.correct });
      }
    } catch {
      // Skip malformed progress JSON
    }
  }

  const cleanText = response.replace(/\[PROGRESS\]\{[^]*?\}\[\/PROGRESS\]/g, '').trim();
  return { cleanText, updates };
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
export async function sendMessage(threadId: string, userMessage: string): Promise<{
  text: string;
  cardsCreated: number;
  progressUpdates: number;
}> {
  const client = getGeminiClient();

  // Get or initialize conversation history
  let messages = conversationCache.get(threadId);
  if (!messages) {
    const history = await loadConversationHistory(threadId);
    messages = history;
    conversationCache.set(threadId, messages);
  }

  // ─── Document learning intent detection ──────────────────
  const docIntent = detectDocumentLearningIntent(userMessage);
  if (docIntent) {
    try {
      const doc = await resolveDocument(docIntent);
      if (doc) {
        documentLearningState.set(threadId, {
          filename: doc.filename,
          documentName: doc.filename,
        });
        console.log(`📖 Document learning mode activated: ${doc.filename}`);
      } else {
        // List available documents so the AI can suggest them
        const available = await getAvailableDocuments();
        const docNames = available.map((d) => d.filename).join(', ');
        const hint = available.length > 0
          ? `Available documents: ${docNames}`
          : 'No documents have been uploaded yet.';
        
        // Add as a system hint in the user message
        userMessage = `${userMessage}\n\n[System: Document "${docIntent}" was not found. ${hint}]`;
      }
    } catch (err) {
      console.warn('Failed to detect document learning intent:', err);
    }
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
    .slice(-20)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Sensei'}: ${m.content}`)
    .join('\n\n');

  // ─── Choose prompt based on document learning mode ───────
  const docState = documentLearningState.get(threadId);
  let fullPrompt: string;

  if (docState) {
    // Document learning mode — use focused prompt + document context
    let docContext = '';
    try {
      docContext = await getDocumentLearningContext(docState.filename);
    } catch (err) {
      console.warn('Failed to load document learning context:', err);
    }

    fullPrompt = docContext
      ? `${DOCUMENT_LEARNING_PROMPT}\n\n${docContext}\n\n---\n\n${conversationContext}\n\nSensei:`
      : `${DOCUMENT_LEARNING_PROMPT}\n\n${conversationContext}\n\nSensei:`;
  } else {
    // Normal mode — use general curriculum context
    let curriculumContext = '';
    try {
      curriculumContext = await buildCurriculumContext();
    } catch (err) {
      console.warn('Failed to load curriculum context:', err);
    }

    fullPrompt = curriculumContext
      ? `${SYSTEM_PROMPT}\n\n${curriculumContext}\n\n---\n\n${conversationContext}\n\nSensei:`
      : `${SYSTEM_PROMPT}\n\n${conversationContext}\n\nSensei:`;
  }

  // Generate response
  const rawResponse = await client.generate(fullPrompt);

  // Parse embedded flashcards
  const { cleanText: afterFlashcards, cards } = parseFlashcards(rawResponse);

  // Parse embedded progress markers
  const { cleanText: afterProgress, updates } = parseProgressMarkers(afterFlashcards || rawResponse);
  const response = afterProgress || afterFlashcards || rawResponse;

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

  // Record progress updates (BKT mastery)
  let progressUpdates = 0;
  for (const update of updates) {
    try {
      // Look up the curriculum node by title
      const nodes = await searchNodes(update.item);
      const exact = nodes.find((n) => n.title === update.item);
      if (exact) {
        await recordAnswer(exact.nodeId, update.correct);
        progressUpdates++;
      } else {
        console.warn(`Progress marker: item "${update.item}" not found in curriculum`);
      }
    } catch (err) {
      console.warn(`Failed to record progress for "${update.item}":`, err);
    }
  }

  // Update daily study streak
  try {
    await updateStudyStreak();
  } catch {
    // Non-critical — don't block the response
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

  return { text: response, cardsCreated, progressUpdates };
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

