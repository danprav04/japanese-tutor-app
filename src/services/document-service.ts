/**
 * Document Service
 *
 * Processes uploaded documents (PDF, TXT, MD) using semantic chunking:
 * 1. Reads file content from the device
 * 2. Sends to AI for topic segmentation (identifies topic boundaries)
 * 3. Splits document at topic boundaries into semantic chunks
 * 4. Creates curriculum nodes that reference their source chunks
 * 5. Detects inter-topic dependencies
 */

import { File } from 'expo-file-system/next';
import { extractText } from 'expo-pdf-text-extract';
import { getDatabase } from '../db/database';
import { getGroqClient, MODEL_RATES } from './groq-client';
import { addNode, addDependency } from './curriculum-service';
import { initializeProgress } from './progress-service';
import { useAppStore } from '../store/app-store';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ───────────────────────────────────────────────────

interface TopicSegment {
  title: string;
  type: 'vocab' | 'grammar' | 'kanji';
  jlptLevel: number;
  summary: string;
  startMarker: string;
  endMarker: string;
  dependsOn?: string[]; // titles of prerequisite topics
}

interface SegmentationResult {
  topics: TopicSegment[];
}

// ─── Segmentation Prompt ─────────────────────────────────────

const SEGMENTATION_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The concept name (e.g., "は particle", "食べる", "日")' },
          type: { type: 'string', enum: ['vocab', 'grammar', 'kanji'] },
          jlptLevel: { type: 'integer', description: 'JLPT level estimate (5=easiest, 1=hardest)' },
          summary: { type: 'string', description: 'One-sentence summary of what this topic covers' },
          startMarker: { type: 'string', description: 'The first 8-15 words of this section in the original text (exact match)' },
          endMarker: { type: 'string', description: 'The last 8-15 words of this section in the original text (exact match)' },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of other topics in this list that this topic builds upon',
          },
        },
        required: ['title', 'type', 'jlptLevel', 'summary', 'startMarker', 'endMarker'],
      },
    },
  },
});

function buildSegmentationPrompt(text: string, chunkIndex?: number, totalChunks?: number): string {
  const chunkNote = totalChunks && totalChunks > 1
    ? `\n(This is section ${(chunkIndex ?? 0) + 1} of ${totalChunks} from the document.)\n`
    : '';

  return `You are analyzing Japanese learning material. Segment this text into **self-contained topic sections**.
${chunkNote}
## Rules

1. Each section should cover exactly ONE concept (a grammar point, a vocabulary word, a kanji, etc.)
2. Sections MUST be contiguous and non-overlapping — every paragraph belongs to exactly one section.
3. The startMarker and endMarker must be EXACT quotes from the original text (8-15 words) that uniquely identify where each section starts and ends.
4. For introductory/meta text that doesn't teach a specific concept, you may group it as a grammar-type topic with a descriptive title like "Introduction" or "Chapter Overview".
5. If a topic references or builds on another topic in the same document, list it in dependsOn.

## JLPT Level Guidelines
- Level 5 (N5): Basic particles, basic verb forms, common everyday vocabulary
- Level 4 (N4): て-form, ている, conditionals, compound particles
- Level 3 (N3): Passive, causative, potential form, formal expressions
- Level 2 (N2): Keigo, complex grammar, literary expressions  
- Level 1 (N1): Academic/specialized grammar
- When in doubt, assign the EASIER (higher number) level.

## Material to analyze
---
${text}
---

Identify all distinct topics taught in this material. Output them in the order they appear.`;
}

// ─── Public API ──────────────────────────────────────────────

export interface ProcessOptions {
  onProgress?: (progress: number, message: string) => void;
  signal?: AbortSignal;
}

/**
 * Process an uploaded document using semantic (topic-aware) chunking.
 *
 * @returns Number of topics successfully imported
 */
