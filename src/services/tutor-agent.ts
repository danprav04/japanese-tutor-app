/**
 * Tutor Agent Service
 *
 * Orchestrates the AI Japanese tutor — manages conversation threads,
 * sends messages via the Gemini client, and persists conversation
 * history using the SQLite checkpointer.
 */

import { initGroqClient, getGroqClient, type ModelType } from './groq-client';
import { saveCheckpoint, getLatestCheckpoint, listCheckpoints, setThreadTitle } from '../db/checkpointer';
import { buildCurriculumContext, getReviewContext, type CurriculumStatus, type CurriculumContextResult } from './curriculum-context';
import { recordAnswer, updateStudyStreak } from './progress-service';
import { searchNodes } from './curriculum-service';
import { lookupWord, formatForTutor } from './jisho-service';
import { getTeachingContext } from './rag-service';
import {
  detectDocumentLearningIntent,
  resolveDocument,
  getDocumentLearningContext,
  getAvailableDocuments,
} from './document-learning-service';
import { v4 as uuidv4 } from 'uuid';

import { ConversationMessage, ConversationState } from './tutor/types';
import { SYSTEM_PROMPT } from './tutor/prompt';
import {
  normalizeQuotes,
  parseProgressMarkers,
  stripThinkingBlocks,
  detectDictionaryQuery
} from './tutor/parsing';

// ─── In-memory conversation cache ────────────────────────────

const conversationCache = new Map<string, ConversationMessage[]>();

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

// ─── Public API ──────────────────────────────────────────────

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
  progressUpdates: number;
  progressItemNames: string[];
  curriculumStatus: CurriculumStatus;
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
  let curriculumStatus: CurriculumStatus = 'has_content';
  let sourceContext = '';
  try {
    const [currResult, reviewResult] = await Promise.all([
      buildCurriculumContext(),
      getReviewContext(),
    ]);
    curriculumContext = currResult.context;
    curriculumStatus = currResult.status;
    reviewContext = reviewResult;

    // Pre-fetch source material for target lesson and review nodes
    if (currResult.targetLessonNodeId || currResult.targetReviewNodeId) {
      const { lessonContext, reviewContext: reviewSourceCtx } = await getTeachingContext(
        currResult.targetLessonNodeId,
        currResult.targetReviewNodeId,
      );
      const parts = [lessonContext, reviewSourceCtx].filter(Boolean);
      if (parts.length > 0) {
        sourceContext = parts.join('\n\n');
      }
    }
  } catch (err) {
    console.warn('Failed to load curriculum/review context:', err);
  }

  const contextParts = [SYSTEM_PROMPT, curriculumContext, reviewContext, sourceContext, documentFocusHint]
    .filter(Boolean)
    .join('\n\n');

  const fullPrompt = `${contextParts}${dictionaryContext}\n\n---\n\n${conversationContext}\n\nSensei:`;

  // Generate response
  console.log('📱 User message:', userMessage);
  const rawResponse = await client.generate(fullPrompt);
  console.log('🤖 AI raw response:', rawResponse);

  // Strip any [THINK] blocks the AI may still generate (legacy safety net)
  const afterThinking = stripThinkingBlocks(rawResponse);

  // Parse embedded blocks — always chain cleaned text forward (no || fallback)
  const { cleanText: afterProgress, updates } = parseProgressMarkers(afterThinking);
  const response = afterProgress || afterThinking;

  console.log('🤖 AI parsed response:', response);
  console.log(`✂️ Parsed: ${rawResponse.length}→${response.length} chars, ${updates.length} progress`);

  // Record progress updates (BKT mastery)
  let progressUpdates = 0;
  const progressItemNames: string[] = [];
  for (const update of updates) {
    try {
      // Normalize the item name (AI may add extra context like "は — Topic Marker")
      const itemName = normalizeQuotes(update.item).trim();
      const nodes = await searchNodes(itemName);
      
      // Try multiple matching strategies (strict to loose):
      // 1. Exact title match
      let match = nodes.find((n) => n.title === itemName);
      
      // 2. The item name starts with the title (AI adds extra like "は — Topic Marker")
      if (!match) {
        match = nodes.find((n) => itemName.startsWith(n.title));
      }
      
      // 3. The title starts with the item name — only for longer names (>2 chars)
      //    Short names like "だ" would match too many items via LIKE %だ%
      if (!match && itemName.length > 2) {
        match = nodes.find((n) => n.title.startsWith(itemName));
      }
      
      // 4. Split on " — " or " - " and match just the first part
      if (!match) {
        const cleanItem = itemName.split(/\s*[—\-]\s*/)[0].trim();
        if (cleanItem && cleanItem !== itemName) {
          const cleanNodes = await searchNodes(cleanItem);
          match = cleanNodes.find((n) => n.title === cleanItem) 
               || cleanNodes.find((n) => cleanItem.length > 2 && n.title.startsWith(cleanItem));
          // No loose fallback — only match if we're confident
        }
      }

      // 5. For very short items (1-2 chars), try matching against title fragments
      //    e.g. "だ" should match "Expressing state-of-being with 「だ」"
      if (!match && itemName.length <= 2) {
        // Look for titles that contain the item wrapped in brackets (「だ」)
        match = nodes.find((n) => n.title.includes(`「${itemName}」`));
        // Or look for titles that end with the item name
        if (!match) {
          match = nodes.find((n) => n.title.endsWith(itemName));
        }
      }
      
      if (match) {
        await recordAnswer(match.nodeId, update.correct);
        progressUpdates++;
        progressItemNames.push(`${match.title} ${update.correct ? '✅' : '❌'}`);
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

  return { text: response, progressUpdates, progressItemNames, curriculumStatus };
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
