/**
 * Document Service
 *
 * Processes uploaded documents (PDF, TXT, MD) by:
 * 1. Reading file content from the device (SDK 54 File API)
 * 2. Sending to Gemini for structured extraction (chunked for long docs)
 * 3. Inserting extracted items into the curriculum
 * 4. Creating flashcards for each extracted item
 */

import { File } from 'expo-file-system/next';
import { getDatabase } from '../db/database';
import { getGeminiClient } from './gemini-client';
import { addNode } from './curriculum-service';
import { createFlashcard } from './card-service';
import { initializeProgress } from './progress-service';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────

interface ExtractedItem {
  title: string;
  type: 'vocab' | 'grammar' | 'kanji';
  jlptLevel: number;
  reading?: string;
  meaning: string;
  example?: string;
  exampleTranslation?: string;
  onyomi?: string;
  kunyomi?: string;
}

interface ExtractionResult {
  items: ExtractedItem[];
}

// ─── Extraction Prompt ───────────────────────────────────────

const EXTRACTION_SCHEMA = `{
  "items": [
    {
      "title": "string (the Japanese word/kanji/pattern)",
      "type": "vocab | grammar | kanji",
      "jlptLevel": "number 1-5 (estimate)",
      "reading": "string (hiragana reading, if applicable)",
      "meaning": "string (English meaning)",
      "example": "string (example sentence in Japanese)",
      "exampleTranslation": "string (English translation of example)",
      "onyomi": "string (on'yomi reading, kanji only)",
      "kunyomi": "string (kun'yomi reading, kanji only)"
    }
  ]
}`;

const CHUNK_SIZE = 4000; // characters per Gemini extraction call

