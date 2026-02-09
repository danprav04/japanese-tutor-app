/**
 * Bayesian Knowledge Tracing (BKT) Algorithm
 * 
 * BKT models learner knowledge as a latent variable using a Hidden Markov Model.
 * It tracks the probability that a student has "learned" a skill based on their
 * performance history, accounting for guessing and slipping.
 */

export interface BKTParams {
  /** Probability of learning after a practice opportunity */
  p_transit: number;
  /** Probability of guessing correctly without knowing */
  p_guess: number;
  /** Probability of making an error despite knowing */
  p_slip: number;
}

export interface BKTState {
  /** Current probability of mastery (0-1) */
  mastery_score: number;
  /** BKT parameters for this skill */
  params: BKTParams;
  /** Total number of attempts */
  attempts: number;
  /** Number of correct answers */
  correct_count: number;
}

/** Default BKT parameters based on research literature */
export const DEFAULT_BKT_PARAMS: BKTParams = {
  p_transit: 0.1,   // 10% chance of learning per attempt
  p_guess: 0.25,    // 25% chance of lucky guess
  p_slip: 0.1,      // 10% chance of careless error
};

/** Mastery threshold - above this, the skill is considered "learned" */
export const MASTERY_THRESHOLD = 0.95;

/**
 * Update the mastery probability based on a new observation
 * 
 * @param prior - Current P(L), probability the skill is learned
 * @param isCorrect - Whether the student answered correctly
 * @param params - BKT parameters for this skill
 * @returns New P(L) after observing the response
 */
export function updateMastery(
  prior: number,
  isCorrect: boolean,
  params: BKTParams
): number {
  let likelihood: number;

  if (isCorrect) {
    // Bayes' theorem: P(L|correct) = P(L) * P(correct|L) / P(correct)
    // P(correct|L) = 1 - p_slip (knows it and doesn't slip)
    // P(correct|¬L) = p_guess (doesn't know but guesses right)
    const numerator = prior * (1 - params.p_slip);
    const denominator = numerator + (1 - prior) * params.p_guess;
    likelihood = numerator / denominator;
  } else {
    // P(L|incorrect) = P(L) * P(incorrect|L) / P(incorrect)
    // P(incorrect|L) = p_slip (knows it but slips)
    // P(incorrect|¬L) = 1 - p_guess (doesn't know and doesn't guess right)
    const numerator = prior * params.p_slip;
    const denominator = numerator + (1 - prior) * (1 - params.p_guess);
    likelihood = numerator / denominator;
  }

  // Apply learning transition: even if not learned, there's a chance they learned it now
  // P(L_new) = P(L|observation) + P(¬L|observation) * P(transit)
  const updatedMastery = likelihood + (1 - likelihood) * params.p_transit;

  // Clamp to valid probability range
  return Math.max(0.001, Math.min(0.999, updatedMastery));
}

/**
 * Check if a skill has reached mastery threshold
 */
export function isMastered(masteryScore: number): boolean {
  return masteryScore >= MASTERY_THRESHOLD;
}

/**
 * Calculate the expected number of attempts to reach mastery
 * given current state (useful for progress estimation)
 */
export function estimateAttemptsToMastery(
  currentMastery: number,
  params: BKTParams = DEFAULT_BKT_PARAMS
): number {
  if (isMastered(currentMastery)) return 0;

  // Simulate average progression
  let mastery = currentMastery;
  let attempts = 0;
  const maxAttempts = 100;

  while (!isMastered(mastery) && attempts < maxAttempts) {
    // Assume 70% correct rate for estimation
    mastery = updateMastery(mastery, true, params);
    attempts++;
  }

  return attempts;
}

/**
 * Create initial BKT state for a new skill
 */
export function createInitialState(
  initialMastery: number = 0.1,
  params: BKTParams = DEFAULT_BKT_PARAMS
): BKTState {
  return {
    mastery_score: initialMastery,
    params,
    attempts: 0,
    correct_count: 0,
  };
}

/**
 * Process an answer and return updated state
 */
export function processAnswer(
  state: BKTState,
  isCorrect: boolean
): BKTState {
  const newMastery = updateMastery(state.mastery_score, isCorrect, state.params);

  return {
    ...state,
    mastery_score: newMastery,
    attempts: state.attempts + 1,
    correct_count: state.correct_count + (isCorrect ? 1 : 0),
  };
}
