/**
 * Curriculum Service
 * 
 * Manages curriculum nodes (vocabulary, grammar, kanji) and their
 * dependency graph. Supports CRUD operations and graph traversal.
 * 
 * Nodes are lightweight topic references — they store a summary and
 * chunk_refs pointing to source material in document_chunks.
 */

import { getDatabase } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export interface CurriculumNode {
  nodeId: string;
  title: string;
  type: 'grammar' | 'vocab' | 'kanji';
  jlptLevel: number;
  summary: string | null;
  chunkRefs: number[] | null;
  sourceFile: string | null;
  documentId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface NodeDependency {
  parentId: string;
  childId: string;
  dependencyType: 'strict' | 'soft';
}

/**
 * Add a new curriculum node (RAG-tree style).
 */
export async function addNode(
  title: string,
  type: 'grammar' | 'vocab' | 'kanji',
  jlptLevel: number,
  opts?: {
    summary?: string;
    chunkRefs?: number[];
    sourceFile?: string;
    documentId?: string;
    sortOrder?: number;
  }
): Promise<CurriculumNode> {
  const nodeId = uuidv4();
  const db = getDatabase();

  const summary = opts?.summary ?? null;
  const chunkRefs = opts?.chunkRefs ? JSON.stringify(opts.chunkRefs) : null;
  const sourceFile = opts?.sourceFile ?? null;
  const documentId = opts?.documentId ?? null;
  const sortOrder = opts?.sortOrder ?? 0;

  await db.execute(
    `INSERT INTO curriculum_nodes (node_id, title, type, jlpt_level, summary, chunk_refs, source_file, document_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nodeId, title, type, jlptLevel, summary, chunkRefs, sourceFile, documentId, sortOrder]
  );

  return {
    nodeId,
    title,
    type,
    jlptLevel,
    summary,
    chunkRefs: opts?.chunkRefs ?? null,
    sourceFile,
    documentId,
    sortOrder,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Add multiple nodes at once (for bulk ingestion)
 */
export async function addNodes(
  nodes: Array<{
    title: string;
    type: 'grammar' | 'vocab' | 'kanji';
    jlptLevel: number;
    summary?: string;
    chunkRefs?: number[];
    sourceFile?: string;
    documentId?: string;
    sortOrder?: number;
  }>
): Promise<CurriculumNode[]> {
  return Promise.all(
    nodes.map((n) => addNode(n.title, n.type, n.jlptLevel, {
      summary: n.summary,
      chunkRefs: n.chunkRefs,
      sourceFile: n.sourceFile,
      documentId: n.documentId,
      sortOrder: n.sortOrder,
    }))
  );
}

// ─── Row mapping helper ──────────────────────────────────────

function mapRowToNode(row: any): CurriculumNode {
  let chunkRefs: number[] | null = null;
  if (row.chunk_refs) {
    try { chunkRefs = JSON.parse(row.chunk_refs as string); } catch { /* bad json */ }
  }
  return {
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    summary: (row.summary as string) ?? null,
    chunkRefs,
    sourceFile: row.source_file as string | null,
    documentId: (row.document_id as string) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

/**
 * Add a dependency between two nodes
 */
export async function addDependency(
  parentId: string,
  childId: string,
  type: 'strict' | 'soft' = 'strict'
): Promise<void> {
  const db = getDatabase();
  await db.execute(
    `INSERT OR IGNORE INTO node_dependencies (parent_id, child_id, dependency_type)
     VALUES (?, ?, ?)`,
    [parentId, childId, type]
  );
}

/**
 * Get a single node by ID
 */
export async function getNode(nodeId: string): Promise<CurriculumNode | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM curriculum_nodes WHERE node_id = ?`,
    [nodeId]
  );

  if (!result.rows || result.rows.length === 0) return null;
  return mapRowToNode(result.rows[0]);
}

/**
 * Get all nodes, optionally filtered by type and/or JLPT level
 */
export async function getNodes(filters?: {
  type?: 'grammar' | 'vocab' | 'kanji';
  jlptLevel?: number;
  sourceFile?: string;
  documentId?: string;
}): Promise<CurriculumNode[]> {
  const db = getDatabase();
  let query = `SELECT * FROM curriculum_nodes WHERE 1=1`;
  const params: any[] = [];

  if (filters?.type) {
    query += ` AND type = ?`;
    params.push(filters.type);
  }
  if (filters?.jlptLevel) {
    query += ` AND jlpt_level = ?`;
    params.push(filters.jlptLevel);
  }
  if (filters?.sourceFile) {
    query += ` AND source_file = ?`;
    params.push(filters.sourceFile);
  }
  if (filters?.documentId) {
    query += ` AND document_id = ?`;
    params.push(filters.documentId);
  }

  query += ` ORDER BY sort_order ASC, jlpt_level DESC, type, title`;

  const result = await db.execute(query, params);
  if (!result.rows) return [];
  return (result.rows as any[]).map(mapRowToNode);
}

/**
 * Get prerequisites for a node (what you need to learn first)
 */
export async function getPrerequisites(nodeId: string): Promise<CurriculumNode[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT cn.* FROM curriculum_nodes cn
     JOIN node_dependencies nd ON cn.node_id = nd.parent_id
     WHERE nd.child_id = ?`,
    [nodeId]
  );

  if (!result.rows) return [];
  return (result.rows as any[]).map(mapRowToNode);
}

/**
 * Get nodes that depend on this node (what it unlocks)
 */
export async function getDependents(nodeId: string): Promise<CurriculumNode[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT cn.* FROM curriculum_nodes cn
     JOIN node_dependencies nd ON cn.node_id = nd.child_id
     WHERE nd.parent_id = ?`,
    [nodeId]
  );

  if (!result.rows) return [];
  return (result.rows as any[]).map(mapRowToNode);
}

