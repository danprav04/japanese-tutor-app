---
name: japanese_linguistics
description: Strategies for Japanese morphological analysis, pitch accent visualization, and linguistic error detection.
---

# Japanese Linguistics

## Morphological Analysis
Standard LLM tokenization doesn't align with Japanese linguistic units. Use dedicated analyzers for precision.

### Tools
- **iOS**: MeCab
- **Android**: Kuromoji
- **Integration**: Use `react-native-japanese-text-analyzer` to wrap these native engines.

### Application
- **Input Parsing**: Tokenize user replies to detect specific grammatical components (e.g., "Verb-Stem" vs "Dictionary-Form").
- **Precise Feedback**: Identify the exact location of errors (e.g., "You used the past-tense suffix on a non-past stem").

## Pitch Accent Visualization
Pitch accent is critical for natural Japanese but often invisible in text.

### Implementation: SVG Line Charts
Use `react-native-svg` to draw pitch contours over text.
- **Data**: Static SQLite tables for word pitch patterns (e.g., L-H-H).
- **Visualization**: Draw a line graph starting low/high and rising/dropping based on the pattern (Heiban, Atamadaka, etc.).

## Linguistic Processing Pipeline
- **Native Extraction**: `expo-pdf-text-extract` (bridges to PDFKit for iOS, PdfBox for Android). Offloads processing from JS thread.
- **Tokenization**: Use morphological analyzers before chunking to preserve Japanese linguistic boundaries.
- **Chunking**: ~500 tokens with 10% overlap.

## MCP Tools for Linguistics
- `tokenize(text)`: Returns grammatical components.
- `get_pitch_graph(text)`: Generates SVG patterns.
- `lookup_word(query)`: Ground-truth definitions from Jisho/JMdict.
