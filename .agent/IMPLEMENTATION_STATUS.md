# Gap Analysis: App Idea vs. Current Implementation

This checklist compares the architectural vision in "Building an AI Japanese Tutor" with the current codebase.

## 1. Pedagogical Architecture

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Bayesian Knowledge Tracing (BKT)** | ✅ Implemented | `user_progress` table tracks mastery, guess, slip, and transition probabilities. |
| **Spaced Repetition (SRS)** | ✅ Implemented | `cards` table and `ts-fsrs` library are used for flashcard scheduling. |
| **Zone of Proximal Development (ZPD)** | ⚠️ Partial | The "Document Learning" mode highlights "Next Item to Teach", which serves this purpose, but it's not a global "Curriculum Architect" agent. |
| **Contextual SRS** | ✅ Implemented | System prompt now mandates proactive injection of due review items into every response. `getReviewContext()` feeds due cards and weak items. |

## 2. System Orchestration

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **LangGraph (State Machine)** | ❌ Missing | Implemented as a custom SQLite-based checkpointer + Single Prompt Loop. No explicit graph state machine. |
| **Multi-Agent Architecture** | 🔄 Adapted | Single agent with Chain-of-Thought `[THINK]` blocks simulating Analyst role: diagnoses errors, selects feedback type, plans review integration. |
| **Persistence** | ✅ Implemented | Custom SQLite `checkpoints` table persists conversation state effectively. |

## 3. Knowledge Representation

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **GraphRAG / Neo4j** | 🔄 Adapted | Replaced with SQLite `curriculum_nodes` + `node_dependencies`. "Graph" logic exists in SQL via recursive queries (`curriculum-service.ts`). This is a **good decision** for a local-first app. |
| **Vector Search (RAG)** | ⚠️ Partial | `sqlite-vec` mentioned in schema comments but not fully active/visible in `document-service.ts` logic (logic uses metadata filtering `source_file=?`). |
| **Curriculum Ingestion** | ✅ Implemented | `document-service.ts` extracts JSON from files and populates the database. |

## 4. Tools & MCP (Model Context Protocol)

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Jisho / Dictionary Tool** | ✅ Implemented | `jisho-service.ts` wraps the public Jisho API for ground-truth definitions. Integrated into `sendMessage()` via `detectDictionaryQuery()`. |
| **Anki Integration** | 🔄 Internalized | Built-in Flashcard system (`cards` table) replaces external Anki integration. |
| **Morphological Analyzer (Sudachi)** | ❌ Missing | No NLP library. Relies on Gemini to parse/tokenize text. |
| **Pitch Accent Visualization** | ⚠️ Partial | Text-based H/L pitch accent patterns in tutor responses and flashcards. No audio/SVG visualization. |

## 5. User Interface & Experience

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Chat Interface** | ✅ Implemented | Using `react-native-gifted-chat`. |
| **Flashcard UI** | ✅ Implemented | Flashcards are rendered in chat. |
| **Document Learning Mode** | ✅ Implemented | User can ask to learn specific documents (implemented). |
| **Onboarding** | ✅ Implemented | Onboarding screen exists. |

## Recommendations for Next Steps

1.  **SVG Pitch Accent Visualization**: Upgrade from text H/L patterns to visual pitch graphs using `react-native-svg`.
2.  **Vector Search**: Enable the vectors for document chunks to allow asking "What does the document say about X?" beyond just structured curriculum learning.
3.  **Full Multi-Agent**: Split the single agent into separate orchestrator + specialist agents for deeper pedagogical reasoning.
4.  **Monetization**: Integrate RevenueCat for donations and ad-free experience.
