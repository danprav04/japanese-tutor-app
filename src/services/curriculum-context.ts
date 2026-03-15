/**
 * Curriculum Context Service
 *
 * Builds a summary of the student's curriculum and mastery state
 * for injection into the tutor's system prompt. Identifies the
 * target lesson and review nodes for pre-fetching source material.
 */

import { getDatabase } from '../db/database';

// ─── Types ───────────────────────────────────────────────────

interface CurriculumItem {
  nodeId: string;
  title: string;
  type: string;
  jlptLevel: number;
  masteryScore: number;
  attempts: number;
  summary: string | null;
}

export interface CurriculumContextResult {
  context: string;
  status: CurriculumStatus;
  targetLessonNodeId: string | null;
  targetReviewNodeId: string | null;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Build a curriculum context string for the AI tutor.
 * Groups items by mastery level and type, prioritizing unmastered items.
 * Also identifies target lesson and review nodes for RAG pre-fetching.
 */
export type CurriculumStatus = 'empty' | 'all_mastered' | 'has_content';

export async function buildCurriculumContext(): Promise<CurriculumContextResult> {
  const db = getDatabase();

  // Join curriculum_nodes with user_progress to get mastery data
  const result = await db.execute(
    `SELECT cn.node_id, cn.title, cn.type, cn.jlpt_level, cn.summary,
            COALESCE(up.mastery_score, 0) as mastery_score,
            COALESCE(up.attempts, 0) as attempts
     FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     ORDER BY cn.sort_order ASC, up.mastery_score ASC, cn.type, cn.jlpt_level DESC`
  );

  if (!result.rows || result.rows.length === 0) {
    return {
      context: '⚠️ CURRICULUM IS EMPTY. The student has NO curriculum items. Do NOT teach anything. Tell them to add curriculum items via the Curriculum tab before starting lessons. Do NOT invent topics or suggest learning anything.',
      status: 'empty',
      targetLessonNodeId: null,
      targetReviewNodeId: null,
    };
  }

  const items: CurriculumItem[] = (result.rows as any[]).map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    type: row.type as string,
    jlptLevel: row.jlpt_level as number,
    masteryScore: row.mastery_score as number,
    attempts: row.attempts as number,
    summary: (row.summary as string) ?? null,
  }));

  // Group by mastery bands
  const unlearned = items.filter((i) => i.masteryScore < 0.3);
  const learning = items.filter((i) => i.masteryScore >= 0.3 && i.masteryScore < 0.7);
  const familiar = items.filter((i) => i.masteryScore >= 0.7 && i.masteryScore < 0.95);
  const mastered = items.filter((i) => i.masteryScore >= 0.95);

  // Identify target lesson (lowest mastery, preferring unlearned)
  const targetLesson = unlearned[0] || learning[0] || familiar[0] || null;

  // Identify target review (weakest item with at least 1 attempt, different from lesson)
  const targetReview = items.find(
    (i) => i.attempts > 0 && i.masteryScore < 0.7 && i.nodeId !== targetLesson?.nodeId
  ) || null;

  // Detect all-mastered state
  if (mastered.length === items.length) {
    return {
      context: `=== STUDENT CURRICULUM STATUS ===\nTotal items: ${items.length} | ALL MASTERED ✅\n\n🎉 ALL ${items.length} items are mastered! Congratulate the student and tell them they have completed all available lessons. Suggest they add more curriculum via the Curriculum tab if they want to keep learning. Do NOT invent new topics.`,
      status: 'all_mastered',
      targetLessonNodeId: null,
      targetReviewNodeId: null,
    };
  }

  const lines: string[] = [];
  lines.push(`=== STUDENT CURRICULUM STATUS ===`);
  lines.push(`Total items: ${items.length} | Mastered: ${mastered.length} | Learning: ${learning.length + familiar.length} | New: ${unlearned.length}`);
  lines.push('');

  // Highlight target lesson
  if (targetLesson) {
    const detail = targetLesson.summary ? ` — ${targetLesson.summary}` : '';
    lines.push(`🎯 TARGET LESSON: "${targetLesson.title}"${detail} (${targetLesson.type})`);
    lines.push('');
  }

  // Highlight target review
  if (targetReview) {
    const pct = Math.round(targetReview.masteryScore * 100);
    lines.push(`🔄 TARGET REVIEW: "${targetReview.title}" (${pct}% mastery)`);
    lines.push('');
  }

  // Unlearned items — only show the NEXT few items to teach (gated progression)
  // This prevents the AI from seeing/teaching advanced subjects too early
  const VISIBLE_UNLEARNED_LIMIT = 5;
  if (unlearned.length > 0) {
    const visibleUnlearned = unlearned.slice(0, VISIBLE_UNLEARNED_LIMIT);
    lines.push(`📕 NOT YET LEARNED (teach these in order, one at a time):`);
    for (const item of visibleUnlearned) {
      const detail = item.summary ? ` — ${item.summary}` : '';
      lines.push(`  • "${item.title}" (${typeLabel(item.type)})${detail}`);
    }
    if (unlearned.length > VISIBLE_UNLEARNED_LIMIT) {
      lines.push(`  (${unlearned.length - VISIBLE_UNLEARNED_LIMIT} more items locked — will be visible after completing these)`);
    }
    lines.push('');
  }

  // Learning items — list briefly (review these)
  if (learning.length > 0) {
    lines.push('📙 STILL LEARNING (review these occasionally):');
    const grouped = groupByType(learning);
    for (const [type, typeItems] of Object.entries(grouped)) {
      const titles = typeItems.slice(0, 6).map((i) => i.title).join(', ');
      const extra = typeItems.length > 6 ? ` +${typeItems.length - 6} more` : '';
      lines.push(`  ${typeLabel(type)}: ${titles}${extra}`);
    }
    lines.push('');
  }

  // Familiar items — brief summary
  if (familiar.length > 0) {
    lines.push('📗 ALMOST MASTERED (light review):');
    const grouped = groupByType(familiar);
    for (const [type, typeItems] of Object.entries(grouped)) {
      const titles = typeItems.slice(0, 4).map((i) => i.title).join(', ');
      const extra = typeItems.length > 4 ? ` +${typeItems.length - 4} more` : '';
      lines.push(`  ${typeLabel(type)}: ${titles}${extra}`);
    }
    lines.push('');
  }

  // Mastered — just count
  if (mastered.length > 0) {
    lines.push(`✅ MASTERED (${mastered.length} items — no need to teach these)`);
  }

  return {
    context: lines.join('\n'),
    status: 'has_content',
    targetLessonNodeId: targetLesson?.nodeId ?? null,
    targetReviewNodeId: targetReview?.nodeId ?? null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function groupByType(items: CurriculumItem[]): Record<string, CurriculumItem[]> {
  const groups: Record<string, CurriculumItem[]> = {};
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  }
  return groups;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    grammar: 'Grammar',
    vocab: 'Vocabulary',
    kanji: 'Kanji',
  };
  return labels[type] || type;
}

// ─── Contextual SRS Review Context ──────────────────────────

/**
 * Build a review context block listing weak items
 * for the tutor to naturally weave into conversation.
 */
export async function getReviewContext(): Promise<string> {
  const db = getDatabase();

  // Get weak curriculum items (mastery < 0.35, with at least 1 attempt)
  const weakResult = await db.execute(
    `SELECT cn.title, cn.type, up.mastery_score
     FROM user_progress up
     JOIN curriculum_nodes cn ON up.node_id = cn.node_id
     WHERE up.mastery_score < 0.35 AND up.attempts > 0
     ORDER BY up.mastery_score ASC
     LIMIT 5`
  );

  const weakItems = (weakResult.rows as any[]) || [];

  if (weakItems.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('=== ITEMS NEEDING REVIEW ===');
  lines.push('When appropriate, weave a review of these items into the conversation naturally.');
  lines.push('For example, create a sentence that uses them and ask the student about it.');
  lines.push('');

  lines.push('⚠️ Weak items (low mastery):');
  for (const item of weakItems) {
    const pct = Math.round((item.mastery_score as number) * 100);
    lines.push(`  • ${item.title} (${item.type}, ${pct}% mastery)`);
  }
  lines.push('');

  return lines.join('\n');
}
