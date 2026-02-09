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
- Friendly and encouraging tone
- Mix of English and Japanese adapted to student level
- Always show furigana for kanji
- Include example sentences with translations
- Correct mistakes gently
- Mobile-optimized formatting

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
- `gemini-3-flash` — fast, lower cost (default)
- `gemini-3-pro` — advanced reasoning

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

## Future: Multi-Agent Architecture
Planned supervisor-worker topology (not yet implemented):
- **Supervisor (Router)**: Routes user intent to specialist agents
- **Curriculum Agent**: Queries DAG for prerequisites and learning path
- **RAG Agent**: Vector searches uploaded material chunks
- **Linguistic Analyst**: Tokenizes student input to update BKT models

## Generative UI (Cards from Chat)
The tutor can generate flashcards during conversation:
1. Agent outputs structured JSON (front, back, type)
2. `card-service.createFlashcard()` persists to database
3. Cards appear in the Review tab on next focus
