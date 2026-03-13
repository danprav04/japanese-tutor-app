/**
 * Tutor Chat Test Harness
 * 
 * Standalone Node.js script that simulates multi-turn conversations
 * with the AI tutor via the Cloudflare proxy, then checks for rule violations.
 * Also applies the same programmatic guardrails the app uses.
 * 
 * Usage: node tests/test-tutor-chat.mjs
 */

import { readFileSync } from 'fs';

const MODEL = 'qwen/qwen3-32b';
const PROXY_URL = 'https://ai-proxy.promy.workers.dev';
const APP_SECRET = 'sec_9f8d7c6b5a41234567890abcdef123456789';

// ─── Read the system prompt from prompt.ts ───────────────────

const promptFile = readFileSync(
  new URL('../src/services/tutor/prompt.ts', import.meta.url), 'utf-8'
);
const SYSTEM_PROMPT = promptFile.match(/`([\s\S]*?)`/)?.[1] || '';
if (!SYSTEM_PROMPT) {
  console.error('❌ Could not read SYSTEM_PROMPT from prompt.ts');
  process.exit(1);
}
console.log(`✅ Loaded system prompt (${SYSTEM_PROMPT.length} chars)`);

// ─── Simulated curriculum context ────────────────────────────

const FAKE_CURRICULUM = `=== STUDENT CURRICULUM STATUS ===
Total items: 39 | Mastered: 0 | Learning: 0 | New: 39

🎯 TARGET LESSON: "Expressing state-of-being with 「だ」" — Declares a noun/na-adjective as the current state (grammar)

📕 NOT YET LEARNED (teach these in order, one at a time):
  Grammar:
    • Expressing state-of-being with 「だ」 — Declares a noun/na-adjective as the current state
    • Negative state-of-being 「じゃない」 — Form the negative of だ for nouns/na-adjectives
    • Past state-of-being 「だった」 — Form the past tense of だ
    • Topic particle 「は」 — Defines the topic of a sentence
    • Inclusive topic particle 「も」 — Adds "also/too" meaning to the topic
  (34 more items locked — will be visible after completing these)`;

const FAKE_SOURCE_MATERIAL = `[SOURCE MATERIAL - TARGET LESSON]
Expressing State-of-Being

In Japanese, you can declare what something is by attaching 「だ」 to a noun or na-adjective.

Examples:
- 人だ — (It is) a person
- 学生だ — (It is) a student  
- 元気だ — (It is) healthy/well

Note: 「だ」 is used for declarative statements. In casual speech, it can be omitted when the state-of-being is implied by context. However, for formal/emphatic declarations, 「だ」 is required.

The negative form will be covered in the next lesson.
[/SOURCE MATERIAL]`;

// ─── Programmatic guardrails (same as tutor-agent.ts) ────────

const NON_ANSWER_PATTERNS = /^\s*(hey|hi|hello|sure|ready|let'?s\s+(go|learn|continue|do it)|ok(ay)?|yes(\s+please)?|got it!?|what'?s\s+next|teach me|let me|sounds good|cool|nice|alright|yeah|yep|yup|go ahead|i'?m ready|はい|うん|hai|nope|no|next|continue)\s*[!.?？]*\s*$/i;

function applyGuardrails(rawResponse, userMessage) {
  // Strip 👉 emoji
  let response = rawResponse.replace(/👉/g, '•');
  
  // Block premature progress on non-answers
  const isNonAnswer = NON_ANSWER_PATTERNS.test(userMessage.trim());
  const progressBlocks = response.match(/\[PROGRESS\]\{[^}]+\}\[\/PROGRESS\]/g) || [];
  
  if (isNonAnswer && progressBlocks.length > 0) {
    console.log(`  🛡️ GUARDRAIL: Blocked ${progressBlocks.length} premature [PROGRESS] on "${userMessage}"`);
    response = response.replace(/\[PROGRESS\]\{[^}]+\}\[\/PROGRESS\]/g, '').trim();
  }
  
  return { response, blockedProgress: isNonAnswer && progressBlocks.length > 0 };
}

