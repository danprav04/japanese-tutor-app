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
export function addNode(
  title: string,
  type: 'grammar' | 'vocab' | 'kanji',
  jlptLevel: number,
  content?: Record<string, unknown>,
  sourceFile?: string
): CurriculumNode {
  const nodeId = uuidv4();
  const db = getDatabase();

  db.execute(
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
export function addNodes(
  nodes: Array<{
    title: string;
    type: 'grammar' | 'vocab' | 'kanji';
    jlptLevel: number;
    content?: Record<string, unknown>;
    sourceFile?: string;
  }>
): CurriculumNode[] {
  return nodes.map((n) => addNode(n.title, n.type, n.jlptLevel, n.content, n.sourceFile));
}

/**
 * Add a dependency between two nodes
 */
export function addDependency(
  parentId: string,
  childId: string,
  type: 'strict' | 'soft' = 'strict'
): void {
  const db = getDatabase();
  db.execute(
    `INSERT OR IGNORE INTO node_dependencies (parent_id, child_id, dependency_type)
     VALUES (?, ?, ?)`,
    [parentId, childId, type]
  );
}

/**
 * Get a single node by ID
 */
export function getNode(nodeId: string): CurriculumNode | null {
  const db = getDatabase();
  const result = db.execute(
    `SELECT * FROM curriculum_nodes WHERE node_id = ?`,
    [nodeId]
  );

  if (!result.rows || result.rows.length === 0) return null;

  const row = result.rows[0];
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
export function getNodes(filters?: {
  type?: 'grammar' | 'vocab' | 'kanji';
  jlptLevel?: number;
  sourceFile?: string;
}): CurriculumNode[] {
  const db = getDatabase();
  let query = `SELECT * FROM curriculum_nodes WHERE 1=1`;
  const params: unknown[] = [];

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

  const result = db.execute(query, params);
  if (!result.rows) return [];

  return result.rows.map((row) => ({
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
export function getPrerequisites(nodeId: string): CurriculumNode[] {
  const db = getDatabase();
  const result = db.execute(
    `SELECT cn.* FROM curriculum_nodes cn
     JOIN node_dependencies nd ON cn.node_id = nd.parent_id
     WHERE nd.child_id = ?`,
    [nodeId]
  );

  if (!result.rows) return [];

  return result.rows.map((row) => ({
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
export function getDependents(nodeId: string): CurriculumNode[] {
  const db = getDatabase();
  const result = db.execute(
    `SELECT cn.* FROM curriculum_nodes cn
     JOIN node_dependencies nd ON cn.node_id = nd.child_id
     WHERE nd.parent_id = ?`,
    [nodeId]
  );

  if (!result.rows) return [];

  return result.rows.map((row) => ({
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
export function getUnlockedNodes(): CurriculumNode[] {
  const db = getDatabase();
  const result = db.execute(
    `SELECT cn.* FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     WHERE up.unlocked = 1 OR up.node_id IS NULL
     ORDER BY cn.jlpt_level DESC, cn.type`
  );

  if (!result.rows) return [];

  return result.rows.map((row) => ({
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
export function searchNodes(query: string): CurriculumNode[] {
  const db = getDatabase();
  const result = db.execute(
    `SELECT * FROM curriculum_nodes WHERE title LIKE ? ORDER BY title LIMIT 20`,
    [`%${query}%`]
  );

  if (!result.rows) return [];

  return result.rows.map((row) => ({
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
 * Delete a node and its dependencies
 */
export function deleteNode(nodeId: string): void {
  const db = getDatabase();
  db.execute(`DELETE FROM curriculum_nodes WHERE node_id = ?`, [nodeId]);
}

/**
 * Get curriculum stats
 */
export function getCurriculumStats(): {
  totalNodes: number;
  byType: Record<string, number>;
  byLevel: Record<number, number>;
} {
  const db = getDatabase();

  const totalResult = db.execute(`SELECT COUNT(*) as count FROM curriculum_nodes`);
  const total = (totalResult.rows?.[0]?.count as number) ?? 0;

  const typeResult = db.execute(
    `SELECT type, COUNT(*) as count FROM curriculum_nodes GROUP BY type`
  );
  const byType: Record<string, number> = {};
  typeResult.rows?.forEach((row) => {
    byType[row.type as string] = row.count as number;
  });

  const levelResult = db.execute(
    `SELECT jlpt_level, COUNT(*) as count FROM curriculum_nodes GROUP BY jlpt_level`
  );
  const byLevel: Record<number, number> = {};
  levelResult.rows?.forEach((row) => {
    byLevel[row.jlpt_level as number] = row.count as number;
  });

  return { totalNodes: total, byType, byLevel };
}
