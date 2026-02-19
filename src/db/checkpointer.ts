/**
 * SQLite Checkpointer for LangGraph State Persistence
 * 
 * Stores conversation state in op-sqlite so that agent conversations
 * can be resumed across app sessions.
 */

import { getDatabase } from './database';

export interface Checkpoint {
  threadId: string;
  checkpointId: string;
  parentCheckpointId: string | null;
  data: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Save a checkpoint for a given thread
 */
/**
 * Save a checkpoint for a given thread
 */
export async function saveCheckpoint(
  threadId: string,
  checkpointId: string,
  data: Record<string, unknown>,
  parentCheckpointId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO checkpoints (thread_id, checkpoint_id, parent_checkpoint_id, checkpoint_data, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [
      threadId,
      checkpointId,
      parentCheckpointId ?? null,
      JSON.stringify(data),
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

/**
 * Get the latest checkpoint for a thread
 */
export async function getLatestCheckpoint(threadId: string): Promise<Checkpoint | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT thread_id, checkpoint_id, parent_checkpoint_id, checkpoint_data, metadata, created_at
     FROM checkpoints
     WHERE thread_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [threadId]
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as any;
  return {
    threadId: row.thread_id as string,
    checkpointId: row.checkpoint_id as string,
    parentCheckpointId: row.parent_checkpoint_id as string | null,
    data: JSON.parse(row.checkpoint_data as string),
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    createdAt: row.created_at as string,
  };
}

/**
 * Get a specific checkpoint by ID
 */
export async function getCheckpoint(threadId: string, checkpointId: string): Promise<Checkpoint | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT thread_id, checkpoint_id, parent_checkpoint_id, checkpoint_data, metadata, created_at
     FROM checkpoints
     WHERE thread_id = ? AND checkpoint_id = ?`,
    [threadId, checkpointId]
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as any;
  return {
    threadId: row.thread_id as string,
    checkpointId: row.checkpoint_id as string,
    parentCheckpointId: row.parent_checkpoint_id as string | null,
    data: JSON.parse(row.checkpoint_data as string),
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    createdAt: row.created_at as string,
  };
}

/**
 * List all checkpoints for a thread (ordered by creation time)
 */
export async function listCheckpoints(threadId: string, limit: number = 10): Promise<Checkpoint[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT thread_id, checkpoint_id, parent_checkpoint_id, checkpoint_data, metadata, created_at
     FROM checkpoints
     WHERE thread_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [threadId, limit]
  );

  if (!result.rows) return [];

  return result.rows.map((row: any) => ({
    threadId: row.thread_id as string,
    checkpointId: row.checkpoint_id as string,
    parentCheckpointId: row.parent_checkpoint_id as string | null,
    data: JSON.parse(row.checkpoint_data as string),
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    createdAt: row.created_at as string,
  }));
}

/**
 * Delete all checkpoints for a thread
 */
export async function clearThread(threadId: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM checkpoints WHERE thread_id = ?`, [threadId]);
}

/**
 * Delete all checkpoints (full reset)
 */
export async function clearAllCheckpoints(): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM checkpoints`);
}

export interface ThreadSummary {
  threadId: string;
  title: string | null;
  lastMessagePreview: string;
  createdAt: string;
  messageCount: number;
}

/**
 * List all conversation threads with a preview of their content
 */
export async function listThreads(): Promise<ThreadSummary[]> {
  const db = getDatabase();

  // Get latest checkpoint per thread for data, and look for title in ANY checkpoint
  const result = await db.execute(
    `SELECT c1.thread_id, c1.checkpoint_data, c1.created_at,
            c2.metadata as title_metadata
     FROM checkpoints c1
     LEFT JOIN (
       SELECT thread_id, metadata
       FROM checkpoints
       WHERE metadata IS NOT NULL AND metadata LIKE '%thread_title%'
       GROUP BY thread_id
     ) c2 ON c1.thread_id = c2.thread_id
     WHERE (c1.thread_id, c1.created_at) IN (
       SELECT thread_id, MAX(created_at) FROM checkpoints GROUP BY thread_id
     )
     ORDER BY c1.created_at DESC`
  );

  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => {
    let preview = 'New conversation';
    let messageCount = 0;
    let title: string | null = null;
    try {
      const data = JSON.parse(row.checkpoint_data as string);
      if (Array.isArray(data.messages)) {
        messageCount = data.messages.length;
        const firstUserMsg = data.messages.find((m: any) => m.role === 'user');
        if (firstUserMsg) {
          preview = firstUserMsg.content.slice(0, 60);
          if (firstUserMsg.content.length > 60) preview += '…';
        }
      }
    } catch {}
    // Check title from any checkpoint's metadata (fixes race condition)
    try {
      const metaStr = row.title_metadata || row.metadata;
      if (metaStr) {
        const meta = JSON.parse(metaStr as string);
        title = meta.thread_title || null;
      }
    } catch {}
    return {
      threadId: row.thread_id as string,
      title,
      lastMessagePreview: preview,
      createdAt: row.created_at as string,
      messageCount,
    };
  });
}

/**
 * Set a title for a thread (stores in metadata of the latest checkpoint)
 */
export async function setThreadTitle(threadId: string, title: string): Promise<void> {
  const db = getDatabase();
  // Get the latest checkpoint for this thread
  const latest = await getLatestCheckpoint(threadId);
  if (!latest) return;

  const metadata = latest.metadata || {};
  metadata.thread_title = title;

  await db.execute(
    `UPDATE checkpoints SET metadata = ? WHERE thread_id = ? AND checkpoint_id = ?`,
    [JSON.stringify(metadata), threadId, latest.checkpointId]
  );
}

/**
 * Delete a specific thread and all its checkpoints
 */
export async function deleteThread(threadId: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM checkpoints WHERE thread_id = ?`, [threadId]);
}
