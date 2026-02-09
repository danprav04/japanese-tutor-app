---
name: japanese_linguistics
description: Strategies for Japanese text processing, pitch accent visualization, and AI-powered linguistic analysis in the Japanese Tutor app.
---

# Japanese Linguistics

## Morphological Analysis Strategy
Standard LLM tokenization doesn't align with Japanese linguistic units. The app uses a layered approach:

### Current: AI-Powered Analysis (Gemini)
Since this is an Android-only app using BYOK Gemini, morphological analysis is handled by the AI model:
- The tutor agent system prompt instructs Gemini to provide detailed breakdowns
- Grammar pattern identification via structured prompts
- Error detection through conversational context

### Future: Native Analyzers
For offline or latency-sensitive analysis:
- **Android**: Kuromoji (Java-based, can be bridged via native module)
- **Wrapper**: Custom React Native native module exposing `tokenize(text)` → morpheme array
- **Output format**: `[{ surface, reading, pos, baseForm }]`

### Applications
- **Input parsing**: Detect verb conjugation forms (て-form, ない-form, past tense)
- **Error feedback**: "You used the past-tense suffix on a non-past stem"
- **BKT updates**: Automatically score grammar usage from conversation input

## Pitch Accent Visualization
Pitch accent is critical for natural-sounding Japanese. The app uses `react-native-svg` for visualization.

### Implementation
File concept: `src/components/PitchAccentGraph.tsx`

```tsx
// SVG line chart over text mora
// Pattern types: Heiban (flat), Atamadaka (head-high),
// Nakadaka (mid-high), Odaka (tail-high)
//
// Data source: pitch patterns stored in curriculum_nodes.content_payload
// as JSON: { "pitch": "LHH", "mora": ["か", "ん", "じ"] }
```

### Pitch Pattern Encoding
Store in `content_payload` JSON of `curriculum_nodes`:
```json
{
  "word": "漢字",
  "reading": "かんじ",
  "pitch": "LH",
  "type": "atamadaka",
  "mora": ["か", "ん", "じ"]
}
```

### Rendering Rules
- **L** (low): Y position = baseline
- **H** (high): Y position = elevated
- Draw connecting lines between mora positions
- Particle drop: after the word, pitch drops (for 平板 heiban, no drop)

## Document Processing Pipeline
For the "Upload Materials" feature in Settings:

### Supported Formats
- PDF (via `expo-document-picker` + future text extraction)
- Plain text (.txt)
- Markdown (.md)

### Pipeline Steps
1. **Extract text** from uploaded file
2. **Send to Gemini** with structured output prompt:
   - Extract vocabulary (word, reading, meaning, JLPT level)
   - Extract grammar points (pattern, usage, examples)
   - Extract kanji (character, readings, meaning)
   - Identify prerequisite dependencies
3. **Validate** AI output against expected JSON schema
4. **Insert** into `curriculum_nodes` and `node_dependencies` via `curriculum-service.ts`
5. **Create flashcards** via `card-service.createFlashcard()` for each extracted item
6. **Chunk text** into `document_chunks` table for RAG retrieval

### Chunking Strategy
- Target: ~500 tokens per chunk with 10% overlap
- Preserve sentence boundaries (split on `。` or `\n`)
- Store `chunk_index` and `page_number` for source attribution

## Furigana Conventions
The tutor agent follows these rules in all responses:
- New kanji words: always show furigana — `漢字（かんじ）`
- Known kanji (high BKT mastery): optionally omit furigana
- Grammar particle explanations: highlight with **bold**
- Example sentences: full Japanese + English translation on next line