/**
 * Get unlocked nodes (where all prerequisites are mastered)
 * Uses recursive CTE for graph traversal
 */
export async function getUnlockedNodes(): Promise<CurriculumNode[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT cn.* FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     WHERE up.unlocked = 1 OR up.node_id IS NULL
     ORDER BY cn.sort_order ASC, cn.jlpt_level DESC, cn.type`
  );

  if (!result.rows) return [];
  return (result.rows as any[]).map(mapRowToNode);
}

/**
 * Search nodes by title
 */
export async function searchNodes(query: string): Promise<CurriculumNode[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT * FROM curriculum_nodes WHERE title LIKE ? ORDER BY title LIMIT 20`,
    [`%${query}%`]
  );

  if (!result.rows) return [];
  return (result.rows as any[]).map(mapRowToNode);
}

/**
 * Delete a node and its dependencies.
 */
export async function deleteNode(nodeId: string): Promise<void> {
  const db = getDatabase();
  // Delete the node (cascades to user_progress and node_dependencies)
  await db.execute(`DELETE FROM curriculum_nodes WHERE node_id = ?`, [nodeId]);
}

/**
 * Get curriculum stats
 */
export async function getCurriculumStats(): Promise<{
  totalNodes: number;
  byType: Record<string, number>;
  byLevel: Record<number, number>;
}> {
  const db = getDatabase();

  const totalResult = await db.execute(`SELECT COUNT(*) as count FROM curriculum_nodes`);
  const total = ((totalResult.rows?.[0] as any)?.count as number) ?? 0;

  const typeResult = await db.execute(
    `SELECT type, COUNT(*) as count FROM curriculum_nodes GROUP BY type`
  );
  const byType: Record<string, number> = {};
  (typeResult.rows as any[])?.forEach((row: any) => {
    byType[row.type as string] = row.count as number;
  });

  const levelResult = await db.execute(
    `SELECT jlpt_level, COUNT(*) as count FROM curriculum_nodes GROUP BY jlpt_level`
  );
  const byLevel: Record<number, number> = {};
  (levelResult.rows as any[])?.forEach((row: any) => {
    byLevel[row.jlpt_level as number] = row.count as number;
  });

  return { totalNodes: total, byType, byLevel };
}

export interface NodeWithProgress {
  nodeId: string;
  title: string;
  type: 'grammar' | 'vocab' | 'kanji';
  jlptLevel: number;
  summary: string | null;
  sourceFile: string | null;
  masteryScore: number;
  attempts: number;
  unlocked: boolean;
}

/**
 * Get all nodes with their progress data (for curriculum browser)
 */
export async function getNodesWithProgress(searchQuery?: string): Promise<NodeWithProgress[]> {
  const db = getDatabase();
  let query = `SELECT cn.node_id, cn.title, cn.type, cn.jlpt_level, cn.summary, cn.source_file, cn.sort_order,
                      COALESCE(up.mastery_score, 0) as mastery_score,
                      COALESCE(up.attempts, 0) as attempts,
                      COALESCE(up.unlocked, 0) as unlocked
               FROM curriculum_nodes cn
               LEFT JOIN user_progress up ON cn.node_id = up.node_id`;
  const params: any[] = [];

  if (searchQuery && searchQuery.trim()) {
    query += ` WHERE cn.title LIKE ?`;
    params.push(`%${searchQuery.trim()}%`);
  }

  query += ` ORDER BY cn.sort_order ASC, cn.type, cn.jlpt_level DESC, cn.title`;

  const result = await db.execute(query, params);
  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    summary: (row.summary as string) ?? null,
    sourceFile: row.source_file as string | null,
    masteryScore: row.mastery_score as number,
    attempts: row.attempts as number,
    unlocked: (row.unlocked as number) === 1,
  }));
}

/**
 * Delete all curriculum data (nodes, progress, documents).
 * Effectively a "factory reset" for the learning data.
 */
export async function deleteAllCurriculum(): Promise<void> {
  const db = getDatabase();
  
  // 1. Delete all user progress
  await db.execute('DELETE FROM user_progress');

  // 2. Delete all node dependencies
  await db.execute('DELETE FROM node_dependencies');

  // 3. Delete all curriculum nodes
  await db.execute('DELETE FROM curriculum_nodes');

  // 4. Delete all document chunks (RAG)
  await db.execute('DELETE FROM document_chunks');

  // 5. Delete all documents
  await db.execute('DELETE FROM documents');
  
  // 6. Reset seeded flags so app can re-seed if restarted
  await db.execute("DELETE FROM app_settings WHERE key = 'curriculum_seeded'");
  await db.execute("DELETE FROM app_settings WHERE key = 'source_backfill_v1'");

  console.log('🧹 All curriculum data deleted.');
}
