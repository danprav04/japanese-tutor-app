# Curriculum Learning Experience Evaluation
> Generated: 2026-03-26 | Model: llama-3.3-70b-versatile

## Executive Summary

| Metric | Value |
|--------|-------|
| Nodes tested | 57 of 62 |
| Pass rate | 17.5% (10/57) |
| Total violations | 55 |
| Guardrail blocks | 4 |
| Progress updates | 50 |

## Learning Experience Evaluation

### 1. Pedagogical Flow
- **Curriculum order compliance**: ⚠️ 46 wrong-topic violations
- **Vocab before grammar**: ⚠️ Some ordering issues

### 2. Explanation Quality
- **3+ examples provided**: ✅ Always met

### 3. Quiz Separation
- **Explanation/quiz separation**: ⚠️ 3 violations
  - Explain+Quiz in same msg: 3

### 4. Progress Tracking
- **Progress on answers**: ⚠️ 6 missing
- **No premature progress**: ✅ Clean
- **Guardrail blocks**: 4 (non-answers correctly blocked)
- **Total BKT updates**: 50

### 5. Answer Integrity
- **No self-answer hints (👉)**: ✅ Clean

## Detailed Results

| # | Node Title | Type | JLPT | Result | Violations | Mastery |
|---|-----------|------|------|--------|------------|---------|
| 1 | Expressing state-of-being | grammar | N5 | ✅ | — | 11.3% |
| 2 | Vocabulary for state-of-being | vocab | N5 | ✅ | — | 10.0% |
| 3 | Conjugating to the negative state-of-being | grammar | N5 | ✅ | — | 10.0% |
| 4 | Vocabulary for negative state-of-being | vocab | N5 | ✅ | — | 10.0% |
| 5 | Conjugating to the past state-of-being | grammar | N5 | ✅ | — | 10.0% |
| 6 | Vocabulary for past state-of-being | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 7 | Introduction to Particles | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 8 | Vocabulary for particles | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 9 | The 「は」 topic particle | grammar | N5 | ✅ | — | 10.0% |
| 11 | Vocabulary for inclusive topic particle | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 12 | The 「が」 identifier particle | grammar | N5 | ✅ | — | 10.0% |
| 13 | Vocabulary for identifier particle | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 14 | Adjectives | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 15 | Vocabulary for adjectives | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 16 | Using "すき" to describe likes and dislikes | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 17 | Vocabulary for likes and dislikes | vocab | N5 | ❌ | EXPLAIN_AND_QUIZ_SAME_MSG, WRONG_TOPIC | 10.0% |
| 18 | I-adjectives and conjugations | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 21 | Vocabulary for verbs | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 22 | Classifying verbs into ru-verbs and u-verbs | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 24 | Negative verbs | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 25 | Negative Form Conjugation | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 26 | Negative Form Conjugation Examples | vocab | N4 | ❌ | EXPLAIN_AND_QUIZ_SAME_MSG, WRONG_TOPIC | 10.0% |
| 27 | Past Tense Conjugation Introduction | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 29 | Past Tense for Ru-Verbs Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC, EXPLAIN_AND_QUIZ_SAME_MSG | 10.0% |
| 30 | Past Tense for U-Verbs | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 31 | Past Tense for U-Verbs Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 32 | Past-Negative Tense Conjugation | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 33 | Past-Negative Tense Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 34 | Direct Object よ Particle | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 35 | Direct Object よ Particle Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 36 | Target に Particle | grammar | N4 | ❌ | WRONG_TOPIC, MISSING_PROGRESS | 10.0% |
| 37 | Target に Particle Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 38 | Directional へ Particle | grammar | N4 | ✅ | — | 10.0% |
| 39 | Directional へ Particle Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC, MISSING_PROGRESS | 10.0% |
| 40 | Contextual で Particle | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 41 | Contextual で Particle Vocabulary | vocab | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 42 | Particle 「で」 as 'by way of' | grammar | N5 | ❌ | WRONG_TOPIC, MISSING_PROGRESS | 10.0% |
| 43 | 「何」 with 「で」 and colloquial 「なんで」 | grammar | N4 | ❌ | WRONG_TOPIC, MISSING_PROGRESS | 10.0% |
| 44 | Location as Topic with Particles 「は/も」 | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 45 | Direct Object as Topic (No 「を」 Particle) | grammar | N3 | ❌ | WRONG_TOPIC | 10.0% |
| 46 | Transitive vs. Intransitive Verbs | grammar | N3 | ❌ | WRONG_TOPIC | 10.0% |
| 47 | Relative Clauses as Adjectives | grammar | N2 | ❌ | WRONG_TOPIC | 10.0% |
| 48 | Japanese Sentence Order and Structure | grammar | N2 | ❌ | WRONG_TOPIC | 10.0% |
| 49 | Japanese Sentence Order | grammar | N3 | ✅ | — | 10.0% |
| 50 | Inclusive 「と」 Particle | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 51 | Vague Listing Particles 「や」 and 「とか」 | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 52 | Possessive/Modifier 「の」 Particle | grammar | N3 | ❌ | WRONG_TOPIC | 10.0% |
| 53 | Explanatory 「の/んだ」 Particle | grammar | N3 | ❌ | WRONG_TOPIC | 10.0% |
| 54 | Noun/Adj/Verb Particle Vocabulary | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 55 | Explanatory Sentence Structure Examples | grammar | N3 | ✅ | — | 10.0% |
| 56 | Adverbs Vocabulary List | vocab | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 57 | Adjective to Adverb Conversion Rules | grammar | N4 | ❌ | WRONG_TOPIC | 10.0% |
| 58 | Adverb Usage Examples | grammar | N4 | ❌ | WRONG_TOPIC, MISSING_PROGRESS | 10.0% |
| 59 | Sentence-Ending Particles Vocabulary | vocab | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 60 | 「ね」 Sentence-Ending Particle | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 61 | 「よ」 Sentence-Ending Particle | grammar | N5 | ❌ | WRONG_TOPIC | 10.0% |
| 62 | 「よね」 Combined Particle | grammar | N5 | ❌ | MISSING_PROGRESS | 10.0% |

## BKT Mastery Distribution

- Untouched (10%): 59 nodes
- Beginner (<30%): 1 nodes
- Learning (30-70%): 2 nodes
- Familiar (70-95%): 0 nodes
- Mastered (95%+): 0 nodes

## Conclusion

The AI tutor had **55 violation(s)** across 57 curriculum nodes (17.5% pass rate). The most common issue was **WRONG_TOPIC**. Review the detailed results above for specific areas needing improvement.