// ─── Groq API caller via Cloudflare proxy ────────────────────

async function callGroq(messages) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': APP_SECRET,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Proxy error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// ─── Rule violation checker (post-guardrails) ────────────────

function checkViolations(response, context) {
  const violations = [];
  const cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  
  // 1. Self-answering via 👉 (should be stripped by guardrails, but check)
  if (cleanResponse.includes('👉')) {
    violations.push('SELF_ANSWER_HINT: Used 👉 hint');
  }
  
  // 2. Quiz + explanation in same message (3+ examples AND a question)
  const exampleLines = cleanResponse.match(/[•\-\*] .*[だですじゃった]/g) || [];
  const hasBlank = cleanResponse.includes('___') || cleanResponse.includes('＿＿') || cleanResponse.includes('＝??');
  const hasQuizPrompt = /(?:translate|quiz|fill in|how do you say|what particle|form the|try forming|complete the)/i.test(cleanResponse);
  if (exampleLines.length >= 3 && (hasBlank || hasQuizPrompt)) {
    violations.push('EXPLAIN_AND_QUIZ_SAME_MSG: Explained (3+ examples) AND asked quiz');
  }

  // 3. Topic transition + quiz in same message
  //    Detect: teaches a NEW topic (mentions "next topic", "let's learn", "moving to") and asks a question
  const hasTransition = /(?:next topic|let'?s\s+(learn|move|start)|moving to|next up|now let'?s)/i.test(cleanResponse);
  if (hasTransition && (hasBlank || hasQuizPrompt)) {
    violations.push('TRANSITION_AND_QUIZ: Transitioned to new topic AND asked quiz in same message');
  }

  // 4. Insufficient examples (< 3) when introducing a new topic
  if (hasTransition && exampleLines.length < 3 && exampleLines.length > 0) {
    violations.push(`INSUFFICIENT_EXAMPLES: Introduced new topic with only ${exampleLines.length} example(s) (need 3+)`);
  }

  // 5. Progress with abbreviated item name
  const progressMatches = cleanResponse.match(/\[PROGRESS\]\{[^}]+\}\[\/PROGRESS\]/g) || [];
  for (const block of progressMatches) {
    const itemMatch = block.match(/"item"\s*:\s*"([^"]+)"/);
    if (itemMatch && itemMatch[1].length <= 3) {
      violations.push(`SHORT_ITEM_NAME: Progress item "${itemMatch[1]}" too short`);
    }
  }

  // 6. Missing progress on an actual answer
  if (context.isActualAnswer && !progressMatches.length) {
    violations.push('MISSING_PROGRESS: Student answered but no [PROGRESS] recorded');
  }

  return violations;
}

// ─── Test Scenarios ──────────────────────────────────────────

const TEST_SCENARIOS = [
  {
    name: '👋 Basic greeting and first lesson',
    conversation: [
      { text: 'Hey', isActualAnswer: false },
      { text: 'Sure, let\'s learn!', isActualAnswer: false },
      { text: 'これはペンだ', isActualAnswer: true },
      { text: 'Let\'s continue', isActualAnswer: false },
    ],
  },
  {
    name: '❌ Wrong answer flow',
    conversation: [
      { text: 'Hi, teach me!', isActualAnswer: false },
      { text: 'Ready!', isActualAnswer: false },
      { text: '食べじゃない', isActualAnswer: true },
    ],
  },
  {
    name: '⏭️ Topic transition (should explain with 3+ examples, no quiz)',
    conversation: [
      { text: 'Hey', isActualAnswer: false },
      { text: 'Yes please!', isActualAnswer: false },
      { text: '先生だ', isActualAnswer: true },
      // After correct answer, AI should transition to next topic with full explanation
      { text: 'What\'s next?', isActualAnswer: false },
      // AI should explain じゃない with 3+ examples, NOT ask a quiz
    ],
  },
  {
    name: '🗣️ Japanese acknowledgments (はい, うん)',
    conversation: [
      { text: 'Hey', isActualAnswer: false },
      { text: 'Yep', isActualAnswer: false },
      { text: 'はい', isActualAnswer: false },
      // はい should NOT trigger progress — it's an acknowledgment
    ],
  },
  {
    name: '📚 Full progression flow (explain→quiz→answer→transition→explain)',
    conversation: [
      { text: 'Hey', isActualAnswer: false },
      { text: 'Yes!', isActualAnswer: false },
      { text: '本だ', isActualAnswer: true },
      { text: 'Next!', isActualAnswer: false },
      // AI should explain new topic with 3+ examples here
      { text: 'Got it', isActualAnswer: false },
      // NOW AI should ask a quiz question
      { text: '学生じゃない', isActualAnswer: true },
    ],
  },
];

