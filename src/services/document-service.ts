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
import { extractText } from 'expo-pdf-text-extract';
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
  sourceChunkIndex?: number;
}

interface ValidationResult {
  validatedItems: ExtractedItem[];
  missingItems: ExtractedItem[];
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

  return `You are a precise Japanese curriculum extractor. Analyze the following Japanese learning material and extract vocabulary, grammar points, and kanji into structured data.
${chunkNote}
## CRITICAL RULES — READ CAREFULLY

1. **ONLY extract items that are explicitly taught, explained, or listed in the provided text.**
   - Do NOT add items from your general knowledge of Japanese.
   - Do NOT infer or predict what grammar/vocab "might come next" in a textbook.
   - If a grammar pattern is briefly mentioned but NOT explained or taught, do NOT include it.

2. **JLPT Level Assignment — follow these concrete rules:**
   - Level 5 (N5): Basic particles (は, が, を, も, に, で, へ), state-of-being (だ, じゃない, だった), basic verb forms (dictionary form, ない-form, た-form), basic i-adjectives and na-adjectives, common everyday vocabulary (学生, 友達, 食べる, 行く, etc.)
   - Level 4 (N4): て-form, ている, たい, conditionals (たら, ば), giving/receiving verbs, compound particles (には, では), vague listing (や, とか)
   - Level 3 (N3): Passive, causative, potential form, formal expressions, abstract vocabulary
   - Level 2 (N2): Keigo, complex grammar, literary expressions
   - Level 1 (N1): Academic/specialized grammar, rare kanji
   - When in doubt, assign the EASIER (higher number) level. Basic grammar text content is almost always N5.

3. **Example sentences**: Use example sentences FROM the source text when available, rather than inventing new ones.

4. **For each item provide:**
   - type: vocab, grammar, or kanji
   - jlptLevel: 5-1 following the rules above
   - reading: kana reading (for vocab/kanji)
   - meaning: clear English meaning
   - example: Japanese example sentence (preferably from the text)
   - exampleTranslation: English translation of example
   - For kanji: include onyomi and kunyomi readings
   - For grammar: the title should be the grammar pattern (e.g. "〜だ", "〜じゃない")

5. **Title formatting**: Use ONLY the Japanese word/pattern as the title. Do NOT add bracket annotations like 【reading】 or parenthetical descriptions like "(direct object particle)" to titles. Put readings in the "reading" field and descriptions in the "meaning" field.

6. **Avoid duplicates across sections**: If a word or grammar point was already covered earlier in the text, do NOT extract it again. Each concept should appear only ONCE.

7. **Grammar should be generalizable rules, not specific examples**: When the text demonstrates a grammar pattern using example phrases, extract the PATTERN as one grammar node (e.g. "Relative clauses (Verb + Noun)"), NOT individual example phrases as separate nodes.

8. **Kanji extraction**: When vocabulary words contain kanji characters, also extract those kanji as separate kanji-type items with onyomi and kunyomi readings.

Material to analyze:
---
${text}
---

Extract up to 15 items. Only include items actually present in the text above.`;
}

// ─── Validation Prompt ───────────────────────────────────────

const VALIDATION_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    validatedItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['vocab', 'grammar', 'kanji'] },
          jlptLevel: { type: 'integer' },
          reading: { type: 'string' },
          meaning: { type: 'string' },
          example: { type: 'string' },
          exampleTranslation: { type: 'string' },
          onyomi: { type: 'string' },
          kunyomi: { type: 'string' },
        },
        required: ['title', 'type', 'jlptLevel', 'meaning'],
      },
    },
    missingItems: {
      type: 'array',
      description: 'Important concepts from the source that were not extracted',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['vocab', 'grammar', 'kanji'] },
          jlptLevel: { type: 'integer' },
          reading: { type: 'string' },
          meaning: { type: 'string' },
          example: { type: 'string' },
          exampleTranslation: { type: 'string' },
          onyomi: { type: 'string' },
          kunyomi: { type: 'string' },
        },
        required: ['title', 'type', 'jlptLevel', 'meaning'],
      },
    },
  },
});

