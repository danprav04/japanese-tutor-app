---
name: pedagogical_algorithms
description: Implementation details for Bayesian Knowledge Tracing (BKT) and Free Spaced Repetition Scheduler (FSRS) in the Japanese Tutor app.
---

# Pedagogical Algorithms

## Bayesian Knowledge Tracing (BKT)
BKT is a Hidden Markov Model that infers true mastery by accounting for guessing and slipping.

### Implementation
File: `src/algorithms/bkt.ts`

#### Parameters (per skill)
| Parameter | Default | Description |
|-----------|---------|-------------|
| `p_transit` | 0.10 | Probability of learning during one attempt |
| `p_guess` | 0.25 | Probability of correct guess without knowledge |
| `p_slip` | 0.10 | Probability of error despite knowledge |

#### Core Formula
```typescript
// Bayesian update
if (isCorrect) {
  numerator = prior * (1 - p_slip);
  denominator = numerator + (1 - prior) * p_guess;
} else {
  numerator = prior * p_slip;
  denominator = numerator + (1 - prior) * (1 - p_guess);
}
likelihood = numerator / denominator;

// Learning transition
updatedMastery = likelihood + (1 - likelihood) * p_transit;

// Clamp to [0.001, 0.999]
```

#### Mastery Threshold
A node is "mastered" when `mastery_score >= 0.95`.

### Database Integration
File: `src/services/progress-service.ts`

- `recordAnswer(nodeId, isCorrect)` → runs BKT update and persists to `user_progress` table
- `getProgress(nodeId)` → reads current BKT state from database
- `getOverallMastery()` → aggregate mastery across all tracked nodes
- `getCategoryProgress()` → mastery grouped by type + JLPT level

### Prerequisite Unlocking
When a node reaches mastery:
1. Query `node_dependencies` for all children of the mastered node
2. For each child, check if ALL parent nodes are also mastered
3. If yes → set `unlocked = 1` in `user_progress`

## Free Spaced Repetition Scheduler (FSRS)
FSRS determines *when* to review content to optimize long-term retention.

### Implementation
File: `src/algorithms/fsrs.ts` (wraps `ts-fsrs` library)

#### Key Types
```typescript
// Valid review ratings (excludes Rating.Manual)
export type ReviewRating = Exclude<Rating, Rating.Manual>;

// Card state enum from ts-fsrs
// State.New = 0, State.Learning = 1, State.Review = 2, State.Relearning = 3
```

#### Card Lifecycle
1. **New** → first review → enters Learning
2. **Learning** → Good/Easy → enters Review (scheduled days out)
3. **Review** → Again → enters Relearning
4. **Relearning** → Good → back to Review

#### FSRS Parameters (per card)
| Field | Description |
|-------|-------------|
| `stability` | Days until retrievability drops to 90% |
| `difficulty` | Item complexity (0–1 scale) |
| `due` | Next review date (ISO string in DB) |
| `elapsed_days` | Days since last review |
| `scheduled_days` | Days the card was scheduled for |
| `reps` | Total review count |
| `lapses` | Number of times forgotten (rated Again) |

### Database Integration
File: `src/services/card-service.ts`

- `getDueCards(limit)` → cards where `due IS NULL OR due <= now`
- `reviewCardAndPersist(cardId, rating)` → runs FSRS scheduler, updates DB, logs review
- `getCardSchedulingPreview(cardId)` → shows next intervals for each rating
- `createFlashcard(front, back, cardType, nodeId?)` → inserts new card
- `getCardStats()` → aggregate counts by state

### Interval Display
```typescript
formatInterval(minutes): string
// < 60 → "10m"
// < 1440 → "6h"
// < 10080 → "3d"
// < 43200 → "2w"
// else → "1mo"
```

## Dual Algorithm Strategy: BKT + FSRS
BKT and FSRS serve complementary purposes:

| Aspect | BKT | FSRS |
|--------|-----|------|
| **Question** | "Does the student *know* this?" | "When should they *review* this?" |
| **Scope** | Curriculum nodes (skills) | Individual flashcards |
| **Updates on** | Any answer (chat, quiz, review) | Card review only |
| **Drives** | Prerequisite unlocking | Review scheduling |

### Linkage
Cards have an optional `node_id` FK to `curriculum_nodes`:
- When a linked card is reviewed, the flashcard screen also calls `recordAnswer()` to update BKT
- Rating → BKT mapping: `Good`/`Easy` = correct, `Again`/`Hard` = incorrect

## Socratic Tutoring Strategy
The tutor agent follows a pedagogical policy for feedback:
1. **Diagnose**: Identify the specific error (wrong conjugation, wrong particle, etc.)
2. **Scaffold**: Provide a hint to narrow the search space
3. **Prompt**: Ask a guiding question — never give the answer immediately

### Feedback Types
- **Recast**: For minor slips — rephrase correctly without explicit correction
- **Metalinguistic clue**: For structural errors — "Think about which particle marks the direction..."
- **Explicit correction**: Only after 2+ failed attempts at the same error