// ─── Main test runner ────────────────────────────────────────

async function runTests() {
  console.log('🧪 Tutor Chat Test Harness v2 (with guardrails)');
  console.log('═'.repeat(60));
  console.log(`Model: ${MODEL}`);
  console.log(`Proxy: ${PROXY_URL}\n`);

  let totalViolations = 0;
  let totalGuardrailBlocks = 0;
  const allResults = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📋 Scenario: ${scenario.name}`);
    console.log(`${'─'.repeat(60)}`);

    const conversationHistory = [];
    const contextBlock = `${FAKE_CURRICULUM}\n\n${FAKE_SOURCE_MATERIAL}`;
    const systemMessage = `${SYSTEM_PROMPT}\n\n${contextBlock}`;
    
    const scenarioViolations = [];

    for (const turn of scenario.conversation) {
      const messages = [
        { role: 'system', content: systemMessage },
        ...conversationHistory,
        { role: 'user', content: turn.text },
      ];

      console.log(`\n👤 Student: "${turn.text}"`);

      try {
        const rawResponse = await callGroq(messages);
        
        // Apply guardrails
        const { response: guardedResponse, blockedProgress } = applyGuardrails(rawResponse, turn.text);
        if (blockedProgress) totalGuardrailBlocks++;
        
        const displayResponse = guardedResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const truncated = displayResponse.length > 500 
          ? displayResponse.slice(0, 500) + '...' 
          : displayResponse;
        console.log(`🤖 Sensei: ${truncated}`);

        const violations = checkViolations(guardedResponse, {
          userMessage: turn.text,
          isActualAnswer: turn.isActualAnswer,
        });

        if (violations.length > 0) {
          console.log(`  ❌ VIOLATIONS (${violations.length}):`);
          for (const v of violations) {
            console.log(`     • ${v}`);
            scenarioViolations.push(v);
          }
        } else {
          console.log(`  ✅ No violations`);
        }

        conversationHistory.push({ role: 'user', content: turn.text });
        conversationHistory.push({ role: 'assistant', content: guardedResponse });
        
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        console.error(`  ⚠️ API Error: ${err.message}`);
        conversationHistory.push({ role: 'user', content: turn.text });
        conversationHistory.push({ role: 'assistant', content: '(error)' });
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    totalViolations += scenarioViolations.length;
    allResults.push({
      scenario: scenario.name,
      violations: scenarioViolations,
    });
  }

  // ─── Summary ─────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  
  for (const result of allResults) {
    const status = result.violations.length === 0 ? '✅ PASS' : `❌ FAIL (${result.violations.length})`;
    console.log(`  ${status} — ${result.scenario}`);
    for (const v of result.violations) {
      console.log(`       • ${v}`);
    }
  }
  
  console.log(`\nTotal violations: ${totalViolations}`);
  console.log(`Guardrail blocks: ${totalGuardrailBlocks}`);
  
  if (totalViolations === 0) {
    console.log('🎉 All scenarios passed!');
  } else {
    console.log('⚠️ Some scenarios had violations — review and refine.');
  }
}

runTests().catch(console.error);