function buildExtractionPrompt(text: string, chunkIndex: number, totalChunks: number): string {
  const chunkNote = totalChunks > 1
    ? `\n(This is section ${chunkIndex + 1} of ${totalChunks} from the document.)\n`
    : '';

  return `Analyze the following Japanese learning material and extract all vocabulary, grammar points, and kanji into structured data.
${chunkNote}
For each item:
- Identify the type (vocab, grammar, or kanji)
- Estimate the JLPT level (5 = easiest, 1 = hardest)
- Provide the reading in hiragana
- Provide a clear English meaning
- Give an example sentence with translation
- For kanji: include onyomi and kunyomi readings
- For grammar: the title should be the grammar pattern (e.g. "〜ている", "〜たら")

Material to analyze:
---
${text}
---

Extract as many items as possible (up to 15). Focus on the most useful and common items first.`;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Process an uploaded document and import its content into the curriculum.
 *
 * @returns Number of items successfully imported
 */
export async function processDocument(
  fileUri: string,
  fileName: string,
  fileType: string,
): Promise<number> {
  const client = getGeminiClient();
  const db = getDatabase();

  // 1. Read file content using SDK 54 File API
  let textContent: string;
  try {
    const file = new File(fileUri);
    textContent = await file.text();
  } catch (err) {
    throw new Error(`Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  if (!textContent || textContent.trim().length === 0) {
    throw new Error('File is empty or could not be read.');
  }

  // 2. Store document record
  const documentId = uuidv4();
  await db.execute(
    `INSERT INTO documents (document_id, filename, file_type, processed) VALUES (?, ?, ?, 0)`,
    [documentId, fileName, fileType]
  );

  // 3. Split into chunks and extract from each
  const textChunks = splitForExtraction(textContent);
  const allItems: ExtractedItem[] = [];

  try {
    for (let i = 0; i < textChunks.length; i++) {
      const prompt = buildExtractionPrompt(textChunks[i], i, textChunks.length);
      const extraction = await client.generateJSON<ExtractionResult>(prompt, EXTRACTION_SCHEMA);
      if (extraction.items && Array.isArray(extraction.items)) {
        allItems.push(...extraction.items);
      }
    }
  } catch (err) {
    await db.execute(
      `UPDATE documents SET processed = -1 WHERE document_id = ?`,
      [documentId]
    );
    console.error(`Process Document Error: ${err instanceof Error ? err.message : String(err)}`);
    throw new Error(`AI extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  if (allItems.length === 0) {
    await db.execute(
      `UPDATE documents SET processed = -1 WHERE document_id = ?`,
      [documentId]
    );
    throw new Error('AI could not extract any learning items from this file.');
  }

  // 4. Chunk text into document_chunks for future RAG
  const ragChunks = chunkText(textContent);
  for (let i = 0; i < ragChunks.length; i++) {
    await db.execute(
      `INSERT INTO document_chunks (document_id, content_text, chunk_index) VALUES (?, ?, ?)`,
      [documentId, ragChunks[i], i]
    );
  }

  // 5. Deduplicate extracted items by title
  const seen = new Set<string>();
  const uniqueItems = allItems.filter((item) => {
    if (!item.title || seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  // 6. Insert extracted items into curriculum + create flashcards
  let importedCount = 0;

  for (const item of uniqueItems) {
    try {
      if (!item.title || !item.type || !item.meaning) continue;
      const validTypes = ['vocab', 'grammar', 'kanji'];
      if (!validTypes.includes(item.type)) continue;

      const contentPayload: Record<string, unknown> = {
        meaning: item.meaning,
        reading: item.reading,
        example: item.example,
        exampleTranslation: item.exampleTranslation,
      };

      if (item.type === 'kanji') {
        contentPayload.onyomi = item.onyomi;
        contentPayload.kunyomi = item.kunyomi;
      }

      const node = await addNode(
        item.title,
        item.type,
        item.jlptLevel || 5,
        contentPayload,
        fileName,
      );

      let front: string;
      let back: string;

      if (item.type === 'kanji') {
        front = item.title;
        back = `${item.meaning}\n${item.onyomi ?? ''} / ${item.kunyomi ?? ''}`;
      } else if (item.type === 'vocab') {
        front = item.title;
        back = `${item.meaning}${item.reading ? '\n(' + item.reading + ')' : ''}`;
      } else {
        // grammar — front is the pattern, back is explanation + example
        front = item.title;
        back = `${item.meaning}${item.example ? '\n例: ' + item.example : ''}`;
      }

      await createFlashcard(front, back, item.type, node.nodeId);
      await initializeProgress(node.nodeId, true);

      importedCount++;
    } catch (err) {
      console.warn(`Failed to import item "${item.title}":`, err);
    }
  }

  // 7. Mark document as processed
  await db.execute(
    `UPDATE documents SET processed = 1, total_chunks = ? WHERE document_id = ?`,
    [ragChunks.length, documentId]
  );

  return importedCount;
}

/**
 * Get list of uploaded documents.
 */
export async function getUploadedDocuments(): Promise<Array<{
  documentId: string;
  filename: string;
  fileType: string;
  processed: number;
  totalChunks: number;
  createdAt: string;
}>> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT document_id, filename, file_type, processed, total_chunks, created_at
     FROM documents ORDER BY created_at DESC`
  );

  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    documentId: row.document_id as string,
    filename: row.filename as string,
    fileType: row.file_type as string,
    processed: row.processed as number,
    totalChunks: (row.total_chunks as number) || 0,
    createdAt: row.created_at as string,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Split text into segments for Gemini extraction calls.
 * Each segment is at most CHUNK_SIZE characters, split on paragraph boundaries.
 */
function splitForExtraction(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const paragraphs = text.split(/\n\n+/);
  const segments: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > CHUNK_SIZE && current.length > 0) {
      segments.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }

  if (current.trim().length > 0) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * Split text into ~500-token chunks with sentence boundary awareness.
 */
function chunkText(text: string, targetLength: number = 1500): string[] {
  // Split on Japanese sentence endings or newlines
  const sentences = text.split(/(?<=[。\n])/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > targetLength && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep the last sentence
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}
