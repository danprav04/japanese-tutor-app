---
name: japanese_tutor_core
description: Core architecture, data infrastructure, and conventions for the Japanese Tutor app — Local-First, op-sqlite, Zustand, and BYOK model.
---

# Japanese Tutor Core Architecture

## System Philosophy: Local-First Autonomous Tutor
The app is a fully autonomous React Native + Expo application targeting **Android only**. The device is the primary node for data persistence, cognitive modeling, and AI orchestration. No developer-managed backend.

### Key Principles
- All data persisted in `op-sqlite` (no AsyncStorage for structured data).
- API keys stored in `expo-secure-store` (hardware-backed Keystore on Android).
- State management via **Zustand** (`src/store/app-store.ts`).
- Donation-only monetization via RevenueCat (no ads).
- Hermes engine — requires polyfills for Web APIs (see `src/utils/polyfills.ts`).

## Core Data Layer: op-sqlite

### Why op-sqlite
- JSI-based C++ bindings — zero bridge latency.
- Synchronous execution for performance-critical paths.
- Schema defined inline in `src/db/database.ts` (no separate migration files).

### Database Tables

| Table | Purpose |
|-------|---------|
| `curriculum_nodes` | Knowledge graph nodes (grammar, vocab, kanji) |
| `node_dependencies` | DAG edges for prerequisite tracking |
| `user_progress` | BKT mastery state per node |
| `cards` | FSRS flashcard state (stability, difficulty, due) |
| `review_logs` | History of card reviews (rating, timestamps) |
| `documents` / `document_chunks` | Uploaded material for RAG |
| `checkpoints` | LangGraph conversation state persistence |
| `app_settings` | Key-value settings store |

### Conventions
- Use `db.execute(sql, params)` — synchronous API.
- All IDs are UUIDs (`uuid` package).
- Dates stored as ISO 8601 strings.
- JSON data stored as TEXT columns, parsed in service layer.
- Service files in `src/services/` bridge algorithms to database.

## File Structure

```
app/                     # Expo Router screens
├── _layout.tsx          # Root layout (DB init + settings load)
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator (Chat, Review, Progress, Settings)
│   ├── index.tsx        # Chat screen (tutor-agent)
│   ├── flashcards.tsx   # FSRS review screen
│   ├── progress.tsx     # BKT mastery visualization
│   └── settings.tsx     # API keys + model + uploads
src/
├── algorithms/
│   ├── bkt.ts           # Bayesian Knowledge Tracing
│   └── fsrs.ts          # ts-fsrs wrapper
├── db/
│   ├── database.ts      # DB init + schema
│   └── checkpointer.ts  # Conversation state persistence
├── services/
│   ├── gemini-client.ts # Multi-key BYOK Gemini client
│   ├── tutor-agent.ts   # Chat orchestration
│   ├── card-service.ts  # FSRS ↔ DB bridge
│   ├── progress-service.ts  # BKT ↔ DB bridge
│   └── curriculum-service.ts # Node CRUD + graph
├── store/
│   └── app-store.ts     # Zustand global state
├── types/
│   └── polyfills.d.ts   # Type declarations for polyfill modules
└── utils/
    └── polyfills.ts     # Hermes Web API polyfills
```

## Secure Key Storage (BYOK)
- **Storage**: `expo-secure-store` (Android Keystore-backed).
- **Runtime state**: Zustand store holds keys in memory after async load.
- **Persistence**: Keys are JSON-serialized and stored under `gemini_api_keys`.
- **Multi-key rotation**: `GeminiClient` automatically rotates on 429 errors.
- **Never** store keys in plain AsyncStorage or app_settings table.

## Monetization
- **Donation-only** via RevenueCat (no ads).
- Products: Coffee ($3), Meal ($10), Support ($25) — consumable IAPs.
- Track total donated locally in `app_settings` table.

## Implementation Guidelines
1. **No backend**: All logic and data lives on-device.
2. **Synchronous SQL**: Use `db.execute()` (sync) for reads, not async wrappers.
3. **Graph mastery**: Nodes unlock when ALL parent prerequisites reach BKT mastery > 0.95.
4. **Service layer pattern**: Screens → Services → Database. Never call `db.execute` from screen components.
5. **Entry point**: `index.tsx` imports polyfills first, then registers the app.
6. **Root layout**: `app/_layout.tsx` must call `initDatabase()` and `loadFromStorage()` before rendering.
