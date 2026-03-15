/**
 * Curriculum Extraction Test
 * 
 * Verifies that the segmentation prompt correctly splits a section
 * containing BOTH vocabulary and grammar into two separate topics
 * (one vocab, one grammar) and correctly sets the dependency.
 * 
 * Usage: node tests/test-curriculum-extraction.mjs
 */

import { readFileSync } from 'fs';

const PROXY_URL = 'https://ai-proxy.promy.workers.dev';
const APP_SECRET = 'sec_9f8d7c6b5a41234567890abcdef123456789';

// The exact prompt format from document-service.ts
const buildSegmentationPrompt = (text) => `You are analyzing Japanese learning material. Segment this text into **self-contained topic sections**.

## Rules

1. Each section should cover exactly ONE concept (a grammar point, a vocabulary word/list, a kanji, etc.)
2. **Crucial:** If a section contains BOTH a vocabulary list and a grammar explanation, you MUST split it into TWO separate topics:
   - Topic A (type: 'vocab'): Covers the vocabulary list.
   - Topic B (type: 'grammar'): Covers the grammar point.
3. Sections MUST be contiguous and non-overlapping — every paragraph belongs to exactly one section.
4. The startMarker and endMarker must be EXACT quotes from the original text (8-15 words) that uniquely identify where each section starts and ends.
5. For introductory/meta text that doesn't teach a specific concept, you may group it as a grammar-type topic with a descriptive title like "Introduction" or "Chapter Overview".
6. **Dependencies:** If a grammar topic relies on a preceding vocabulary list, you MUST list the exact title of the vocab topic in the grammar topic's \`dependsOn\` array.
7. The summary MUST be formatted as a bulleted list using dashes (-), containing 2-3 points explaining what the topic is, why it matters, and what the user will learn.

## JLPT Level Guidelines
- Level 5 (N5): Basic particles, basic verb forms, common everyday vocabulary
- Level 4 (N4): て-form, ている, conditionals, compound particles
- Level 3 (N3): Passive, causative, potential form, formal expressions
- Level 2 (N2): Keigo, complex grammar, literary expressions  
- Level 1 (N1): Academic/specialized grammar
- When in doubt, assign the EASIER (higher number) level.

## Material to analyze
---
${text}
---

Identify all distinct topics taught in this material. Output them in the order they appear.`;

const SEGMENTATION_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The concept name (e.g., "は particle", "食べる", "日")' },
          type: { type: 'string', enum: ['vocab', 'grammar', 'kanji'] },
          jlptLevel: { type: 'integer', description: 'JLPT level estimate (5=easiest, 1=hardest)' },
          summary: { type: 'string', description: '2-3 bullet points summarizing what this topic covers (use dashes "-" for bullets, separated by newlines)' },
          startMarker: { type: 'string', description: 'The first 8-15 words of this section in the original text (exact match)' },
          endMarker: { type: 'string', description: 'The last 8-15 words of this section in the original text (exact match)' },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Titles of other topics in this list that this topic builds upon',
          },
        },
        required: ['title', 'type', 'jlptLevel', 'summary', 'startMarker', 'endMarker'],
      },
    },
  },
};

const TEST_TEXT = `The na-adjective
Vocabulary
静か 【しず・か】 (na-adj) - quiet
人 【ひと】 - person
きれい (na-adj) - pretty; clean
友達 【とも・だち】 - friend

The na-adjective is very simple to learn because it acts essentially like a noun. All the conjugation rules for both nouns and na-adjectives are the same. One main difference is that a na-adjective can directly modify a noun following it by sticking 「な」 between the adjective and noun. (Hence the name, na-adjective.)

Examples
静かな人。
Quiet person.
きれいな人。`;

async function runTest() {
  console.log('🧪 Testing Document Segmentation (Vocab + Grammar Split)');
  
  const prompt = buildSegmentationPrompt(TEST_TEXT);
  const jsonPrompt = `${prompt}

Respond with ONLY valid JSON matching this schema:
${JSON.stringify(SEGMENTATION_SCHEMA)}

Do not include any other text, markdown, or explanation. Only output the JSON object.`;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': APP_SECRET,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // Default extraction model
      messages: [{ role: 'user', content: jsonPrompt }],
      temperature: 0.1, // Low temp for extraction
      response_format: { type: 'json_object' }
    }),
  });

  if (!response.ok) {
    throw new Error(`Proxy error: ${await response.text()}`);
  }

  const data = await response.json();
  const resultText = data.choices[0]?.message?.content || '{}';
  
  let result;
  try {
    result = JSON.parse(resultText);
  } catch (e) {
    console.error('❌ Failed to parse JSON response:', resultText);
    process.exit(1);
  }

  console.log('\\n📊 Extraction Results:\\n', JSON.stringify(result, null, 2));

  // Assertions
  const topics = result.topics || [];
  let passed = true;

  if (topics.length < 2) {
    console.error('❌ Expected at least 2 topics (1 vocab, 1 grammar), but got', topics.length);
    passed = false;
  }

  const vocabTopic = topics.find(t => t.type === 'vocab');
  const grammarTopic = topics.find(t => t.type === 'grammar');

  if (!vocabTopic) {
    console.error('❌ Missing topic with type "vocab"');
    passed = false;
  }
  if (!grammarTopic) {
    console.error('❌ Missing topic with type "grammar"');
    passed = false;
  }

  if (vocabTopic && grammarTopic) {
    const dependsOn = grammarTopic.dependsOn || [];
    if (!dependsOn.includes(vocabTopic.title)) {
      console.error(`❌ Grammar topic "${grammarTopic.title}" does not depend on vocab topic "${vocabTopic.title}". Dependencies found: ${dependsOn}`);
      passed = false;
    } else {
      console.log('✅ Dependency correctly mapped.');
    }
  }

  if (passed) {
    console.log('\\n🎉 SUCCESS: Vocabulary and grammar successfully split and linked!');
  } else {
    console.log('\\n💥 FAILURE: The prompt did not produce the expected structure.');
    process.exit(1);
  }
}

runTest().catch(console.error);
