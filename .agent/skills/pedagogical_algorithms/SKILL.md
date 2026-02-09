---
name: pedagogical_algorithms
description: Implementation details for Bayesian Knowledge Tracing (BKT) and Free Spaced Repetition Scheduler (FSRS) in the Japanese Tutor app.
---

# Pedagogical Algorithms

## Bayesian Knowledge Tracing (BKT)
BKT is a Hidden Markov Model used to infer true mastery by accounting for "guess" and "slip" probabilities.

### Parameters
- `prior` (P(L0)): Initial probability of knowledge.
- `p_transit`: Likelihood of learning during an exercise.
- `p_guess`: Probability of correctly guessing despite not knowing.
- `p_slip`: Probability of an error despite knowing.

### Mastery Threshold
A probability > 0.95 is required to consider a node "Mastered."

### Implementation (TypeScript)
```typescript
export const updateMastery = (
  prior: number,
  isCorrect: boolean,
  params: { p_transit: number; p_guess: number; p_slip: number }
): number => {
  let likelihood: number;
  if (isCorrect) {
    const num = prior * (1 - params.p_slip);
    const denom = num + (1 - prior) * params.p_guess;
    likelihood = num / denom;
  } else {
    const num = prior * params.p_slip;
    const denom = num + (1 - prior) * (1 - params.p_guess);
    likelihood = num / denom;
  }
  return likelihood + (1 - likelihood) * params.p_transit;
};
```

## Free Spaced Repetition Scheduler (FSRS)
Determines *when* to review content to optimize memory retention.

### Key Concepts
- **Stability**: How long until memory decays.
- **Difficulty**: Complexity of the item.
- **Ratings**: Again, Hard, Good, Easy.

### Integration
Use the `ts-fsrs` library.
1. Store FSRS parameters (Stability, Difficulty, Due Date) in SQLite.
2. Select cards where `due_date <= NOW()`.
3. Update parameters after each review using `ts-fsrs` logic.

## Usage Strategy
## Socratic Tutoring Strategy
The agent should follow a "Pedagogical Policy" for feedback:
1. **Diagnose**: Identify the error.
2. **Scaffold**: Provide a hint to narrow the search space.
3. **Prompt**: Ask a guiding question (Metalinguistic Clue or Recast).

**Explicit Goal**: Never give the answer immediately. Use recasts for minor slips to maintain flow, and metalinguistic clues for structural logic failures.
