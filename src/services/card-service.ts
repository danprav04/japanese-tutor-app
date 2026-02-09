/**
 * Card Service
 * 
 * Manages FSRS flashcards — CRUD operations, scheduling,
 * and review persistence using op-sqlite.
 */

import { getDatabase } from '../db/database';
import {
  type CardData,
  type ReviewRating,
  reviewCard,
  getSchedulingOptions,
  formatInterval,
  State,
} from '../algorithms/fsrs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hydrate a CardData object from a database row
 */
function rowToCard(row: Record<string, unknown>): CardData {
  return {
    card_id: row.card_id as string,
    node_id: (row.node_id as string) ?? null,
    front: row.front as string,
    back: row.back as string,
    card_type: row.card_type as 'vocab' | 'grammar' | 'kanji',
    due: row.due ? new Date(row.due as string) : new Date(),
    stability: (row.stability as number) ?? 0,
    difficulty: (row.difficulty as number) ?? 0,
    elapsed_days: (row.elapsed_days as number) ?? 0,
    scheduled_days: (row.scheduled_days as number) ?? 0,
    reps: (row.reps as number) ?? 0,
    lapses: (row.lapses as number) ?? 0,
    state: (row.state as State) ?? State.New,
    last_review: row.last_review ? new Date(row.last_review as string) : undefined,
  };
}

/**
 * Persist a CardData object back to the database
 */
function persistCard(card: CardData): void {
  const db = getDatabase();
  db.execute(
    `UPDATE cards SET
       due = ?, stability = ?, difficulty = ?,
       elapsed_days = ?, scheduled_days = ?,
       reps = ?, lapses = ?, state = ?, last_review = ?
     WHERE card_id = ?`,
    [
      card.due.toISOString(),
      card.stability,
      card.difficulty,
      card.elapsed_days,
      card.scheduled_days,
      card.reps,
      card.lapses,
      card.state,
      card.last_review ? card.last_review.toISOString() : null,
      card.card_id,
    ]
  );
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get cards that are due for review, limited to `limit` cards.
 */
export function getDueCards(limit: number = 20): CardData[] {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.execute(
    `SELECT * FROM cards
     WHERE due IS NULL OR due <= ?
     ORDER BY due ASC
     LIMIT ?`,
    [now, limit]
  );

  if (!result.rows) return [];
  return result.rows.map(rowToCard);
}

/**
 * Review a card with the given rating and persist the updated state.
 */
export function reviewCardAndPersist(cardId: string, rating: ReviewRating): void {
  const db = getDatabase();
  const result = db.execute(`SELECT * FROM cards WHERE card_id = ?`, [cardId]);

  if (!result.rows || result.rows.length === 0) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const card = rowToCard(result.rows[0]);
  const now = new Date();
  const { updatedCard, interval } = reviewCard(card, rating, now);

  // Persist updated FSRS state
  persistCard(updatedCard);

  // Log the review
  db.execute(
    `INSERT INTO review_logs (card_id, rating, elapsed_days, scheduled_days, state)
     VALUES (?, ?, ?, ?, ?)`,
    [cardId, rating, updatedCard.elapsed_days, updatedCard.scheduled_days, updatedCard.state]
  );
}

/**
 * Get a scheduling preview for a card (shows next review intervals for each rating).
 */
export function getCardSchedulingPreview(
  cardId: string
): { again: string; hard: string; good: string; easy: string } {
  const db = getDatabase();
  const result = db.execute(`SELECT * FROM cards WHERE card_id = ?`, [cardId]);

  if (!result.rows || result.rows.length === 0) {
    return { again: '?', hard: '?', good: '?', easy: '?' };
  }

  const card = rowToCard(result.rows[0]);
  const options = getSchedulingOptions(card);

  return {
    again: formatInterval(options.again.interval),
    hard: formatInterval(options.hard.interval),
    good: formatInterval(options.good.interval),
    easy: formatInterval(options.easy.interval),
  };
}

/**
 * Get aggregate card statistics.
 */
export function getCardStats(): {
  total: number;
  newCards: number;
  learning: number;
  reviewing: number;
  dueNow: number;
} {
  const db = getDatabase();
  const now = new Date().toISOString();

  const totalResult = db.execute(`SELECT COUNT(*) as count FROM cards`);
  const total = (totalResult.rows?.[0]?.count as number) ?? 0;

  const newResult = db.execute(`SELECT COUNT(*) as count FROM cards WHERE state = ?`, [State.New]);
  const newCards = (newResult.rows?.[0]?.count as number) ?? 0;

  const learningResult = db.execute(`SELECT COUNT(*) as count FROM cards WHERE state = ?`, [State.Learning]);
  const learning = (learningResult.rows?.[0]?.count as number) ?? 0;

  const reviewResult = db.execute(`SELECT COUNT(*) as count FROM cards WHERE state = ?`, [State.Review]);
  const reviewing = (reviewResult.rows?.[0]?.count as number) ?? 0;

  const dueResult = db.execute(
    `SELECT COUNT(*) as count FROM cards WHERE due IS NULL OR due <= ?`,
    [now]
  );
  const dueNow = (dueResult.rows?.[0]?.count as number) ?? 0;

  return { total, newCards, learning, reviewing, dueNow };
}

/**
 * Create a new flashcard and persist it to the database.
 */
export function createFlashcard(
  front: string,
  back: string,
  cardType: 'vocab' | 'grammar' | 'kanji',
  nodeId?: string
): CardData {
  const db = getDatabase();
  const cardId = uuidv4();
  const now = new Date();

  db.execute(
    `INSERT INTO cards (card_id, node_id, front, back, card_type, due, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses, state)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0)`,
    [cardId, nodeId ?? null, front, back, cardType, now.toISOString()]
  );

  return {
    card_id: cardId,
    node_id: nodeId ?? null,
    front,
    back,
    card_type: cardType,
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    last_review: undefined,
  };
}
