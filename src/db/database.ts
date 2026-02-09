/**
 * Database initialization and management for Japanese Tutor App
 * Uses op-sqlite for high-performance SQLite operations
 */

import { open, type DB } from '@op-engineering/op-sqlite';

let db: DB | null = null;

/**
 * Initialize the database and run schema migrations
 */
export async function initDatabase(): Promise<DB> {
  if (db) return db;

  db = open({
    name: 'japanese_tutor.db',
    location: 'default',
  });

  // Run schema creation
  await runMigrations(db);

  console.log('✅ Database initialized');
  return db;
}

/**
 * Get the database instance (throws if not initialized)
 */
export function getDatabase(): DB {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Run database migrations/schema creation
 */
async function runMigrations(database: DB): Promise<void> {
  // Curriculum nodes
  database.execute(`
    CREATE TABLE IF NOT EXISTS curriculum_nodes (
      node_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT CHECK(type IN ('grammar', 'vocab', 'kanji')) NOT NULL,
      jlpt_level INTEGER CHECK(jlpt_level BETWEEN 1 AND 5),
      content_payload TEXT,
      source_file TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Node dependencies
  database.execute(`
    CREATE TABLE IF NOT EXISTS node_dependencies (
      parent_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      dependency_type TEXT DEFAULT 'strict',
      PRIMARY KEY (parent_id, child_id),
      FOREIGN KEY (parent_id) REFERENCES curriculum_nodes(node_id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES curriculum_nodes(node_id) ON DELETE CASCADE
    )
  `);

  // User progress (BKT)
  database.execute(`
    CREATE TABLE IF NOT EXISTS user_progress (
      node_id TEXT PRIMARY KEY,
      mastery_score REAL DEFAULT 0.1,
      p_transit REAL DEFAULT 0.1,
      p_guess REAL DEFAULT 0.25,
      p_slip REAL DEFAULT 0.1,
      attempts INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      last_reviewed TEXT,
      unlocked INTEGER DEFAULT 0,
      FOREIGN KEY (node_id) REFERENCES curriculum_nodes(node_id) ON DELETE CASCADE
    )
  `);

  // FSRS Cards
  database.execute(`
    CREATE TABLE IF NOT EXISTS cards (
      card_id TEXT PRIMARY KEY,
      node_id TEXT,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      card_type TEXT CHECK(card_type IN ('vocab', 'grammar', 'kanji')),
      due TEXT,
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      elapsed_days INTEGER DEFAULT 0,
      scheduled_days INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      state INTEGER DEFAULT 0,
      last_review TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (node_id) REFERENCES curriculum_nodes(node_id) ON DELETE SET NULL
    )
  `);

  // Review logs
  database.execute(`
    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      rating INTEGER CHECK(rating BETWEEN 1 AND 4),
      review_time TEXT DEFAULT (datetime('now')),
      elapsed_days INTEGER,
      scheduled_days INTEGER,
      state INTEGER,
      FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
    )
  `);

  // Documents for RAG
  database.execute(`
    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_type TEXT,
      processed INTEGER DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.execute(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      content_text TEXT NOT NULL,
      page_number INTEGER,
      chunk_index INTEGER,
      FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
    )
  `);

  // LangGraph checkpoints
  database.execute(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      thread_id TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      parent_checkpoint_id TEXT,
      checkpoint_data TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (thread_id, checkpoint_id)
    )
  `);

  // App settings
  database.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Insert default settings
  database.execute(`
    INSERT OR IGNORE INTO app_settings (key, value) VALUES
      ('selected_model', 'gemini-3-flash'),
      ('total_donated', '0'),
      ('study_streak', '0'),
      ('last_study_date', '')
  `);

  // Create indices
  database.execute(`CREATE INDEX IF NOT EXISTS idx_dependencies_child ON node_dependencies(child_id)`);
  database.execute(`CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due)`);
  database.execute(`CREATE INDEX IF NOT EXISTS idx_cards_node ON cards(node_id)`);
  database.execute(`CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id)`);
  database.execute(`CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON checkpoints(thread_id, created_at DESC)`);
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