function buildValidationPrompt(items: ExtractedItem[], sourceText: string): string {
  const itemsJSON = JSON.stringify(items, null, 2);
  
  // Truncate source text if too long (keep first 6000 chars which covers most lessons)
  const truncatedSource = sourceText.length > 6000
    ? sourceText.substring(0, 6000) + '\n... [truncated]'
    : sourceText;

  return `You are a Japanese language data validator. Below is a set of extracted curriculum items and the original source text they were extracted from.

Your job is to CROSS-REFERENCE each item against the source text and fix any errors.

## Validation Rules

1. **Kanji readings**: Verify onyomi (katakana) and kunyomi (hiragana) are correct. Use your knowledge of standard Japanese kanji readings.
   - Common errors to fix: 閉 onyomi should be ヘイ (not ヒエ), 落 should be ラク (not ロク), 雑 should be ザツ (not ツマ), 話 onyomi should be ワ (not ワダ)
   - Hiragana characters (あ, い, う, etc.) are NOT kanji — change their type to "vocab"

2. **Vocab readings**: Verify the reading field actually matches the word. For example, かわいい should NOT have reading おもしろい.

3. **Examples**: Each item's example sentence should actually demonstrate THAT item. For example, a 「も」 entry should not use a sentence that only contains 「は」.

4. **Missing concepts**: Identify up to 10 important grammar/vocab items that are EXPLICITLY TAUGHT in the source text but MISSING from the extracted items. Especially check for:
   - Sentence-ending particles (ね, よ, よね)
   - State-of-being forms
   - Verb conjugation patterns

5. **Do NOT remove items** — only correct errors in existing items and add missing ones.

## Source Text
---
${truncatedSource}
---

## Extracted Items to Validate
---
${itemsJSON}
---

Return all validated items (with corrections applied) in "validatedItems" and any missing concepts in "missingItems".`;
}

// ─── Deterministic Post-Processing ───────────────────────────

