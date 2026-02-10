/**
 * Progress Service
 * 
 * Bridges the BKT algorithm and database layer.
 * Handles reading/writing user progress from op-sqlite
 * and computing BKT mastery updates.
 */

import { getDatabase } from '../db/database';
import { updateMastery, DEFAULT_BKT_PARAMS, isMastered, type BKTParams } from '../algorithms/bkt';

export interface ProgressRecord {
  nodeId: string;
  masteryScore: number;
  pTransit: number;
  pGuess: number;
  pSlip: number;
  attempts: number;
  correctCount: number;
  lastReviewed: string | null;
  unlocked: boolean;
}

/**
 * Get progress for a specific curriculum node
 */
/**
 * Get progress for a specific curriculum node
 */
export async function getProgress(nodeId: string): Promise<ProgressRecord | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT node_id, mastery_score, p_transit, p_guess, p_slip, attempts, correct_count, last_reviewed, unlocked
     FROM user_progress WHERE node_id = ?`,
    [nodeId]
  );

  if (!result.rows || result.rows.length === 0) return null;

  const row = result.rows[0] as any;
  return {
    nodeId: row.node_id as string,
    masteryScore: row.mastery_score as number,
    pTransit: row.p_transit as number,
    pGuess: row.p_guess as number,
    pSlip: row.p_slip as number,
    attempts: row.attempts as number,
    correctCount: row.correct_count as number,
    lastReviewed: row.last_reviewed as string | null,
    unlocked: (row.unlocked as number) === 1,
  };
}

/**
 * Get all progress records
 */
export async function getAllProgress(): Promise<ProgressRecord[]> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT node_id, mastery_score, p_transit, p_guess, p_slip, attempts, correct_count, last_reviewed, unlocked
     FROM user_progress ORDER BY mastery_score DESC`
  );

  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    masteryScore: row.mastery_score as number,
    pTransit: row.p_transit as number,
    pGuess: row.p_guess as number,
    pSlip: row.p_slip as number,
    attempts: row.attempts as number,
    correctCount: row.correct_count as number,
    lastReviewed: row.last_reviewed as string | null,
    unlocked: (row.unlocked as number) === 1,
  }));
}

/**
 * Initialize progress for a new curriculum node
 */
export async function initializeProgress(nodeId: string, unlocked: boolean = false): Promise<void> {
  const db = getDatabase();
  await db.execute(
    `INSERT OR IGNORE INTO user_progress (node_id, mastery_score, p_transit, p_guess, p_slip, attempts, correct_count, unlocked)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
    [nodeId, 0.1, DEFAULT_BKT_PARAMS.p_transit, DEFAULT_BKT_PARAMS.p_guess, DEFAULT_BKT_PARAMS.p_slip, unlocked ? 1 : 0]
  );
}

/**
 * Record an answer and update BKT mastery
 */
export async function recordAnswer(nodeId: string, isCorrect: boolean): Promise<ProgressRecord> {
  const existing = await getProgress(nodeId);
  if (!existing) {
    await initializeProgress(nodeId, true);
    return recordAnswer(nodeId, isCorrect); // retry after init
  }

  const params: BKTParams = {
    p_transit: existing.pTransit,
    p_guess: existing.pGuess,
    p_slip: existing.pSlip,
  };

  const newMastery = updateMastery(existing.masteryScore, isCorrect, params);
  const now = new Date().toISOString();

  const db = getDatabase();
  await db.execute(
    `UPDATE user_progress 
     SET mastery_score = ?, attempts = attempts + 1, correct_count = correct_count + ?, last_reviewed = ?
     WHERE node_id = ?`,
    [newMastery, isCorrect ? 1 : 0, now, nodeId]
  );

  // Check if mastery unlocks dependent nodes
  if (isMastered(newMastery)) {
    await unlockDependentNodes(nodeId);
  }

  return {
    ...existing,
    masteryScore: newMastery,
    attempts: existing.attempts + 1,
    correctCount: existing.correctCount + (isCorrect ? 1 : 0),
    lastReviewed: now,
  };
}

/**
 * Unlock nodes that depend on a now-mastered node
 */
async function unlockDependentNodes(masteredNodeId: string): Promise<void> {
  const db = getDatabase();

  // Find all children of this node
  const deps = await db.execute(
    `SELECT child_id FROM node_dependencies WHERE parent_id = ?`,
    [masteredNodeId]
  );

  if (!deps.rows) return;

  for (const dep of deps.rows as any[]) {
    const childId = dep.child_id as string;

    // Check if ALL parents of this child are mastered
    const unmastered = await db.execute(
      `SELECT COUNT(*) as count FROM node_dependencies nd
       JOIN user_progress up ON nd.parent_id = up.node_id
       WHERE nd.child_id = ? AND (up.mastery_score < 0.95 OR up.node_id IS NULL)`,
      [childId]
    );

    const unmasteredCount = ((unmastered.rows?.[0] as any)?.count as number) ?? 1;

    if (unmasteredCount === 0) {
      // All prerequisites met — unlock
      await db.execute(
        `INSERT OR IGNORE INTO user_progress (node_id, unlocked) VALUES (?, 1)`,
        [childId]
      );
      await db.execute(
        `UPDATE user_progress SET unlocked = 1 WHERE node_id = ?`,
        [childId]
      );
    }
  }
}

/**
 * Get overall mastery across all tracked nodes
 */
export async function getOverallMastery(): Promise<{ mastery: number; total: number; mastered: number }> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT AVG(mastery_score) as avg_mastery, COUNT(*) as total,
            SUM(CASE WHEN mastery_score >= 0.95 THEN 1 ELSE 0 END) as mastered
     FROM user_progress`
  );

  if (!result.rows || result.rows.length === 0) {
    return { mastery: 0, total: 0, mastered: 0 };
  }

  const row = result.rows[0] as any;
  return {
    mastery: (row.avg_mastery as number) || 0,
    total: row.total as number,
    mastered: row.mastered as number,
  };
}

/**
 * Get category-level progress (grouped by JLPT level & type)
 */
export async function getCategoryProgress(): Promise<Array<{
  name: string;
  mastery: number;
  total: number;
  learned: number;
}>> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT cn.type || ' N' || cn.jlpt_level as category_name,
            AVG(up.mastery_score) as avg_mastery,
            COUNT(*) as total,
            SUM(CASE WHEN up.mastery_score >= 0.95 THEN 1 ELSE 0 END) as learned
     FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     GROUP BY cn.type, cn.jlpt_level
     ORDER BY cn.jlpt_level DESC, cn.type`
  );

  if (!result.rows) return [];

  return (result.rows as any[]).map((row) => ({
    name: row.category_name as string,
    mastery: (row.avg_mastery as number) || 0,
    total: row.total as number,
    learned: (row.learned as number) || 0,
  }));
}

