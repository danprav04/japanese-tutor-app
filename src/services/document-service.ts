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
import { getGroqClient, MODEL_RATES } from './groq-client';
import { addNode } from './curriculum-service';
import { createFlashcard } from './card-service';
import { initializeProgress } from './progress-service';
import { useAppStore } from '../store/app-store';
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

const EXTRACTION_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The word, kanji, or grammar point' },
          type: { type: 'string', enum: ['vocab', 'grammar', 'kanji'] },
          jlptLevel: { type: 'integer', description: 'JLPT level (5-1)' },
          reading: { type: 'string', description: 'Kana reading (for vocab/kanji)' },
          meaning: { type: 'string', description: 'English meaning' },
          example: { type: 'string', description: 'Japanese example sentence' },
          exampleTranslation: { type: 'string', description: 'English translation of example' },
          onyomi: { type: 'string', description: 'Onyomi readings (kanji only)' },
          kunyomi: { type: 'string', description: 'Kunyomi readings (kanji only)' },
        },
        required: ['title', 'type', 'jlptLevel', 'meaning'],
      },
    },
  },
});

const CHUNK_SIZE = 2000; // characters per Gemini extraction call

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

export interface ProcessOptions {
  onProgress?: (progress: number, message: string) => void;
  signal?: AbortSignal;
}

/**
 * Process an uploaded document and import its content into the curriculum.
 *
 * @returns Number of items successfully imported
 */
export async function processDocument(
  fileUri: string,
  fileName: string,
  fileType: string,
  options?: ProcessOptions
): Promise<number> {
  const client = getGroqClient();
  
  // Ensure we use the user's selected model
  const currentModel = useAppStore.getState().currentModel;
  client.setModel(currentModel);
  // Get model specific configuration
  const modelConfig = MODEL_RATES[currentModel];
  const chunkSize = modelConfig ? modelConfig.maxChunkSize : 2000;

  const db = getDatabase();
  
  // 1. Check if document already exists
  const checkResult = await db.execute(
    'SELECT document_id FROM documents WHERE filename = ?',
    [fileName]
  );
  
  if (checkResult.rows && checkResult.rows.length > 0) {
    throw new Error('Document with this name already exists.');
  }

  options?.onProgress?.(0.05, 'Reading file...');
  if (options?.signal?.aborted) throw new Error('Aborted');

  // 2. Read file content
  let textContent = '';
  try {
    const file = new File(fileUri);
    textContent = await file.text();
  } catch (error) {
    console.error('Failed to read file:', error);
    throw new Error('Failed to read file content. Ensure it is a valid text file.');
  }

  if (!textContent || textContent.trim().length === 0) {
    throw new Error('File is empty or could not be read.');
  }

  // 3. Store document record
  const documentId = uuidv4();
  await db.execute(
    `INSERT INTO documents (document_id, filename, file_type, processed) VALUES (?, ?, ?, 0)`,
    [documentId, fileName, fileType]
  );

  // 4. Split into chunks and extract from each
  // We use dynamic chunk size based on the model's capabilities
  const textChunks = splitForExtraction(textContent, chunkSize);
  const allItems: ExtractedItem[] = [];

  try {
    for (let i = 0; i < textChunks.length; i++) {
      // Check for cancellation
      if (options?.signal?.aborted) {
        throw new Error('Process cancelled by user.');
      }

      const progress = 0.1 + (i / textChunks.length) * 0.8; // 10% to 90%
      options?.onProgress?.(progress, `Analyzing part ${i + 1} of ${textChunks.length}...`);

      const prompt = buildExtractionPrompt(textChunks[i], i, textChunks.length);
      
      // Debug: Log progress
      console.log(`📄 Processing chunk ${i + 1}/${textChunks.length} (${textChunks[i].length} chars)...`);

      const result = await client.generateJSON<ExtractionResult>(
        prompt, 
        EXTRACTION_SCHEMA,
        options?.signal // Pass the abort signal
      );
      if (result.items && Array.isArray(result.items)) {
        allItems.push(...result.items);
      }
      
      // Standard delay to be polite to the API
      if (i < textChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    options?.onProgress?.(0.95, 'Saving to database...');
  } catch (err) {
    if ((err as Error).message === 'Process cancelled by user.') {
        await db.execute(
          `UPDATE documents SET processed = -1 WHERE document_id = ?`,
          [documentId]
        );
        throw err;
    }
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

      // await createFlashcard(front, back, item.type, node.nodeId);
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

/**
 * Delete a document and all content generated from it.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const db = getDatabase();
  
  // 1. Get filename to clean up nodes
  const result = await db.execute(
    'SELECT filename FROM documents WHERE document_id = ?',
    [documentId]
  );
  
  if (!result.rows || result.rows.length === 0) {
    throw new Error('Document not found');
  }
  
  const filename = result.rows[0].filename as string;
  
  // 2. Delete nodes sourced from this file (this effectively undoes the import)
  // Note: We might want to keep nodes if they've been manually edited or have progress,
  // but usually "delete document" implies "remove what I added".
  // Since we don't have a direct foreign key from nodes to documents, we use source_file.
  await db.execute(
    'DELETE FROM curriculum_nodes WHERE source_file = ?',
    [filename]
  );

  // 3. Delete the document record
  await db.execute(
    'DELETE FROM documents WHERE document_id = ?',
    [documentId]
  );
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Split text into segments for Gemini extraction calls.
 * Each segment is at most CHUNK_SIZE characters, split on paragraph boundaries.
 */
function splitForExtraction(text: string, chunkSize: number = 2000): string[] {
  if (text.length <= chunkSize) return [text];

  // 1. Split by newlines (preserve paragraphs if possible, but prioritize size)
  const lines = text.split('\n');
  const segments: string[] = [];
  let current = '';

  for (const line of lines) {
    // +1 for the newline check we might add
    if (current.length + line.length + 1 > chunkSize) {
      if (current.length > 0) {
        segments.push(current.trim());
        current = '';
      }
      
      // If the line itself is massive (larger than chunk size), we MUST hard split it
      if (line.length > chunkSize) {
        let remaining = line;
        while (remaining.length > 0) {
          if (remaining.length <= chunkSize) {
            current = remaining; // Start new current with valid remainder
            remaining = '';
          } else {
            // Hard chop
            segments.push(remaining.slice(0, chunkSize));
            remaining = remaining.slice(chunkSize);
          }
        }
      } else {
        current = line;
      }
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current.length > 0) {
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