const HIRAGANA_RE = /^[\u3040-\u309F\u30FC\u3001\u3002\u300C\u300D\u30FB\s]+$/;
const KATAKANA_RE = /^[\u30A0-\u30FF\u30FC\u3001\u3002\u300C\u300D\u30FB\s]+$/;
const ROMAJI_RE = /^[a-zA-Z\s\-.\/',()]+$/;

/**
 * Deterministic post-processing that catches errors AI validation misses:
 * 1. Hiragana/katakana-only titles should not be type 'kanji' → convert to 'vocab'
 * 2. Romaji readings are cleared (better no reading than wrong format)
 * 3. Warns about mismatched examples
 */
function postProcessItems(items: ExtractedItem[]): ExtractedItem[] {
  return items.map(item => {
    // Rule 1: Hiragana/katakana-only titles cannot be kanji
    if (item.type === 'kanji') {
      if (HIRAGANA_RE.test(item.title) || KATAKANA_RE.test(item.title)) {
        console.warn(`🔧 Post-process: "${item.title}" is not kanji, converting to vocab`);
        item.type = 'vocab';
        // Move onyomi/kunyomi to reading if present
        if (item.onyomi || item.kunyomi) {
          item.reading = item.reading || item.kunyomi || item.onyomi;
          delete item.onyomi;
          delete item.kunyomi;
        }
      }
    }

    // Rule 2: Clear romaji readings (should be kana)
    if (item.reading && ROMAJI_RE.test(item.reading)) {
      console.warn(`🔧 Post-process: "${item.title}" has romaji reading "${item.reading}", clearing`);
      item.reading = undefined;
    }
    if (item.onyomi && ROMAJI_RE.test(item.onyomi)) {
      console.warn(`🔧 Post-process: "${item.title}" has romaji onyomi "${item.onyomi}", clearing`);
      item.onyomi = undefined;
    }
    if (item.kunyomi && ROMAJI_RE.test(item.kunyomi)) {
      console.warn(`🔧 Post-process: "${item.title}" has romaji kunyomi "${item.kunyomi}", clearing`);
      item.kunyomi = undefined;
    }

    // Rule 3: Log mismatched examples (but don't remove — they may still be useful)
    if (item.example && item.title.length >= 2 && !item.example.includes(item.title)) {
      // Only warn for vocab/kanji where we expect the title to appear in the example
      if (item.type !== 'grammar') {
        console.warn(`🔧 Post-process: "${item.title}" example doesn't contain the word: "${item.example}"`);
      }
    }

    return item;
  });
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
  
  // Use the user's selected extraction models (persisted in app store)
  const selectedModels = useAppStore.getState().extractionModels;
  const DOC_MODELS = selectedModels.length > 0 ? selectedModels : ['llama-3.3-70b-versatile'];

  // Save original model to restore later
  const originalModel = useAppStore.getState().currentModel;
  
  // Use the smallest maxChunkSize among selected models for safe chunking
  const smallestMax = Math.min(
    ...DOC_MODELS.map((m) => MODEL_RATES[m as keyof typeof MODEL_RATES]?.maxChunkSize ?? 4000)
  );
  const chunkSize = Math.max(smallestMax - 500, 2000); // conservative buffer

  try {
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
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      textContent = await extractText(fileUri);
    } else {
      const file = new File(fileUri);
      textContent = await file.text();
    }
  } catch (error) {
    console.error('Failed to read file:', error);
    throw new Error('Failed to read file content. Ensure it is a valid document.');
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

  // 4. Split into chunks and extract from each (parallel, 5 concurrent)
  const CONCURRENCY = 5;
  const textChunks = splitForExtraction(textContent, chunkSize);
  const allItems: ExtractedItem[] = [];

  try {
    for (let batchStart = 0; batchStart < textChunks.length; batchStart += CONCURRENCY) {
      if (options?.signal?.aborted) throw new Error('Process cancelled by user.');

      const batchEnd = Math.min(batchStart + CONCURRENCY, textChunks.length);
      const progress = 0.1 + (batchStart / textChunks.length) * 0.5;
      options?.onProgress?.(progress, `Extracting parts ${batchStart + 1}-${batchEnd} of ${textChunks.length}...`);

      // Set model once for this batch (all concurrent requests use the same model)
      const currentDocModel = DOC_MODELS[batchStart % DOC_MODELS.length];
      client.setModel(currentDocModel);

      const promises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        console.log(`📄 Processing chunk ${i + 1}/${textChunks.length} using ${currentDocModel} (${textChunks[i].length} chars)...`);
        const prompt = buildExtractionPrompt(textChunks[i], i, textChunks.length);
        promises.push(
          client.generateJSON<ExtractionResult>(prompt, EXTRACTION_SCHEMA, options?.signal)
            .then(result => ({ index: i, result }))
            .catch(err => {
              console.warn(`⚠️ Chunk ${i + 1} failed:`, err);
              return { index: i, result: { items: [] } as ExtractionResult };
            })
        );
      }

      const results = await Promise.all(promises);
      for (const { index, result } of results) {
        if (result.items && Array.isArray(result.items)) {
          result.items.forEach(item => { item.sourceChunkIndex = index; });
          allItems.push(...result.items);
        }
      }

      // Brief delay between batches to respect rate limits
      if (batchEnd < textChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    options?.onProgress?.(0.60, 'Extraction complete. Deduplicating...');
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

  // 5. Deduplicate extracted items by normalized title
  // Handles near-duplicates like "学生" vs "学生【がくせい】", "〜じゃない" vs "じゃない"
  const seen = new Set<string>();
  const normalizeTitle = (title: string): string => {
    return title
      .replace(/【[^】]*】/g, '')        // Remove 【...】 bracket annotations
      .replace(/\s*\([^)]*\)\s*$/g, '') // Remove trailing parenthetical descriptions like "(direct object particle)"
      .replace(/^[〜～~]+/, '')           // Remove leading tilde variations
      .replace(/\s+/g, '')               // Remove whitespace
      .trim();
  };
  const uniqueItems = allItems.filter((item) => {
    if (!item.title) return false;
    // Also strip brackets from the title itself before inserting
    item.title = item.title.replace(/【[^】]*】/g, '').trim();
    const normalized = normalizeTitle(item.title);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  // 6. Validation pass — use llama-3.3-70b for cross-referencing (stronger model)
  options?.onProgress?.(0.65, 'Validating extracted items against source...');
  if (options?.signal?.aborted) throw new Error('Process cancelled by user.');

  // Use 70b model for validation — it has better multilingual knowledge
  const VALIDATION_MODEL = 'llama-3.3-70b-versatile';
  client.setModel(VALIDATION_MODEL);
  console.log(`🔍 Using ${VALIDATION_MODEL} for validation pass`);

  let validatedItems = uniqueItems;
  try {
    const VALIDATION_BATCH_SIZE = 15;
    const totalBatches = Math.ceil(uniqueItems.length / VALIDATION_BATCH_SIZE);
    const allValidated: ExtractedItem[] = [];

    // Process validation batches in parallel (5 concurrent)
    for (let windowStart = 0; windowStart < totalBatches; windowStart += CONCURRENCY) {
      if (options?.signal?.aborted) throw new Error('Process cancelled by user.');

      const windowEnd = Math.min(windowStart + CONCURRENCY, totalBatches);
      const validationProgress = 0.65 + (windowStart / totalBatches) * 0.15;
      options?.onProgress?.(validationProgress, `Validating batches ${windowStart + 1}-${windowEnd} of ${totalBatches}...`);

      const promises = [];
      for (let batchIdx = windowStart; batchIdx < windowEnd; batchIdx++) {
        const batchStart = batchIdx * VALIDATION_BATCH_SIZE;
        const batch = uniqueItems.slice(batchStart, batchStart + VALIDATION_BATCH_SIZE);
        console.log(`✅ Validating batch ${batchIdx + 1}/${totalBatches} (${batch.length} items)...`);

        const validationPrompt = buildValidationPrompt(batch, textContent);
        promises.push(
          client.generateJSON<ValidationResult>(validationPrompt, VALIDATION_SCHEMA, options?.signal)
            .then(result => ({ batchIdx, batch, result }))
            .catch(err => {
              console.warn(`⚠️ Validation batch ${batchIdx + 1} failed:`, err);
              return { batchIdx, batch, result: { validatedItems: batch, missingItems: [] } as ValidationResult };
            })
        );
      }

      const results = await Promise.all(promises);
      for (const { result, batch } of results) {
        if (result.validatedItems && Array.isArray(result.validatedItems)) {
          allValidated.push(...result.validatedItems);
        } else {
          allValidated.push(...batch);
        }

        if (result.missingItems && Array.isArray(result.missingItems)) {
          for (const missing of result.missingItems) {
            if (missing.title && missing.type && missing.meaning) {
              const normalizedMissing = normalizeTitle(missing.title);
              if (!seen.has(normalizedMissing)) {
                seen.add(normalizedMissing);
                allValidated.push(missing);
                console.log(`➕ Added missing item: ${missing.title}`);
              }
            }
          }
        }
      }

      // Brief delay between validation windows
      if (windowEnd < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    validatedItems = allValidated;
    console.log(`✅ Validation complete: ${validatedItems.length} items (was ${uniqueItems.length} before validation)`);
  } catch (err) {
    if ((err as Error).message === 'Process cancelled by user.') throw err;
    console.warn('⚠️ Validation pass failed, using unvalidated items:', err);
    validatedItems = uniqueItems;
  }

  // 6b. Deterministic post-processing — catches errors that AI validation misses
  validatedItems = postProcessItems(validatedItems);

  options?.onProgress?.(0.87, 'Saving to database...');

  // 7. Insert validated items into curriculum + create flashcards
  let importedCount = 0;

  for (const item of validatedItems) {
    try {
      if (!item.title || !item.type || !item.meaning) continue;
      const validTypes = ['vocab', 'grammar', 'kanji'];
      if (!validTypes.includes(item.type)) continue;

      const contentPayload: Record<string, unknown> = {
        meaning: item.meaning,
        reading: item.reading,
        example: item.example,
        exampleTranslation: item.exampleTranslation,
        sourceChunkIndex: item.sourceChunkIndex,
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

  // 8. Mark document as processed
  await db.execute(
    `UPDATE documents SET processed = 1, total_chunks = ? WHERE document_id = ?`,
    [ragChunks.length, documentId]
  );

    return importedCount;
  } finally {
    client.setModel(originalModel);
  }
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