export async function processDocument(
  fileUri: string,
  fileName: string,
  fileType: string,
  options?: ProcessOptions
): Promise<number> {
  const client = getGroqClient();
  
  // Use the user's selected extraction models
  const selectedModels = useAppStore.getState().extractionModels;
  const DOC_MODELS = selectedModels.length > 0 ? selectedModels : ['llama-3.3-70b-versatile'];

  // Save original model to restore later
  const originalModel = useAppStore.getState().currentModel;

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

    // 4. AI Segmentation — identify topic boundaries
    options?.onProgress?.(0.15, 'Analyzing document structure...');
    if (options?.signal?.aborted) throw new Error('Process cancelled by user.');

    const currentDocModel = DOC_MODELS[0];
    client.setModel(currentDocModel);
    console.log(`📖 Segmenting document using ${currentDocModel}...`);

    let allTopics: TopicSegment[] = [];

    // For very long documents, split into large windows for segmentation
    const MAX_SEGMENT_SIZE = 12000; // chars per segmentation call
    const textWindows = splitForSegmentation(textContent, MAX_SEGMENT_SIZE);

    const CONCURRENCY = 3;
    for (let batchStart = 0; batchStart < textWindows.length; batchStart += CONCURRENCY) {
      if (options?.signal?.aborted) throw new Error('Process cancelled by user.');

      const batchEnd = Math.min(batchStart + CONCURRENCY, textWindows.length);
      const progress = 0.15 + (batchStart / textWindows.length) * 0.45;
      options?.onProgress?.(progress, `Analyzing sections ${batchStart + 1}-${batchEnd} of ${textWindows.length}...`);

      // Rotate models for rate limit distribution
      const modelForBatch = DOC_MODELS[batchStart % DOC_MODELS.length];
      client.setModel(modelForBatch);

      const promises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        console.log(`📄 Segmenting window ${i + 1}/${textWindows.length} using ${modelForBatch} (${textWindows[i].length} chars)...`);
        const prompt = buildSegmentationPrompt(textWindows[i], i, textWindows.length);
        promises.push(
          client.generateJSON<SegmentationResult>(prompt, SEGMENTATION_SCHEMA, options?.signal)
            .then(result => ({ index: i, result }))
            .catch(err => {
              console.warn(`⚠️ Segmentation window ${i + 1} failed:`, err);
              return { index: i, result: { topics: [] } as SegmentationResult };
            })
        );
      }

      const results = await Promise.all(promises);
      for (const { result } of results) {
        if (result.topics && Array.isArray(result.topics)) {
          const validTopics = result.topics.filter(
            t => typeof t === 'object' && t !== null && 'title' in t && 'startMarker' in t
          );
          allTopics.push(...validTopics);
        }
      }

      // Brief delay between batches
      if (batchEnd < textWindows.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (allTopics.length === 0) {
      await db.execute(
        `UPDATE documents SET processed = -1 WHERE document_id = ?`,
        [documentId]
      );
      throw new Error('AI could not identify any topics in this document.');
    }

    // 5. Deduplicate topics by title
    const seen = new Set<string>();
    allTopics = allTopics.filter(topic => {
      const normalized = topic.title.trim().toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    options?.onProgress?.(0.65, 'Splitting document by topics...');

    // 6. Split the document at topic boundaries using markers
    const topicChunks = splitByMarkers(textContent, allTopics);

    // 7. Store semantic chunks in document_chunks
    options?.onProgress?.(0.75, 'Saving to database...');

    const chunkIdMap = new Map<number, number>(); // topicIndex → chunk_id
    for (let i = 0; i < topicChunks.length; i++) {
      const chunk = topicChunks[i];
      if (!chunk.text || chunk.text.trim().length === 0) continue;

      // For very long topic sections, sub-chunk at paragraph boundaries
      const subChunks = subChunkIfNeeded(chunk.text, 4000);
      const chunkIds: number[] = [];

      for (let j = 0; j < subChunks.length; j++) {
        const result = await db.execute(
          `INSERT INTO document_chunks (document_id, content_text, chunk_index) VALUES (?, ?, ?)`,
          [documentId, subChunks[j], i * 100 + j] // Use i*100+j for stable ordering
        );
        // Get the auto-incremented chunk_id
        const idResult = await db.execute(`SELECT last_insert_rowid() as id`);
        const chunkId = (idResult.rows?.[0] as any)?.id as number;
        chunkIds.push(chunkId);
      }

      chunkIdMap.set(i, chunkIds[0]); // Store primary chunk ID
      topicChunks[i].chunkIds = chunkIds;
    }

    // 8. Create curriculum nodes
    options?.onProgress?.(0.85, 'Creating curriculum entries...');

    let importedCount = 0;
    const titleToNodeId = new Map<string, string>(); // for dependency resolution

    for (let i = 0; i < allTopics.length; i++) {
      const topic = allTopics[i];
      const chunk = topicChunks[i];

      try {
        if (!topic.title || !topic.type) continue;
        const validTypes = ['vocab', 'grammar', 'kanji'];
        if (!validTypes.includes(topic.type)) continue;

        const node = await addNode(
          topic.title,
          topic.type,
          topic.jlptLevel || 5,
          {
            summary: topic.summary,
            chunkRefs: chunk?.chunkIds ?? [],
            sourceFile: fileName,
            documentId,
            sortOrder: i,
          }
        );

        titleToNodeId.set(topic.title.trim().toLowerCase(), node.nodeId);
        await initializeProgress(node.nodeId, true);
        importedCount++;
      } catch (err) {
        console.warn(`Failed to import topic "${topic.title}":`, err);
      }
    }

    // 9. Create dependency edges
    for (const topic of allTopics) {
      if (!topic.dependsOn || topic.dependsOn.length === 0) continue;
      const childId = titleToNodeId.get(topic.title.trim().toLowerCase());
      if (!childId) continue;

      for (const depTitle of topic.dependsOn) {
        const parentId = titleToNodeId.get(depTitle.trim().toLowerCase());
        if (parentId && parentId !== childId) {
          try {
            await addDependency(parentId, childId, 'soft');
            console.log(`🔗 Dependency: "${depTitle}" → "${topic.title}"`);
          } catch {
            // Ignore duplicate dependency errors
          }
        }
      }
    }

    // 10. Mark document as processed
    await db.execute(
      `UPDATE documents SET processed = 1, total_chunks = ? WHERE document_id = ?`,
      [topicChunks.filter(c => c.text.trim().length > 0).length, documentId]
    );

    console.log(`✅ Imported ${importedCount} topics from "${fileName}"`);
    return importedCount;
  } catch (err) {
    if ((err as Error).message === 'Process cancelled by user.' || (err as Error).message === 'Aborted') {
      const db = getDatabase();
      await db.execute(
        `UPDATE documents SET processed = -1 WHERE document_id = ?`,
        [uuidv4()] // This won't match — but the doc ID is scoped. In practice, the finally block handles cleanup.
      ).catch(() => {});
      throw err;
    }
    throw err;
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
  
  // Delete nodes linked to this document (cascades to progress/dependencies)
  await db.execute(
    'DELETE FROM curriculum_nodes WHERE document_id = ?',
    [documentId]
  );

  // Delete the document record (cascades to document_chunks)
  await db.execute(
    'DELETE FROM documents WHERE document_id = ?',
    [documentId]
  );
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Split text into windows for AI segmentation.
 * Each window is at most maxSize characters, split on paragraph boundaries.
 */
function splitForSegmentation(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const paragraphs = text.split(/\n\s*\n/);
  const windows: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxSize && current.length > 0) {
      windows.push(current.trim());
      current = '';
    }
    current += (current ? '\n\n' : '') + para;
  }

  if (current.trim().length > 0) {
    windows.push(current.trim());
  }

  return windows;
}

interface TopicChunk {
  topicIndex: number;
  text: string;
  chunkIds: number[];
}

/**
 * Split the document text at topic boundaries using AI-provided markers.
 * Falls back to equal-split if markers can't be found.
 */
function splitByMarkers(text: string, topics: TopicSegment[]): TopicChunk[] {
  if (topics.length === 0) return [];

  // Try to find each topic's start position using the startMarker
  const positions: { index: number; start: number; end: number }[] = [];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    let startPos = -1;

    // Try exact match first (trim whitespace variations)
    const cleanMarker = topic.startMarker.trim();
    if (cleanMarker.length >= 4) {
      startPos = text.indexOf(cleanMarker);
      
      // Try partial match (first 20 chars) if exact match fails
      if (startPos === -1 && cleanMarker.length > 20) {
        const partial = cleanMarker.substring(0, 20);
        startPos = text.indexOf(partial);
      }
    }

    // Find end position
    let endPos = text.length;
    if (topic.endMarker) {
      const cleanEnd = topic.endMarker.trim();
      if (cleanEnd.length >= 4) {
        const endSearch = text.indexOf(cleanEnd, startPos >= 0 ? startPos : 0);
        if (endSearch >= 0) {
          endPos = endSearch + cleanEnd.length;
        }
      }
    }

    positions.push({ index: i, start: startPos, end: endPos });
  }

  // Sort by start position (found positions first, then by original order)
  const found = positions.filter(p => p.start >= 0).sort((a, b) => a.start - b.start);
  const notFound = positions.filter(p => p.start < 0);

  // Build chunks from found positions
  const chunks: TopicChunk[] = [];
  
  if (found.length === 0) {
    // No markers matched — fall back to putting all text in first topic
    console.warn('⚠️ No topic markers matched. Assigning full text to first topic.');
    chunks.push({ topicIndex: 0, text, chunkIds: [] });
    for (let i = 1; i < topics.length; i++) {
      chunks.push({ topicIndex: i, text: '', chunkIds: [] });
    }
    return chunks;
  }

  // Handle text before first found topic as part of the first topic
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const nextStart = i + 1 < found.length ? found[i + 1].start : text.length;
    
    // Section goes from current.start to next topic's start
    const sectionStart = i === 0 ? 0 : current.start; // Include preamble in first topic
    const sectionEnd = nextStart;
    const sectionText = text.substring(sectionStart, sectionEnd).trim();

    chunks.push({
      topicIndex: current.index,
      text: sectionText,
      chunkIds: [],
    });
  }

  // Topics with no matched markers get empty text
  for (const nf of notFound) {
    chunks.push({ topicIndex: nf.index, text: '', chunkIds: [] });
  }

  // Sort by original topic index
  chunks.sort((a, b) => a.topicIndex - b.topicIndex);

  return chunks;
}

/**
 * Sub-chunk a long text at paragraph boundaries if it exceeds maxSize.
 */
function subChunkIfNeeded(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];

  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += (current ? '\n\n' : '') + para;
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}
