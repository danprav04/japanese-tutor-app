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

  let isSeeded = false;
  if (result.rows && result.rows.length > 0) {
    const row = result.rows[0] as Record<string, unknown>;
    if (row.value === '1') {
      isSeeded = true;
    }
  }

  if (!isSeeded) {
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
          'Initial Set'
        );

        // Initialize BKT progress (unlocked for N5 starters)
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
  } else {
    console.log('✅ Curriculum already seeded.');
  }

  // Backfill migration: Ensure legacy items have a source
  const migrationResult = await db.execute(
    `SELECT value FROM app_settings WHERE key = 'source_backfill_v1'`
  );
  
  const isMigrated = migrationResult.rows && migrationResult.rows.length > 0 && (migrationResult.rows[0] as any).value === '1';

  if (!isMigrated) {
    console.log('🔄 Backfilling source_file for legacy items...');
    await db.execute(
      `UPDATE curriculum_nodes SET source_file = 'Initial Set' WHERE source_file IS NULL`
    );
     await db.execute(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('source_backfill_v1', '1')`
    );
    console.log('✅ Backfill complete.');
  }
}
