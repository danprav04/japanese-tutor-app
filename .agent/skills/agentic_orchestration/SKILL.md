---
name: agentic_orchestration
description: AI chat orchestration, Hermes polyfills, conversation persistence, and Gemini multi-key client patterns.
---

# Agentic Orchestration

## Chat Architecture
The tutor agent (`src/services/tutor-agent.ts`) orchestrates conversations:

1. **User sends message** → chat screen calls `sendMessage(threadId, text)`
2. **Load context** → retrieve conversation history from SQLite checkpoint
3. **Build prompt** → system prompt + last 20 messages as conversation context
4. **Call Gemini** → `gemini-client.ts` handles API call with key rotation
5. **Persist state** → save updated conversation as new checkpoint in SQLite
6. **Return response** → displayed in GiftedChat UI

### Conversation Persistence (SQLite Checkpointer)
File: `src/db/checkpointer.ts`

- Each thread stores serialized `ConversationState` (message array) as JSON.
- Checkpoints keyed by `(thread_id, checkpoint_id)`.
- `getLatestCheckpoint(threadId)` retrieves most recent state.
- `saveCheckpoint(threadId, checkpointId, data)` persists after each message.
- In-memory cache (`Map<string, ConversationMessage[]>`) avoids redundant DB reads.

### System Prompt Design
The system prompt (`SYSTEM_PROMPT` in `tutor-agent.ts`) defines Sensei's persona:
- SRS-driven teaching: prioritizes unmastered items, reviews weak items, skips mastered
- Curriculum context injected into every prompt via `buildCurriculumContext()`
- Friendly and encouraging tone with mobile-optimized formatting
- Flashcard generation via `[FLASHCARD]{...}[/FLASHCARD]` markers

### Curriculum-Aware Prompting
File: `src/services/curriculum-context.ts`

On every message, `sendMessage()` calls `buildCurriculumContext()` which:
1. Joins `curriculum_nodes` with `user_progress` to get mastery scores
2. Groups items into bands: Unlearned (<0.3), Learning (0.3-0.7), Familiar (0.7-0.95), Mastered (≥0.95)
3. Formats a text block listing unlearned items in detail for the AI to teach
4. Injects this into the prompt before conversation history

## Gemini Multi-Key Client
File: `src/services/gemini-client.ts`

### Key Rotation
```typescript
// On 429/rate-limit, rotate to next key automatically
private rotateKey(): void {
  this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
}
```

### Methods
| Method | Purpose |
|--------|---------|
| `generate(prompt, systemPrompt?)` | Single response with retry on rate limit |
| `generateStream(prompt, systemPrompt?)` | AsyncGenerator for streaming responses |
| `generateJSON<T>(prompt, schema)` | Structured JSON output with schema enforcement |
| `embed(text)` | Text embeddings via `text-embedding-004` model |

### Models
- `gemini-3-flash-preview` — fast, lower cost (default)
- `gemini-3-pro-preview` — advanced reasoning

## Hermes Engine Polyfills
File: `src/utils/polyfills.ts` — **must be imported first** in `index.tsx`.

### What's Polyfilled
| API | Package | Why |
|-----|---------|-----|
| `crypto.getRandomValues` | `react-native-get-random-values` | UUID generation |
| `btoa` / `atob` | `base-64` | Base64 encoding for API payloads |
| `TextEncoder` / `TextDecoder` | `text-encoding` | String encoding for AI SDK |
| `ReadableStream` / `WritableStream` / `TransformStream` | `web-streams-polyfill` | Streaming responses |

### Critical Rules
- Polyfills must be the **first import** in `index.tsx` (before React/Expo).
- `ReadableStream` requires `as any` cast due to type mismatch with global.
- If streaming is unstable on a device, fall back to `generate()` (non-streaming).

## Document Upload Pipeline
File: `src/services/document-service.ts`

1. User picks file via `expo-document-picker` (Settings tab)
2. Read content using SDK 54 `new File(uri).text()` (not legacy `readAsStringAsync`)
3. Split long docs into 15k-char chunks for parallel Gemini extraction
4. Each chunk sent to `generateJSON()` with structured extraction prompt
5. Deduplicate extracted items, insert as curriculum nodes + flashcards
6. Raw text chunked into `document_chunks` table for future RAG

## Generative UI (Cards from Chat)
The tutor generates flashcards during conversation:
1. System prompt instructs `[FLASHCARD]{...}[/FLASHCARD]` output format
2. `parseFlashcards()` extracts JSON from response, strips markers
3. `card-service.createFlashcard()` persists to database
4. Chat screen shows system message: "📝 X flashcards created!"

## Future: Multi-Agent Architecture
Planned supervisor-worker topology (not yet implemented):
- **Supervisor (Router)**: Routes user intent to specialist agents
- **Curriculum Agent**: Queries DAG for prerequisites and learning path
- **RAG Agent**: Vector searches uploaded material chunks
- **Linguistic Analyst**: Tokenizes student input to update BKT models

