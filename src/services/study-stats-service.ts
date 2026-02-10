/**
 * Study Stats Service
 *
 * Provides rich analytics data for the progress screen:
 * - Daily activity history
 * - Recent mastery changes
 * - Study session summaries
 * - Weekly streak calendar
 */

import { getDatabase } from '../db/database';

// ─── Types ───────────────────────────────────────────────────

export interface DailyActivity {
  date: string;        // YYYY-MM-DD
  reviewCount: number;
  correctCount: number;
  newCardsStudied: number;
}

export interface MasteryChange {
  nodeId: string;
  title: string;
  type: 'grammar' | 'vocab' | 'kanji';
  masteryScore: number;
  attempts: number;
  lastReviewed: string | null;
}

export interface StudySessionSummary {
  todayReviews: number;
  todayCorrect: number;
  todayAccuracy: number;
  todayMasteryGains: number; // nodes that crossed 0.5 today
  cardsReviewedThisWeek: number;
}

export interface WeekDay {
  date: string;   // YYYY-MM-DD
  dayLabel: string; // "Mon", "Tue", etc.
  active: boolean;
  reviewCount: number;
}

export interface TypeBreakdown {
  type: string;
  total: number;
  mastered: number;
  learning: number;
  notStarted: number;
  avgMastery: number;
}

export interface LevelBreakdown {
  level: number;
  total: number;
  mastered: number;
  avgMastery: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function getDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getDayLabel(d: Date): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get review activity for the last N days.
 */
export async function getDailyActivity(days: number = 7): Promise<DailyActivity[]> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT
       DATE(review_time) as review_date,
       COUNT(*) as review_count,
       SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) as correct_count,
       SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) as new_cards
     FROM review_logs
     WHERE review_time >= datetime('now', ?)
     GROUP BY DATE(review_time)
     ORDER BY review_date ASC`,
    [`-${days} days`]
  );

  const activityMap = new Map<string, DailyActivity>();

  // Pre-fill empty days
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getDateString(d);
    activityMap.set(dateStr, {
      date: dateStr,
      reviewCount: 0,
      correctCount: 0,
      newCardsStudied: 0,
    });
  }

  // Fill with actual data
  if (result.rows) {
    for (const row of result.rows as Record<string, unknown>[]) {
      const dateStr = row.review_date as string;
      if (activityMap.has(dateStr)) {
        activityMap.set(dateStr, {
          date: dateStr,
          reviewCount: (row.review_count as number) ?? 0,
          correctCount: (row.correct_count as number) ?? 0,
          newCardsStudied: (row.new_cards as number) ?? 0,
        });
      }
    }
  }

  return Array.from(activityMap.values());
}

/**
 * Get the recently changed mastery items, sorted by most recent.
 */
export async function getRecentMasteryChanges(limit: number = 5): Promise<MasteryChange[]> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT
       up.node_id,
       cn.title,
       cn.type,
       up.mastery_score,
       up.attempts,
       up.last_reviewed
     FROM user_progress up
     JOIN curriculum_nodes cn ON up.node_id = cn.node_id
     WHERE up.attempts > 0
     ORDER BY up.last_reviewed DESC
     LIMIT ?`,
    [limit]
  );

  if (!result.rows) return [];
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as 'grammar' | 'vocab' | 'kanji',
    masteryScore: (row.mastery_score as number) ?? 0,
    attempts: (row.attempts as number) ?? 0,
    lastReviewed: (row.last_reviewed as string) ?? null,
  }));
}

/**
 * Get today's study session summary.
 */
export async function getStudySessionSummary(): Promise<StudySessionSummary> {
  const db = getDatabase();
  const today = getDateString(new Date());

  // Today's review stats
  const todayResult = await db.execute(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) as correct
     FROM review_logs
     WHERE DATE(review_time) = ?`,
    [today]
  );

  const todayReviews = ((todayResult.rows?.[0] as any)?.total as number) ?? 0;
  const todayCorrect = ((todayResult.rows?.[0] as any)?.correct as number) ?? 0;

  // Mastery gains today (nodes that have been reviewed today and > 0.5)
  const masteryResult = await db.execute(
    `SELECT COUNT(*) as count
     FROM user_progress
     WHERE mastery_score >= 0.5
       AND DATE(last_reviewed) = ?`,
    [today]
  );
  const todayMasteryGains = ((masteryResult.rows?.[0] as any)?.count as number) ?? 0;

  // This week's total
  const weekResult = await db.execute(
    `SELECT COUNT(*) as count FROM review_logs
     WHERE review_time >= datetime('now', '-7 days')`
  );
  const cardsReviewedThisWeek = ((weekResult.rows?.[0] as any)?.count as number) ?? 0;

  return {
    todayReviews,
    todayCorrect,
    todayAccuracy: todayReviews > 0 ? todayCorrect / todayReviews : 0,
    todayMasteryGains,
    cardsReviewedThisWeek,
  };
}

/**
 * Get weekly streak calendar (last 7 days).
 */
export async function getWeeklyStreak(): Promise<WeekDay[]> {
  const activity = await getDailyActivity(7);

  return activity.map((a) => {
    const d = new Date(a.date + 'T12:00:00');
    return {
      date: a.date,
      dayLabel: getDayLabel(d),
      active: a.reviewCount > 0,
      reviewCount: a.reviewCount,
    };
  });
}

/**
 * Get progress breakdown by type (grammar, vocab, kanji).
 */
export async function getTypeBreakdown(): Promise<TypeBreakdown[]> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT
       cn.type,
       COUNT(*) as total,
       SUM(CASE WHEN COALESCE(up.mastery_score, 0) >= 0.95 THEN 1 ELSE 0 END) as mastered,
       SUM(CASE WHEN COALESCE(up.mastery_score, 0) > 0.1 AND COALESCE(up.mastery_score, 0) < 0.95 THEN 1 ELSE 0 END) as learning,
       SUM(CASE WHEN COALESCE(up.mastery_score, 0) <= 0.1 THEN 1 ELSE 0 END) as not_started,
       AVG(COALESCE(up.mastery_score, 0)) as avg_mastery
     FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     GROUP BY cn.type
     ORDER BY cn.type`
  );

  if (!result.rows) return [];
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    type: row.type as string,
    total: (row.total as number) ?? 0,
    mastered: (row.mastered as number) ?? 0,
    learning: (row.learning as number) ?? 0,
    notStarted: (row.not_started as number) ?? 0,
    avgMastery: (row.avg_mastery as number) ?? 0,
  }));
}

/**
 * Get progress breakdown by JLPT level.
 */
export async function getLevelBreakdown(): Promise<LevelBreakdown[]> {
  const db = getDatabase();

  const result = await db.execute(
    `SELECT
       cn.jlpt_level as level,
       COUNT(*) as total,
       SUM(CASE WHEN COALESCE(up.mastery_score, 0) >= 0.95 THEN 1 ELSE 0 END) as mastered,
       AVG(COALESCE(up.mastery_score, 0)) as avg_mastery
     FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     GROUP BY cn.jlpt_level
     ORDER BY cn.jlpt_level DESC`
  );

  if (!result.rows) return [];
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    level: (row.level as number) ?? 5,
    total: (row.total as number) ?? 0,
    mastered: (row.mastered as number) ?? 0,
    avgMastery: (row.avg_mastery as number) ?? 0,
  }));
}
