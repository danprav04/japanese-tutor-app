/**
 * Curriculum Service
 * 
 * Manages curriculum nodes (vocabulary, grammar, kanji) and their
 * dependency graph. Supports CRUD operations and graph traversal.
 */

import { getDatabase } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export interface CurriculumNode {
  nodeId: string;
  title: string;
  type: 'grammar' | 'vocab' | 'kanji';
  jlptLevel: number;
  contentPayload: Record<string, unknown> | null;
  sourceFile: string | null;
  createdAt: string;
}

export interface NodeDependency {
  parentId: string;
  childId: string;
  dependencyType: 'strict' | 'soft';
}

/**
 * Add a new curriculum node
 */
/**
 * Add a new curriculum node
 */
export async function addNode(
  title: string,
  type: 'grammar' | 'vocab' | 'kanji',
  jlptLevel: number,
  content?: Record<string, unknown>,
  sourceFile?: string
): Promise<CurriculumNode> {
  const nodeId = uuidv4();
  const db = getDatabase();

  await db.execute(
    `INSERT INTO curriculum_nodes (node_id, title, type, jlpt_level, content_payload, source_file)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nodeId, title, type, jlptLevel, content ? JSON.stringify(content) : null, sourceFile ?? null]
  );

  return {
    nodeId,
    title,
    type,
    jlptLevel,
    contentPayload: content ?? null,
    sourceFile: sourceFile ?? null,
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
    content?: Record<string, unknown>;
    sourceFile?: string;
  }>
): Promise<CurriculumNode[]> {
  return Promise.all(
    nodes.map((n) => addNode(n.title, n.type, n.jlptLevel, n.content, n.sourceFile))
  );
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

  const row = result.rows[0] as any;
  return {
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    sourceFile: row.source_file as string | null,
    createdAt: row.created_at as string,
  };
}

/**
 * Get all nodes, optionally filtered by type and/or JLPT level
 */
export async function getNodes(filters?: {
  type?: 'grammar' | 'vocab' | 'kanji';
  jlptLevel?: number;
  sourceFile?: string;
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

  query += ` ORDER BY jlpt_level DESC, type, title`;

  const result = await db.execute(query, params);
  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    sourceFile: row.source_file as string | null,
    createdAt: row.created_at as string,
  }));
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

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    sourceFile: row.source_file as string | null,
    createdAt: row.created_at as string,
  }));
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

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    sourceFile: row.source_file as string | null,
    createdAt: row.created_at as string,
  }));
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
     ORDER BY cn.jlpt_level DESC, cn.type`
  );

  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    sourceFile: row.source_file as string | null,
    createdAt: row.created_at as string,
  }));
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

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    sourceFile: row.source_file as string | null,
    createdAt: row.created_at as string,
  }));
}

/**
 * Delete a node, its associated flashcards, and its dependencies.
 * Cards use ON DELETE SET NULL, so we explicitly remove them to avoid orphans.
 */
export async function deleteNode(nodeId: string): Promise<void> {
  const db = getDatabase();
  // Delete associated flashcards first (schema is ON DELETE SET NULL)
  await db.execute(`DELETE FROM cards WHERE node_id = ?`, [nodeId]);
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
  contentPayload: Record<string, unknown> | null;
  masteryScore: number;
  attempts: number;
  unlocked: boolean;
}

/**
 * Get all nodes with their progress data (for curriculum browser)
 */
export async function getNodesWithProgress(searchQuery?: string): Promise<NodeWithProgress[]> {
  const db = getDatabase();
  let query = `SELECT cn.node_id, cn.title, cn.type, cn.jlpt_level, cn.content_payload,
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

  query += ` ORDER BY cn.type, cn.jlpt_level DESC, cn.title`;

  const result = await db.execute(query, params);
  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    jlptLevel: row.jlpt_level as number,
    contentPayload: row.content_payload ? JSON.parse(row.content_payload as string) : null,
    masteryScore: row.mastery_score as number,
    attempts: row.attempts as number,
    unlocked: (row.unlocked as number) === 1,
  }));
}
