/**
 * Tutor Agent Service
 *
 * Orchestrates the AI Japanese tutor — manages conversation threads,
 * sends messages via the Gemini client, and persists conversation
 * history using the SQLite checkpointer.
 */

import { initGroqClient, getGroqClient, type ModelType } from './groq-client';
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
When the student asks to practice or says "quiz me", generate ONE exercise ONLY about items the student has already been exposed to (📙 STILL LEARNING or 📗 ALMOST MASTERED in the curriculum). Do NOT quiz on 📕 NOT YET LEARNED items — teach those first. If ALL items are unlearned, tell the student: "Let's learn something first before quizzing! Want to start with [item]?"

Example fill-blank exercise (for particle は):
[EXERCISE]{"type":"fill-blank","question":"私___学生です。","hint":"topic marker","answer":"は","item":"は"}[/EXERCISE]

Example fill-blank exercise (for vocab 飲む):
[EXERCISE]{"type":"fill-blank","question":"毎日コーヒー___飲みます。","hint":"object marker","answer":"を","item":"を"}[/EXERCISE]

Valid types: fill-blank, translate, choose.
- "item" must match a curriculum title for progress tracking
- Give ONE exercise at a time, then WAIT
- NEVER give the same exercise question twice in a conversation
- NEVER reuse the same sentence from a previous exercise, even to test a different blank. Each exercise MUST use a completely different sentence.

### ⚠️ Fill-in-the-Blank — THE GOLDEN RULE
**The ___ MUST be where the answer goes.** Replacing ___ with the answer MUST produce a correct sentence.
- If testing a PARTICLE (は, を, が, に, で, etc.), the particle itself must be ___.
- The answer word must NOT appear anywhere else in the question sentence.
- Before generating, mentally check: sentence.replace("___", answer) → is that correct Japanese? If not, redo.

## Handling Exercise Answers — CRITICAL
When the student responds to your exercise (either with an "[ANSWER]" prefix OR by typing directly in chat right after your exercise), evaluate their answer:
1. **Re-read your exercise first**: Check the question, hint, and answer fields from the exercise you gave. Evaluate ONLY against the concept you were testing.
2. **Be lenient**: Accept answers that are semantically correct even if worded differently. Accept alternative readings, synonyms, conjugation forms, or equivalent expressions.
3. Only mark as incorrect if the answer shows genuine misunderstanding of the tested concept.
4. Give brief, encouraging feedback (1-2 sentences max).
5. ALWAYS record the result with a [PROGRESS] block — even for answers typed directly (not via [ANSWER]).
6. **NEVER repeat the same exercise or item.** Next exercise MUST use a DIFFERENT curriculum item.

## Progress Tracking
When the student answers correctly or acceptably, record:
[PROGRESS]{"item":"は","correct":true}[/PROGRESS]
When they answer truly incorrectly (shows misunderstanding):
[PROGRESS]{"item":"は","correct":false}[/PROGRESS]
The "item" value must be ONLY the title as listed in the curriculum (e.g. "は", "食べる", "日"). Do NOT append the meaning or description — use only the short title before any "—" dash.

⚠️ IMPORTANT: Use ONLY straight double quotes (") in [PROGRESS], [FLASHCARD], and [EXERCISE] JSON blocks. Never use curly/smart quotes. ALWAYS include the closing [/PROGRESS] tag.

When recording a correct answer, include brief encouragement in your response (e.g., "Nice! 🎉" or "Perfect! ✨").

## Dictionary Results
If a [DICTIONARY] block is present, use it as ground-truth for definitions.

## Document Focus
If you see a [DOCUMENT FOCUS] hint, prioritize teaching items from that specific document. Teach them one at a time, waiting for the student's response before moving to the next item.`;

// ─── In-memory conversation cache ────────────────────────────

const conversationCache = new Map<string, ConversationMessage[]>();

// ─── Response Parsing ────────────────────────────────────────

/**
 * Normalize smart/curly quotes to straight quotes so JSON.parse works.
 * The AI sometimes outputs curly quotes instead of straight quotes which breaks parsing.
 */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')  // smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");  // smart single quotes
}

/**
 * Extract a JSON object string with balanced braces, handling nested
 * objects/arrays and braces inside quoted strings.
 * Returns the full balanced JSON substring starting at `start`, or null.
 */
function extractBalancedJson(text: string, start: number): string | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced
}

/**
 * Generic tagged-block parser: finds [TAG]{json}[/TAG] blocks,
 * extracts the JSON using balanced-brace matching, and strips them.
 */
