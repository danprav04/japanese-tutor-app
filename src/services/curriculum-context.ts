/**
 * Curriculum Context Service
 *
 * Builds a summary of the student's curriculum and mastery state
 * for injection into the tutor's system prompt. This makes the AI
 * aware of what the student has learned, is learning, and needs to learn.
 */

import { getDatabase } from '../db/database';

// ─── Types ───────────────────────────────────────────────────

interface CurriculumItem {
  title: string;
  type: string;
  jlptLevel: number;
  masteryScore: number;
  attempts: number;
  meaning: string | null;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Build a curriculum context string for the AI tutor.
 * Groups items by mastery level and type, prioritizing unmastered items.
 */
export async function buildCurriculumContext(): Promise<string> {
  const db = getDatabase();

  // Join curriculum_nodes with user_progress to get mastery data
  const result = await db.execute(
    `SELECT cn.title, cn.type, cn.jlpt_level, cn.content_payload,
            COALESCE(up.mastery_score, 0) as mastery_score,
            COALESCE(up.attempts, 0) as attempts
     FROM curriculum_nodes cn
     LEFT JOIN user_progress up ON cn.node_id = up.node_id
     ORDER BY up.mastery_score ASC, cn.type, cn.jlpt_level DESC`
  );

  if (!result.rows || result.rows.length === 0) {
    return 'The student has no curriculum items yet. Teach general beginner Japanese.';
  }

  const items: CurriculumItem[] = (result.rows as any[]).map((row) => {
    let meaning: string | null = null;
    if (row.content_payload) {
      try {
        const payload = JSON.parse(row.content_payload as string);
        meaning = payload.meaning || null;
      } catch {}
    }
    return {
      title: row.title as string,
      type: row.type as string,
      jlptLevel: row.jlpt_level as number,
      masteryScore: row.mastery_score as number,
      attempts: row.attempts as number,
      meaning,
    };
  });

  // Group by mastery bands
  const unlearned = items.filter((i) => i.masteryScore < 0.3);
  const learning = items.filter((i) => i.masteryScore >= 0.3 && i.masteryScore < 0.7);
  const familiar = items.filter((i) => i.masteryScore >= 0.7 && i.masteryScore < 0.95);
  const mastered = items.filter((i) => i.masteryScore >= 0.95);

  const lines: string[] = [];
  lines.push(`=== STUDENT CURRICULUM STATUS ===`);
  lines.push(`Total items: ${items.length} | Mastered: ${mastered.length} | Learning: ${learning.length + familiar.length} | New: ${unlearned.length}`);
  lines.push('');

  // Unlearned items — list in detail (these should be taught)
  if (unlearned.length > 0) {
    lines.push('📕 NOT YET LEARNED (prioritize teaching these):');
    const grouped = groupByType(unlearned);
    for (const [type, typeItems] of Object.entries(grouped)) {
      lines.push(`  ${typeLabel(type)}:`);
      // Show up to 8 items per type to keep context compact
      for (const item of typeItems.slice(0, 8)) {
        const detail = item.meaning ? ` — ${item.meaning}` : '';
        lines.push(`    • ${item.title}${detail}`);
      }
      if (typeItems.length > 8) {
        lines.push(`    ... and ${typeItems.length - 8} more`);
      }
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

  return lines.join('\n');
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
 * Build a review context block listing due flashcards and weak items
 * for the tutor to naturally weave into conversation.
 */
export async function getReviewContext(): Promise<string> {
  const db = getDatabase();

  // 1) Get due flashcards (up to 5)
  const now = new Date().toISOString();
  const dueResult = await db.execute(
    `SELECT front, back, card_type FROM cards
     WHERE due IS NULL OR due <= ?
     ORDER BY due ASC
     LIMIT 5`,
    [now]
  );

  // 2) Get weak curriculum items (mastery < 0.35, with at least 1 attempt)
  const weakResult = await db.execute(
    `SELECT cn.title, cn.type, up.mastery_score
     FROM user_progress up
     JOIN curriculum_nodes cn ON up.node_id = cn.node_id
     WHERE up.mastery_score < 0.35 AND up.attempts > 0
     ORDER BY up.mastery_score ASC
     LIMIT 5`
  );

  const dueCards = (dueResult.rows as any[]) || [];
  const weakItems = (weakResult.rows as any[]) || [];

  if (dueCards.length === 0 && weakItems.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('=== ITEMS DUE FOR REVIEW ===');
  lines.push('When appropriate, weave a review of these items into the conversation naturally.');
  lines.push('For example, create a sentence that uses them and ask the student about it.');
  lines.push('');

  if (dueCards.length > 0) {
    lines.push('📋 Flashcards due:');
    for (const card of dueCards) {
      lines.push(`  • ${card.front} → ${card.back} (${card.card_type})`);
    }
    lines.push('');
  }

  if (weakItems.length > 0) {
    lines.push('⚠️ Weak items (low mastery):');
    for (const item of weakItems) {
      const pct = Math.round((item.mastery_score as number) * 100);
      lines.push(`  • ${item.title} (${item.type}, ${pct}% mastery)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
