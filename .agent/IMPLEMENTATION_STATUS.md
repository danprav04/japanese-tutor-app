# Gap Analysis: App Idea vs. Current Implementation

This checklist compares the architectural vision in "Building an AI Japanese Tutor" with the current codebase.

## 1. Pedagogical Architecture

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Bayesian Knowledge Tracing (BKT)** | ✅ Implemented | `user_progress` table tracks mastery, guess, slip, and transition probabilities. |
| **Spaced Repetition (SRS)** | ✅ Implemented | `cards` table and `ts-fsrs` library are used for flashcard scheduling. |
| **Zone of Proximal Development (ZPD)** | ⚠️ Partial | The "Document Learning" mode highlights "Next Item to Teach", which serves this purpose, but it's not a global "Curriculum Architect" agent. |
| **Contextual SRS** | ❌ Missing | The agent teaches *new* items or reviews based on user prompts, but doesn't proactively inject *old* vocab into conversation just for review (it's responsive, not proactive). |

## 2. System Orchestration

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **LangGraph (State Machine)** | ❌ Missing | Implemented as a custom SQLite-based checkpointer + Single Prompt Loop. No explicit graph state machine. |
| **Multi-Agent Architecture** | ❌ Missing | Single `tutor-agent.ts` handles everything via System Prompt. No separate "Analyst" or "Architect". |
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
| **Jisho / Dictionary Tool** | ❌ Missing | Relies on Gemini's internal knowledge. No external specific dictionary tool. |
| **Anki Integration** | 🔄 Internalized | Built-in Flashcard system (`cards` table) replaces external Anki integration. |
| **Morphological Analyzer (Sudachi)** | ❌ Missing | No NLP library. Relies on Gemini to parse/tokenize text. |
| **Pitch Accent Visualization** | ❌ Missing | No `Onsei` or audio analysis tools implemented. |

## 5. User Interface & Experience

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Chat Interface** | ✅ Implemented | Using `react-native-gifted-chat`. |
| **Flashcard UI** | ✅ Implemented | Flashcards are rendered in chat. |
| **Document Learning Mode** | ✅ Implemented | User can ask to learn specific documents (implemented). |
| **Onboarding** | ✅ Implemented | Onboarding screen exists. |

## Recommendations for Next Steps

1.  **Enhance ZPD/Contextual SRS**: Modify `tutor-agent.ts` to fetch "Stale/Due" cards from `card-service` and inject them into the System Prompt as "Keywords to use in this conversation".
2.  **Visual Pitch Accent**: This is a "Wow" factor. Since local Python isn't an option, use a lightweight JS library or simply ask Gemini to generate "Pitch Pattern: L-H-H-L" text representations.
3.  **Refine Multi-Agent Simulation**: Even without LangGraph, you can split the System Prompt into "Phases" (Thought -> Analysis -> Response) to mimic the "Analyst" role, improving correction quality.
4.  **Vector Search**: Enable the vectors for document chunks to allow asking "What does the document say about X?" beyond just structured curriculum learning.
