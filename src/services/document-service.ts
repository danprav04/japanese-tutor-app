/**
 * Document Service
 *
 * Processes uploaded documents (PDF, TXT, MD) by:
 * 1. Reading file content from the device
 * 2. Sending to Gemini for structured extraction
 * 3. Inserting extracted items into the curriculum
 * 4. Creating flashcards for each extracted item
 */

import * as FileSystem from 'expo-file-system';
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

function buildExtractionPrompt(text: string): string {
  return `Analyze the following Japanese learning material and extract all vocabulary, grammar points, and kanji into structured data.

For each item:
- Identify the type (vocab, grammar, or kanji)
- Estimate the JLPT level (5 = easiest, 1 = hardest)
- Provide the reading in hiragana
- Provide a clear English meaning
- Give an example sentence with translation
- For kanji: include onyomi and kunyomi readings

Material to analyze:
---
${text.slice(0, 8000)}
---

Extract as many items as possible (up to 30). Focus on the most useful and common items first.`;
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

  // 1. Read file content
  let textContent: string;
  try {
    textContent = await FileSystem.readAsStringAsync(fileUri);
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

  // 3. Call Gemini for structured extraction
  let extraction: ExtractionResult;
  try {
    const prompt = buildExtractionPrompt(textContent);
    extraction = await client.generateJSON<ExtractionResult>(prompt, EXTRACTION_SCHEMA);
  } catch (err) {
    // Mark as failed
    await db.execute(
      `UPDATE documents SET processed = -1 WHERE document_id = ?`,
      [documentId]
    );
    throw new Error(`AI extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  if (!extraction.items || !Array.isArray(extraction.items) || extraction.items.length === 0) {
    await db.execute(
      `UPDATE documents SET processed = -1 WHERE document_id = ?`,
      [documentId]
    );
    throw new Error('AI could not extract any learning items from this file.');
  }

  // 4. Chunk text into document_chunks for future RAG
  const chunks = chunkText(textContent);
  for (let i = 0; i < chunks.length; i++) {
    await db.execute(
      `INSERT INTO document_chunks (document_id, content_text, chunk_index) VALUES (?, ?, ?)`,
      [documentId, chunks[i], i]
    );
  }

  // 5. Insert extracted items into curriculum + create flashcards
  let importedCount = 0;

  for (const item of extraction.items) {
    try {
      // Validate required fields
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

      // Create curriculum node
      const node = await addNode(
        item.title,
        item.type,
        item.jlptLevel || 5,
        contentPayload,
        fileName,
      );

      // Create flashcard
      let front: string;
      let back: string;

      if (item.type === 'kanji') {
        front = item.title;
        back = `${item.meaning}\n${item.onyomi ?? ''} / ${item.kunyomi ?? ''}`;
      } else if (item.type === 'vocab') {
        front = item.title;
        back = `${item.meaning}${item.reading ? '\n(' + item.reading + ')' : ''}`;
      } else {
        front = item.title;
        back = `${item.meaning}\n${item.example ?? ''}`;
      }

      await createFlashcard(front, back, item.type, node.nodeId);

      // Initialize progress
      await initializeProgress(node.nodeId, true);

      importedCount++;
    } catch (err) {
      console.warn(`Failed to import item "${item.title}":`, err);
    }
  }

  // 6. Mark document as processed
  await db.execute(
    `UPDATE documents SET processed = 1, total_chunks = ? WHERE document_id = ?`,
    [chunks.length, documentId]
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
