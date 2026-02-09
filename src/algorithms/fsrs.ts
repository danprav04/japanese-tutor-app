/**
 * FSRS (Free Spaced Repetition Scheduler) Integration
 * Wrapper around ts-fsrs for flashcard scheduling
 */

import { FSRS, Rating, State, createEmptyCard, fsrs } from 'ts-fsrs';

// Initialize FSRS with default parameters
const fsrsInstance: FSRS = fsrs();

export { Rating, State };

// Valid ratings for review (excludes Rating.Manual which isn't used for scheduling)
export type ReviewRating = Exclude<Rating, Rating.Manual>;

export interface CardData {
  card_id: string;
  node_id: string | null;
  front: string;
  back: string;
  card_type: 'vocab' | 'grammar' | 'kanji';
  // FSRS fields
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: Date | undefined;
}

/**
 * Create a new flashcard with FSRS scheduling
 */
export function createCard(
  cardId: string,
  nodeId: string | null,
  front: string,
  back: string,
  cardType: 'vocab' | 'grammar' | 'kanji'
): CardData {
  const emptyCard = createEmptyCard();

  return {
    card_id: cardId,
    node_id: nodeId,
    front,
    back,
    card_type: cardType,
    due: emptyCard.due,
    stability: emptyCard.stability,
    difficulty: emptyCard.difficulty,
    elapsed_days: emptyCard.elapsed_days,
    scheduled_days: emptyCard.scheduled_days,
    reps: emptyCard.reps,
    lapses: emptyCard.lapses,
    state: emptyCard.state,
    last_review: undefined,
  };
}

export interface SchedulingOption {
  due: Date;
  stability: number;
  difficulty: number;
  interval: number;
}

/**
 * Review a card and get the updated scheduling
 */
export function reviewCard(
  card: CardData,
  rating: ReviewRating,
  now: Date = new Date()
): { updatedCard: CardData; interval: number } {
  // Create FSRS-compatible card object
  const fsrsCard = createEmptyCard(now);
  fsrsCard.stability = card.stability;
  fsrsCard.difficulty = card.difficulty;
  fsrsCard.elapsed_days = card.elapsed_days;
  fsrsCard.scheduled_days = card.scheduled_days;
  fsrsCard.reps = card.reps;
  fsrsCard.lapses = card.lapses;
  fsrsCard.state = card.state;
  if (card.last_review) {
    fsrsCard.last_review = card.last_review;
  }

  const result = fsrsInstance.repeat(fsrsCard, now);
  const record = result[rating];
  const newCard = record.card;
  const interval = Math.round((newCard.due.getTime() - now.getTime()) / 60000);

  return {
    updatedCard: {
      ...card,
      due: newCard.due,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      elapsed_days: newCard.elapsed_days,
      scheduled_days: newCard.scheduled_days,
      reps: newCard.reps,
      lapses: newCard.lapses,
      state: newCard.state,
      last_review: now,
    },
    interval,
  };
}

/**
 * Get scheduling options for user ratings
 */
export function getSchedulingOptions(
  card: CardData,
  now: Date = new Date()
): { again: SchedulingOption; hard: SchedulingOption; good: SchedulingOption; easy: SchedulingOption } {
  const result1 = reviewCard(card, Rating.Again, now);
  const result2 = reviewCard(card, Rating.Hard, now);
  const result3 = reviewCard(card, Rating.Good, now);
  const result4 = reviewCard(card, Rating.Easy, now);

  return {
    again: {
      due: result1.updatedCard.due,
      stability: result1.updatedCard.stability,
      difficulty: result1.updatedCard.difficulty,
      interval: result1.interval,
    },
    hard: {
      due: result2.updatedCard.due,
      stability: result2.updatedCard.stability,
      difficulty: result2.updatedCard.difficulty,
      interval: result2.interval,
    },
    good: {
      due: result3.updatedCard.due,
      stability: result3.updatedCard.stability,
      difficulty: result3.updatedCard.difficulty,
      interval: result3.interval,
    },
    easy: {
      due: result4.updatedCard.due,
      stability: result4.updatedCard.stability,
      difficulty: result4.updatedCard.difficulty,
      interval: result4.interval,
    },
  };
}

/**
 * Format interval for display (e.g., "10m", "1d", "2w")
 */
export function formatInterval(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  } else if (minutes < 60 * 24) {
    return `${Math.round(minutes / 60)}h`;
  } else if (minutes < 60 * 24 * 7) {
    return `${Math.round(minutes / (60 * 24))}d`;
  } else if (minutes < 60 * 24 * 30) {
    return `${Math.round(minutes / (60 * 24 * 7))}w`;
  } else {
    return `${Math.round(minutes / (60 * 24 * 30))}mo`;
  }
}

/**
 * Check if a card is due for review
 */
export function isDue(card: CardData, now: Date = new Date()): boolean {
  return new Date(card.due) <= now;
}

/**
 * Get cards due for review, sorted by due date
 */
export function filterDueCards(cards: CardData[], now: Date = new Date()): CardData[] {
  return cards
    .filter(card => isDue(card, now))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
}
