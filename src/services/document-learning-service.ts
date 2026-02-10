/**
 * Document Learning Service
 *
 * Handles the "learn [document name]" flow:
 * 1. Detects intent from user messages
 * 2. Resolves the document from the database
 * 3. Builds a document-scoped curriculum context with progress
 */

import { getDatabase } from '../db/database';

// ─── Types ───────────────────────────────────────────────────

export interface DocumentInfo {
  documentId: string;
  filename: string;
  fileType: string;
}

export interface DocumentLearningItem {
  nodeId: string;
  title: string;
  type: string;
  jlptLevel: number;
  meaning: string | null;
  masteryScore: number;
  attempts: number;
}

export interface DocumentLearningState {
  filename: string;
  documentName: string;
}

// ─── Intent Detection ────────────────────────────────────────

/**
 * Detect if the user wants to start learning a specific document.
 * Supports patterns like:
 *   "let's start learning X document"
 *   "start learning X"
 *   "learn X document"
 *   "study X"
 *   "teach me X"
 */
const LEARN_PATTERNS = [
  /(?:let'?s?\s+)?(?:start\s+)?(?:learning|learn|study|studying)\s+(?:the\s+)?(.+?)(?:\s+document)?$/i,
  /(?:teach\s+me)\s+(?:the\s+)?(.+?)(?:\s+document)?$/i,
  /(?:start|begin|continue)\s+(?:with\s+)?(?:the\s+)?(.+?)(?:\s+document)?$/i,
];

export function detectDocumentLearningIntent(message: string): string | null {
  const trimmed = message.trim();

  for (const pattern of LEARN_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out very short or generic phrases that aren't document names
      if (candidate.length >= 2 && !isGenericPhrase(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function isGenericPhrase(phrase: string): boolean {
  const generic = new Set([
    'japanese', 'nihongo', 'grammar', 'vocabulary', 'vocab',
    'kanji', 'hiragana', 'katakana', 'now', 'today', 'again',
    'more', 'something', 'anything', 'everything',
  ]);
  return generic.has(phrase.toLowerCase());
}

// ─── Document Resolution ─────────────────────────────────────

/**
 * Find a document by name (case-insensitive, partial match).
 * Returns the best matching document or null.
 */
export async function resolveDocument(name: string): Promise<DocumentInfo | null> {
  const db = getDatabase();

  // Try exact match first (case-insensitive)
  let result = await db.execute(
    `SELECT document_id, filename, file_type FROM documents
     WHERE LOWER(filename) = LOWER(?) AND processed = 1`,
    [name]
  );

  if (result.rows && result.rows.length > 0) {
    const row = result.rows[0] as any;
    return {
      documentId: row.document_id,
      filename: row.filename,
      fileType: row.file_type,
    };
  }

  // Try partial match (filename contains the search term)
  result = await db.execute(
    `SELECT document_id, filename, file_type FROM documents
     WHERE LOWER(filename) LIKE LOWER(?) AND processed = 1
     ORDER BY LENGTH(filename) ASC
     LIMIT 1`,
    [`%${name}%`]
  );

  if (result.rows && result.rows.length > 0) {
    const row = result.rows[0] as any;
    return {
      documentId: row.document_id,
      filename: row.filename,
      fileType: row.file_type,
    };
  }

  // Try without file extension
  const nameNoExt = name.replace(/\.\w+$/, '');
  if (nameNoExt !== name) {
    return resolveDocument(nameNoExt);
  }

  return null;
}

// ─── Document Learning Context ───────────────────────────────

/**
 * Build a learning context scoped to a specific document.
 * Shows all items from that document grouped by mastery, with
 * the next item to teach clearly highlighted.
 */
export async function getDocumentLearningContext(filename: string): Promise<string> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT cn.node_id, cn.title, cn.type, cn.jlpt_level, cn.content_payload,
            COALESCE(up.mastery_score, 0) as mastery_score,
            COALESCE(up.attempts, 0) as attempts
     FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     WHERE cn.source_file = ?
     ORDER BY up.mastery_score ASC, cn.type, cn.jlpt_level DESC`,
    [filename]
  );

  if (!result.rows || result.rows.length === 0) {
    return `No curriculum items found for document "${filename}".`;
  }

  const items: DocumentLearningItem[] = (result.rows as any[]).map((row) => {
    let meaning: string | null = null;
    if (row.content_payload) {
      try {
        const payload = JSON.parse(row.content_payload as string);
        meaning = payload.meaning || null;
      } catch {}
    }
    return {
      nodeId: row.node_id as string,
      title: row.title as string,
      type: row.type as string,
      jlptLevel: row.jlpt_level as number,
      masteryScore: row.mastery_score as number,
      attempts: row.attempts as number,
      meaning,
    };
  });

  // Group by mastery bands
  const unlearned = items.filter((i) => i.masteryScore < 0.3);
  const learning = items.filter((i) => i.masteryScore >= 0.3 && i.masteryScore < 0.7);
  const familiar = items.filter((i) => i.masteryScore >= 0.7 && i.masteryScore < 0.95);
  const mastered = items.filter((i) => i.masteryScore >= 0.95);

  const lines: string[] = [];
  lines.push(`=== DOCUMENT LEARNING MODE: "${filename}" ===`);
  lines.push(`Total items: ${items.length} | Mastered: ${mastered.length} | Learning: ${learning.length + familiar.length} | Not started: ${unlearned.length}`);
  lines.push('');

  // Highlight the NEXT item to teach
  const nextItem = unlearned[0] || learning[0] || familiar[0];
  if (nextItem) {
    const detail = nextItem.meaning ? ` — ${nextItem.meaning}` : '';
    lines.push(`🎯 NEXT ITEM TO TEACH: "${nextItem.title}"${detail} (${nextItem.type}, mastery: ${Math.round(nextItem.masteryScore * 100)}%)`);
    lines.push('');
  } else {
    lines.push('🎉 ALL ITEMS IN THIS DOCUMENT ARE MASTERED!');
    lines.push('');
  }

  // List unlearned items
  if (unlearned.length > 0) {
    lines.push('📕 NOT YET LEARNED:');
    for (const item of unlearned) {
      const detail = item.meaning ? ` — ${item.meaning}` : '';
      lines.push(`  • ${item.title}${detail} (${item.type})`);
    }
    lines.push('');
  }

  // List items in progress
  if (learning.length > 0) {
    lines.push('📙 STILL LEARNING:');
    for (const item of learning) {
      const detail = item.meaning ? ` — ${item.meaning}` : '';
      lines.push(`  • ${item.title}${detail} (mastery: ${Math.round(item.masteryScore * 100)}%)`);
    }
    lines.push('');
  }

  // Almost mastered
  if (familiar.length > 0) {
    lines.push('📗 ALMOST MASTERED:');
    const titles = familiar.map((i) => i.title).join(', ');
    lines.push(`  ${titles}`);
    lines.push('');
  }

  // Mastered
  if (mastered.length > 0) {
    lines.push(`✅ MASTERED (${mastered.length} items)`);
  }

  return lines.join('\n');
}

/**
 * Get a list of all available documents for learning.
 */
export async function getAvailableDocuments(): Promise<DocumentInfo[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT document_id, filename, file_type FROM documents WHERE processed = 1 ORDER BY created_at DESC`
  );

  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    documentId: row.document_id as string,
    filename: row.filename as string,
    fileType: row.file_type as string,
  }));
}
