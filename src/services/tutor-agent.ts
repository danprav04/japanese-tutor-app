/**
 * Tutor Agent Service
 *
 * Orchestrates the AI Japanese tutor — manages conversation threads,
 * sends messages via the Gemini client, and persists conversation
 * history using the SQLite checkpointer.
 */

import { initGeminiClient, getGeminiClient, type ModelType } from './gemini-client';
import { saveCheckpoint, getLatestCheckpoint, listCheckpoints, setThreadTitle } from '../db/checkpointer';
import { createFlashcard } from './card-service';
import { buildCurriculumContext, getReviewContext } from './curriculum-context';
import { recordAnswer } from './progress-service';
import { updateStudyStreak } from './progress-service';
import { searchNodes } from './curriculum-service';
import { lookupWord, formatForTutor } from './jisho-service';
import {
  detectDocumentLearningIntent,
  resolveDocument,
  getDocumentLearningContext,
  getAvailableDocuments,
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

const SYSTEM_PROMPT = `You are a friendly Japanese language tutor named Sensei. You chat with students on a MOBILE app.

## CRITICAL — Response Length
- Keep responses to **2-4 sentences**. This is a phone screen, not a textbook.
- Only expand to 5+ sentences if the student specifically asks for a detailed explanation.
- Use bullet points for lists, never paragraphs.
- ONE concept per message. Don't teach 3 things at once.

## Teaching Strategy (Curriculum-Driven)
You have access to the student's CURRICULUM STATUS below.
1. **Prioritize unmastered items** (📕 NOT YET LEARNED) — teach these first
2. **Review weak items** (📙 STILL LEARNING) — weave into conversation naturally
3. **Skip mastered items** (✅) — don't re-teach unless asked
4. When starting a new conversation, pick 1-2 unmastered items to focus on
5. Mix grammar + vocab together naturally
6. After explaining something, ask the student a quick question to check understanding

## First Message Behavior
If there is NO conversation history, start by greeting the student briefly (1 sentence) and suggesting what to work on based on their curriculum.
Example: "Hey! 👋 Ready to learn some new vocab? I see you haven't covered 食べる (to eat) yet — want to start there?"

## Contextual SRS Review
If there is an "ITEMS DUE FOR REVIEW" section below, work at least ONE review item into your response naturally as an example sentence or question. Do NOT create a separate review section.

## Pitch Accent
When introducing vocabulary, include the pitch accent pattern:
- Use H (high) / L (low) notation: e.g., はし (箸) — chopsticks — Pitch: HL
- For compound words: がっこう (学校) — school — Pitch: LHLL

## Flashcard Generation — STRICT RULES
⚠️ Do NOT generate flashcards by default. ONLY create a flashcard when:
1. The student explicitly asks ("save this", "make a flashcard", "add to my deck"), OR
2. You are doing a structured teach-and-quiz session and introduce a genuinely NEW item not already in the curriculum

Most responses should have ZERO flashcard blocks. When you do create one:
[FLASHCARD]{"front":"日本語 text","back":"English meaning (reading) [Pitch: HLL]","type":"vocab"}[/FLASHCARD]
Valid types: vocab, grammar, kanji.

## Exercise Generation (Quiz Mode)
When the student asks to practice, be quizzed, or says "quiz me", generate ONE exercise:
[EXERCISE]{"type":"fill-blank","question":"私は毎日コーヒーを___ます。","hint":"to drink","answer":"飲み","item":"飲む"}[/EXERCISE]
Valid types: fill-blank, translate, choose.
- "item" must match a curriculum title for progress tracking
- Give ONE exercise at a time, then WAIT
- When you include an [EXERCISE] block, your text should briefly introduce the exercise (1 sentence max), NOT repeat the question in prose

## Handling Exercise Answers
When the student's message starts with "[ANSWER]", they are responding to your previous exercise.
1. Evaluate their answer and give brief Socratic feedback (explain WHY right/wrong)
2. Record the result with a [PROGRESS] block
3. Do NOT repeat the same exercise
4. Ask if they want another question or a different topic
5. If giving another question, make it about a DIFFERENT item from the curriculum

## Progress Tracking
When the student answers correctly (in a quiz, exercise, or naturally in conversation), record:
[PROGRESS]{"item":"exact item title from curriculum","correct":true}[/PROGRESS]
When they answer incorrectly:
[PROGRESS]{"item":"exact item title from curriculum","correct":false}[/PROGRESS]

When recording a correct answer, include brief encouragement in your response (e.g., "Nice! 🎉" or "Perfect! ✨").

## Dictionary Results
If a [DICTIONARY] block is present, use it as ground-truth for definitions.

## Document Focus
If you see a [DOCUMENT FOCUS] hint, prioritize teaching items from that specific document. Teach them one at a time, waiting for the student's response before moving to the next item.`;

// ─── In-memory conversation cache ────────────────────────────

const conversationCache = new Map<string, ConversationMessage[]>();

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

export interface ParsedExercise {
  type: 'fill-blank' | 'translate' | 'choose';
  question: string;
  hint?: string;
  options?: string[];
  answer: string;
  item: string;
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

function parseExercises(response: string): { cleanText: string; exercises: ParsedExercise[] } {
  const exercises: ParsedExercise[] = [];
  const regex = /\[EXERCISE\](\{[^]*?\})\[\/EXERCISE\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const validTypes = ['fill-blank', 'translate', 'choose'];
      if (parsed.question && parsed.answer && validTypes.includes(parsed.type)) {
        exercises.push({
          type: parsed.type,
          question: parsed.question,
          hint: parsed.hint,
          options: parsed.options,
          answer: parsed.answer,
          item: parsed.item || '',
        });
      }
    } catch {
      // Skip malformed exercise JSON
    }
  }

  const cleanText = response.replace(/\[EXERCISE\]\{[^]*?\}\[\/EXERCISE\]/g, '').trim();
  return { cleanText, exercises };
}

// ─── Legacy: strip any [THINK] blocks if the AI still generates them ───

function stripThinkingBlocks(response: string): string {
  return response.replace(/\[THINK\][^]*?\[\/THINK\]/g, '').trim();
}

// ─── Public API ──────────────────────────────────────────────

// ─── Conversation Summarization ──────────────────────────────

const SUMMARIZATION_THRESHOLD = 20;
const KEEP_RECENT = 10;

/**
 * Summarize older messages when conversation grows too long.
 * Replaces messages[0...-KEEP_RECENT] with a compact summary.
 */
async function summarizeIfNeeded(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
  if (messages.length <= SUMMARIZATION_THRESHOLD) return messages;

  const oldMessages = messages.slice(0, messages.length - KEEP_RECENT);
  const recentMessages = messages.slice(messages.length - KEEP_RECENT);

  // Build text to summarize
  const textToSummarize = oldMessages
    .map((m) => `${m.role === 'user' ? 'Student' : 'Sensei'}: ${m.content}`)
    .join('\n');

  try {
    const client = getGeminiClient();
    const summaryPrompt = `Summarize this Japanese tutoring conversation in 3-5 bullet points. Focus on: what was taught, what the student struggled with, and what was mastered. Be concise.\n\n${textToSummarize}`;
    const summary = await client.generate(summaryPrompt);

    const summaryMsg: ConversationMessage = {
      role: 'assistant',
      content: `[Previous conversation summary]\n${summary}`,
      timestamp: new Date().toISOString(),
    };

    return [summaryMsg, ...recentMessages];
  } catch (err) {
    console.warn('Failed to summarize conversation:', err);
    // Fallback: just keep recent messages
    return recentMessages;
  }
}

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
export async function sendMessage(threadId: string, userMessage: string): Promise<{
  text: string;
  cardsCreated: number;
  progressUpdates: number;
  exercises: ParsedExercise[];
}> {
  const client = getGeminiClient();

  // Get or initialize conversation history
  let messages = conversationCache.get(threadId);
  if (!messages) {
    const history = await loadConversationHistory(threadId);
    messages = history;
    conversationCache.set(threadId, messages);
  }

  // ─── Document focus detection ──────────────────────────────
  // Instead of a separate "mode", we inject a hint for the AI
  let documentFocusHint = '';
  const docIntent = detectDocumentLearningIntent(userMessage);
  if (docIntent) {
    try {
      const doc = await resolveDocument(docIntent);
      if (doc) {
        const docContext = await getDocumentLearningContext(doc.filename);
        documentFocusHint = `\n\n[DOCUMENT FOCUS: "${doc.filename}"]\n${docContext}`;
        console.log(`📖 Document focus detected: ${doc.filename}`);
      } else {
        // List available documents so the AI can suggest them
        const available = await getAvailableDocuments();
        const docNames = available.map((d) => d.filename).join(', ');
        const hint = available.length > 0
          ? `Available documents: ${docNames}`
          : 'No documents have been uploaded yet.';
        
        userMessage = `${userMessage}\n\n[System: Document "${docIntent}" was not found. ${hint}]`;
      }
    } catch (err) {
      console.warn('Failed to detect document learning intent:', err);
    }
  }

  // ─── Jisho dictionary lookup ──────────────────────────────
  let dictionaryContext = '';
  try {
    const dictQuery = detectDictionaryQuery(userMessage);
    if (dictQuery) {
      const results = await lookupWord(dictQuery);
      if (results.length > 0) {
        dictionaryContext = `\n\n[DICTIONARY]\n${formatForTutor(results)}\n[/DICTIONARY]`;
      }
    }
  } catch (err) {
    console.warn('Jisho lookup failed (non-critical):', err);
  }

  // Add user message
  const userMsg: ConversationMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  messages.push(userMsg);

  // Summarize if conversation is getting too long
  messages = await summarizeIfNeeded(messages);
  conversationCache.set(threadId, messages);

  // Build conversation context for the model
  const conversationContext = messages
    .slice(-20)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Sensei'}: ${m.content}`)
    .join('\n\n');

  // ─── Build unified prompt ──────────────────────────────────
  let curriculumContext = '';
  let reviewContext = '';
  try {
    [curriculumContext, reviewContext] = await Promise.all([
      buildCurriculumContext(),
      getReviewContext(),
    ]);
  } catch (err) {
    console.warn('Failed to load curriculum/review context:', err);
  }

  const contextParts = [SYSTEM_PROMPT, curriculumContext, reviewContext, documentFocusHint]
    .filter(Boolean)
    .join('\n\n');

  const fullPrompt = `${contextParts}${dictionaryContext}\n\n---\n\n${conversationContext}\n\nSensei:`;

  // Generate response
  console.log('🤖 asking gemini...');
  const rawResponse = await client.generate(fullPrompt);
  console.log('🤖 got raw response');

  // Strip any [THINK] blocks the AI may still generate (legacy safety net)
  const afterThinking = stripThinkingBlocks(rawResponse);

  // Parse embedded flashcards
  const { cleanText: afterFlashcards, cards } = parseFlashcards(afterThinking);

  // Parse embedded progress markers
  const { cleanText: afterProgress, updates } = parseProgressMarkers(afterFlashcards || afterThinking);

  // Parse embedded exercises
  const { cleanText: afterExercises, exercises } = parseExercises(afterProgress || afterFlashcards || afterThinking);
  const response = afterExercises || afterProgress || afterFlashcards || afterThinking;

  console.log(`✂️ Parsed: ${rawResponse.length}→${response.length} chars, ${cards.length} cards, ${exercises.length} exercises, ${updates.length} progress`);

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
    // Non-critical
  }

  // Add assistant message
  const assistantMsg: ConversationMessage = {
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
  };
  messages.push(assistantMsg);

  // Persist conversation state & generate title
  try {
    const checkpointId = uuidv4();
    const state: ConversationState = { messages };

    // Generate title for new conversations (first exchange = 2 messages)
    let titleMetadata: Record<string, unknown> | undefined;
    if (messages.length === 2) {
      try {
        const titlePrompt = `Generate a very short title (3-5 words, no quotes) for this tutoring conversation. First message: "${messages[0].content.slice(0, 100)}"\nTitle:`;
        const title = await client.generate(titlePrompt);
        const cleanTitle = title.replace(/["']/g, '').trim().slice(0, 50);
        if (cleanTitle) {
          titleMetadata = { thread_title: cleanTitle };
        }
      } catch {
        // Non-critical
      }
    }

    // Save checkpoint WITH title metadata (fixes race condition)
    await saveCheckpoint(
      threadId,
      checkpointId,
      state as unknown as Record<string, unknown>,
      undefined,
      titleMetadata,
    );
  } catch (err) {
    console.warn('Failed to save conversation checkpoint:', err);
  }

  return { text: response, cardsCreated, progressUpdates, exercises };
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

// ─── Dictionary Query Detection ──────────────────────────────

/**
 * Detect if the user is asking about a specific Japanese word.
 * Returns the query string if detected, null otherwise.
 */
function detectDictionaryQuery(message: string): string | null {
  const patterns = [
    /what (?:does|is|means?) ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
    /(?:meaning|definition) of ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
    /([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)(?:の意味|って(?:なに|何)|とは|ってどういう意味)/,
    /look ?up ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
    /translate ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}
