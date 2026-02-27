-- Japanese Tutor App - Database Schema
-- Using SQLite with sqlite-vec extension for vector search

-- ============================================
-- CURRICULUM GRAPH
-- ============================================

-- Core curriculum nodes (vocabulary, grammar, kanji)
-- Nodes are lightweight topic references that point to source document chunks.
CREATE TABLE IF NOT EXISTS curriculum_nodes (
  node_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT CHECK(type IN ('grammar', 'vocab', 'kanji')) NOT NULL,
  jlpt_level INTEGER CHECK(jlpt_level BETWEEN 1 AND 5),
  summary TEXT, -- Brief AI-generated summary of the topic
  chunk_refs TEXT, -- JSON array of chunk_ids in document_chunks
  source_file TEXT, -- Original filename
  document_id TEXT, -- FK to source document
  sort_order INTEGER DEFAULT 0, -- Position in document's topic tree
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
);

-- Dependency graph between curriculum nodes
CREATE TABLE IF NOT EXISTS node_dependencies (
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'strict' CHECK(dependency_type IN ('strict', 'soft')),
  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES curriculum_nodes(node_id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES curriculum_nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX idx_dependencies_child ON node_dependencies(child_id);

-- ============================================
-- USER PROGRESS (BKT - Bayesian Knowledge Tracing)
-- ============================================

CREATE TABLE IF NOT EXISTS user_progress (
  node_id TEXT PRIMARY KEY,
  mastery_score REAL DEFAULT 0.1, -- P(L) probability of learned
  p_transit REAL DEFAULT 0.1, -- Learning transition probability
  p_guess REAL DEFAULT 0.25, -- Guess probability
  p_slip REAL DEFAULT 0.1, -- Slip probability
  attempts INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  last_reviewed TEXT,
  unlocked INTEGER DEFAULT 0,
  FOREIGN KEY (node_id) REFERENCES curriculum_nodes(node_id) ON DELETE CASCADE
);

-- ============================================
-- RAG DOCUMENT STORAGE
-- ============================================

-- Document metadata
CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_type TEXT,
  processed INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Document chunks with text content
CREATE TABLE IF NOT EXISTS document_chunks (
  chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  page_number INTEGER,
  chunk_index INTEGER,
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);

-- Vector embeddings (sqlite-vec virtual table)
-- This will be created dynamically when sqlite-vec is loaded:
-- CREATE VIRTUAL TABLE IF NOT EXISTS document_vectors USING vec0(
--   chunk_id INTEGER PRIMARY KEY,
--   embedding FLOAT[768]
-- );

-- ============================================
-- CONVERSATION MEMORY (LangGraph Checkpointer)
-- ============================================

CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint_data TEXT NOT NULL, -- JSON serialized graph state
  metadata TEXT, -- Additional metadata
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX idx_checkpoints_thread ON checkpoints(thread_id, created_at DESC);

-- ============================================
-- SETTINGS & APP STATE
-- ============================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('selected_model', 'qwen/qwen3-32b'),
  ('total_donated', '0'),
  ('study_streak', '0'),
  ('last_study_date', '');
