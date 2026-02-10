/**
 * Seed Service
 *
 * Seeds the starter N5 curriculum into the database on first launch.
 * Checks the `app_settings` table for a `curriculum_seeded` flag to
 * avoid re-seeding on subsequent launches.
 */

import { getDatabase } from '../db/database';
import { STARTER_CURRICULUM } from '../data/starter-curriculum';
import { addNode } from './curriculum-service';
import { createFlashcard } from './card-service';
import { initializeProgress } from './progress-service';

/**
 * Seed the starter curriculum if not already done.
 */
export async function seedStarterCurriculum(): Promise<void> {
  const db = getDatabase();

  // Check if already seeded
  const result = await db.execute(
    `SELECT value FROM app_settings WHERE key = 'curriculum_seeded'`
  );

  if (result.rows && result.rows.length > 0) {
    const row = result.rows[0] as Record<string, unknown>;
    if (row.value === '1') {
      console.log('✅ Curriculum already seeded, skipping.');
      return;
    }
  }

  console.log('🌱 Seeding starter N5 curriculum...');

  let seededCount = 0;

  for (const item of STARTER_CURRICULUM) {
    try {
      // 1. Add curriculum node
      const node = await addNode(
        item.title,
        item.type,
        item.jlptLevel,
        item.content as Record<string, unknown>,
      );

      // 2. Create a flashcard from this node
      let front: string;
      let back: string;

      if (item.type === 'kanji') {
        front = item.title;
        back = `${item.content.meaning}\n${item.content.onyomi ?? ''} / ${item.content.kunyomi ?? ''}`;
      } else if (item.type === 'vocab') {
        front = item.title;
        back = `${item.content.meaning}${item.content.reading ? '\n(' + item.content.reading + ')' : ''}`;
      } else {
        // grammar
        front = item.title;
        back = `${item.content.meaning}\n${item.content.example ?? ''}`;
      }

      await createFlashcard(front, back, item.type, node.nodeId);

      // 3. Initialize BKT progress (unlocked for N5 starters)
      await initializeProgress(node.nodeId, true);

      seededCount++;
    } catch (err) {
      console.warn(`Failed to seed item "${item.title}":`, err);
    }
  }

  // Mark as seeded
  await db.execute(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('curriculum_seeded', '1')`
  );

  console.log(`🌱 Seeded ${seededCount} curriculum items.`);
}
