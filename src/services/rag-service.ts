/**
 * RAG Service
 *
 * Retrieves source document chunks for curriculum nodes.
 * Used by the tutor agent to load the actual teaching material
 * when the chatbot teaches or reviews a topic.
 */

import { getDatabase } from '../db/database';

// ─── Public API ──────────────────────────────────────────────

/**
 * Retrieve the source chunks for a curriculum node.
 * Reads the node's chunk_refs JSON array and returns the content.
 */
export async function getChunksForNode(nodeId: string): Promise<string[]> {
  const db = getDatabase();

  const nodeResult = await db.execute(
    `SELECT chunk_refs FROM curriculum_nodes WHERE node_id = ?`,
    [nodeId]
  );

  if (!nodeResult.rows || nodeResult.rows.length === 0) return [];

  const row = nodeResult.rows[0] as Record<string, unknown>;
  const chunkRefs = row.chunk_refs as string | null;
  if (!chunkRefs) return [];

  try {
    const chunkIds: number[] = JSON.parse(chunkRefs);
    if (!Array.isArray(chunkIds) || chunkIds.length === 0) return [];
    return getChunksByIds(chunkIds);
  } catch {
    return [];
  }
}

/**
 * Retrieve chunk content by chunk IDs.
 */
export async function getChunksByIds(chunkIds: number[]): Promise<string[]> {
  if (chunkIds.length === 0) return [];

  const db = getDatabase();
  const placeholders = chunkIds.map(() => '?').join(',');

  const result = await db.execute(
    `SELECT chunk_id, content_text FROM document_chunks
     WHERE chunk_id IN (${placeholders})
     ORDER BY chunk_index ASC`,
    chunkIds
  );

  if (!result.rows) return [];
  return (result.rows as Record<string, unknown>[]).map(
    (r) => r.content_text as string
  );
}

/**
 * Retrieve all chunks for a document, ordered by index.
 */
export async function getDocumentChunks(documentId: string): Promise<string[]> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT content_text FROM document_chunks
     WHERE document_id = ?
     ORDER BY chunk_index ASC`,
    [documentId]
  );

  if (!result.rows) return [];
  return (result.rows as Record<string, unknown>[]).map(
    (r) => r.content_text as string
  );
}

/**
 * Retrieve chunks for the next lesson target and review target.
 * Returns pre-formatted context blocks for injection into the tutor prompt.
 */
export async function getTeachingContext(
  targetLessonNodeId: string | null,
  targetReviewNodeId: string | null,
): Promise<{ lessonContext: string; reviewContext: string }> {
  let lessonContext = '';
  let reviewContext = '';

  if (targetLessonNodeId) {
    const chunks = await getChunksForNode(targetLessonNodeId);
    if (chunks.length > 0) {
      lessonContext = `[SOURCE MATERIAL - TARGET LESSON]\n${chunks.join('\n\n')}\n[/SOURCE MATERIAL]`;
    }
  }

  if (targetReviewNodeId && targetReviewNodeId !== targetLessonNodeId) {
    const chunks = await getChunksForNode(targetReviewNodeId);
    if (chunks.length > 0) {
      reviewContext = `[SOURCE MATERIAL - REVIEW ITEM]\n${chunks.join('\n\n')}\n[/SOURCE MATERIAL]`;
    }
  }

  return { lessonContext, reviewContext };
}