function parseTaggedBlocks(response: string, tag: string): { cleanText: string; items: any[] } {
  const items: any[] = [];
  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;
  let result = response;
  let searchFrom = 0;

  // Collect all block regions first
  const regions: { start: number; end: number }[] = [];
  while (true) {
    const tagStart = result.indexOf(openTag, searchFrom);
    if (tagStart === -1) break;

    const afterOpen = tagStart + openTag.length;
    // Skip optional whitespace before {
    let jsonStart = afterOpen;
    while (jsonStart < result.length && /\s/.test(result[jsonStart])) jsonStart++;

    const jsonStr = extractBalancedJson(result, jsonStart);
    if (!jsonStr) { searchFrom = tagStart + 1; continue; }

    try {
      const parsed = JSON.parse(normalizeQuotes(jsonStr));
      items.push(parsed);
    } catch {
      // Skip malformed JSON
    }

    // Determine end of block (with or without closing tag)
    let blockEnd = jsonStart + jsonStr.length;
    // Skip optional whitespace after JSON
    while (blockEnd < result.length && /\s/.test(result[blockEnd])) blockEnd++;
    // Skip closing tag if present
    if (result.slice(blockEnd, blockEnd + closeTag.length) === closeTag) {
      blockEnd += closeTag.length;
    }
    regions.push({ start: tagStart, end: blockEnd });
    searchFrom = blockEnd;
  }

  // Strip regions in reverse to preserve indices
  for (let i = regions.length - 1; i >= 0; i--) {
    result = result.slice(0, regions[i].start) + result.slice(regions[i].end);
  }

  return { cleanText: result.trim(), items };
}

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
  const { cleanText, items } = parseTaggedBlocks(response, 'FLASHCARD');
  const cards: ParsedFlashcard[] = [];
  const validTypes = ['vocab', 'grammar', 'kanji'];

  for (const parsed of items) {
    if (parsed.front && parsed.back && parsed.type) {
      if (validTypes.includes(parsed.type)) {
        cards.push(parsed as ParsedFlashcard);
      }
    }
  }
  return { cleanText, cards };
}

function parseProgressMarkers(response: string): { cleanText: string; updates: ParsedProgress[] } {
  const { cleanText, items } = parseTaggedBlocks(response, 'PROGRESS');
  const updates: ParsedProgress[] = [];

  for (const parsed of items) {
    if (parsed.item && typeof parsed.correct === 'boolean') {
      updates.push({ item: parsed.item, correct: parsed.correct });
    }
  }
  return { cleanText, updates };
}

function parseExercises(response: string): { cleanText: string; exercises: ParsedExercise[] } {
  const { cleanText, items } = parseTaggedBlocks(response, 'EXERCISE');
  const exercises: ParsedExercise[] = [];
  const validTypes = ['fill-blank', 'translate', 'choose'];

  for (const parsed of items) {
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
  }
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
    const client = getGroqClient();
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
export function initTutor(apiKeys: string[], model: ModelType = 'qwen/qwen3-32b'): void {
  initGroqClient(model, apiKeys);
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
  const client = getGroqClient();

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

  // Parse embedded blocks — always chain cleaned text forward (no || fallback)
  const { cleanText: afterFlashcards, cards } = parseFlashcards(afterThinking);
  const { cleanText: afterProgress, updates } = parseProgressMarkers(afterFlashcards);
  const { cleanText: afterExercises, exercises } = parseExercises(afterProgress);
  const response = afterExercises || afterThinking;

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
      // Normalize the item name (AI may add extra context like "は — Topic Marker")
      const itemName = normalizeQuotes(update.item).trim();
      const nodes = await searchNodes(itemName);
      
      // Try multiple matching strategies:
      // 1. Exact match
      let match = nodes.find((n) => n.title === itemName);
      
      // 2. The item name contains the title (AI adds extra like "は — Topic Marker")
      if (!match) {
        match = nodes.find((n) => itemName.startsWith(n.title));
      }
      
      // 3. The title contains the item name
      if (!match) {
        match = nodes.find((n) => n.title.startsWith(itemName));
      }
      
      // 4. Split on " — " or " - " and match just the first part
      if (!match) {
        const cleanItem = itemName.split(/\s*[—\-]\s*/)[0].trim();
        if (cleanItem) {
          const cleanNodes = await searchNodes(cleanItem);
          match = cleanNodes.find((n) => n.title === cleanItem) 
               || cleanNodes.find((n) => n.title.startsWith(cleanItem))
               || cleanNodes[0]; // Best fuzzy match
        }
      }
      
      if (match) {
        await recordAnswer(match.nodeId, update.correct);
        progressUpdates++;
        console.log(`📊 Progress recorded: "${match.title}" correct=${update.correct}`);
      } else {
        console.warn(`Progress marker: item "${itemName}" not found in curriculum`);
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
