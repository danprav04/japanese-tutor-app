---
name: agentic_orchestration
description: Guidelines for LangGraph orchestration, Hermes engine compatibility, and supervisor-worker patterns in a mobile environment.
---

# Agentic Orchestration

## Framework: LangGraph
The system uses LangGraph to model interactions as state machines. This allows for persistent, cyclic workflows required for tutoring.

### State Persistence: SQLite Checkpointer
Since there is no Redis, implement a custom `SQLite Checkpointer` using `op-sqlite`. This serializes graph state into JSON for persistence across app restarts.

## Topology: Supervisor-Worker
- **Supervisor (Router)**: Central brain that manages the "Master Plan" and routes intent.
- **Socratic Tutor**: The interface persona. Uses Socratic questioning to guide, never gives answers immediately.
- **Curriculum Architect**: Queries graph for prerequisites and plans the path.
- **RAG Agent**: Vector searches PDF chunks and synthesizes answers.
- **Linguistic Analyst (Observer)**: Silent sub-agent that tokenizes input to update BKT models and detect grammar errors.
- **Memory Manager**: Manages episodic memory (vector search) and SRS queues.

## Model Context Protocol (MCP)
Use MCP to bridge the LLM "Brain" to specialized "Senses".
- **Lexical Server**: Wraps Jisho API for ground-truth definitions.
- **Memory Server**: Connects to AnkiConnect for physical card management.
- **Linguistic Server**: Wraps Sudachi/MeCab for morphological analysis.
- **Pitch Accent Server**: Wraps Onsei/OJAD for pitch visualization.

## Hermes Compatibility Strategy
React Native's Hermes engine lacks many Node/Web APIs required by LangChain.

### Required Polyfills (index.js)
```javascript
import 'react-native-get-random-values';
import { polyfill as polyfillEncoding } from 'react-native-polyfill-globals/src/encoding';
import { polyfill as polyfillReadableStream } from 'react-native-polyfill-globals/src/readable-stream';
import 'core-js/proposals/async-iterator-helpers';

polyfillEncoding();
polyfillReadableStream();
```

### Stability Fallback
If streaming responses are unstable on Android, disable streaming (`stream: false`) for the LLM.

## Context & Memory Management
- **Sliding Window with Summarization**: When token limit is reached, summarize oldest interactions into "Long-Term Memory" entries.
- **Decoupled Memory**:
  - **Working**: Immediate conversation (Redis/RAM).
  - **Episodic**: Interaction history (Vector DB).
  - **Semantic**: Student Knowledge State (SQL/BKT).
- **Context Isolation**: Flush working memory when switching topics (e.g., Grammar -> Roleplay) to prevent "Context Rot".

## Generative UI Strategy
Required for "AI generated tools" like specialized flashcards.
- **JSON Schema Strategy**: The agent must adhere to a strict JSON schema for any generated card data (Front, Back, Type).
- **Dynamic Renderer**: Map JSON arrays to React Native components.
- **Interactivity**: Bind FSRS rating buttons (Easy/Good/Hard/Again) to generated cards to persist them in the FSRS database.
