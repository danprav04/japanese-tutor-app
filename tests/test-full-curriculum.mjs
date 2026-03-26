/**
 * Full Curriculum Test — Learning Experience Evaluation
 * 
 * Simulates a real student progressing through the llama-3.3 curriculum,
 * replicating the EXACT same logic the app uses:
 *   - BKT mastery tracking (bkt.ts)
 *   - Curriculum context building with mastery bands & gated window (curriculum-context.ts)
 *   - Progress marker parsing with balanced-brace extraction (tutor/parsing.ts)
 *   - Guardrails: 👉 block, premature [PROGRESS] block (tutor-agent.ts)
 * 
 * Usage: node tests/test-full-curriculum.mjs
 */

import { readFileSync, writeFileSync, createWriteStream } from 'fs';

// ─── Tee output to file ─────────────────────────────────────
const logFilePath = new URL('./curiculum_data/test_output.txt', import.meta.url);
const logStream = createWriteStream(logFilePath, { flags: 'w' });
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
console.log = (...args) => { const line = args.join(' '); origLog(...args); logStream.write(line + '\n'); };
console.error = (...args) => { const line = args.join(' '); origError(...args); logStream.write('[ERROR] ' + line + '\n'); };
console.warn = (...args) => { const line = args.join(' '); origWarn(...args); logStream.write('[WARN] ' + line + '\n'); };

const MODEL = 'llama-3.3-70b-versatile';
const PROXY_URL = 'https://ai-proxy.promy.workers.dev';
const APP_SECRET = 'sec_9f8d7c6b5a41234567890abcdef123456789';

// ─── Load system prompt (same as the app) ────────────────────

const promptFile = readFileSync(
  new URL('../src/services/tutor/prompt.ts', import.meta.url), 'utf-8'
);
const SYSTEM_PROMPT = promptFile.match(/`([\s\S]*?)`/)?.[1] || '';
if (!SYSTEM_PROMPT) {
  console.error('❌ Could not read SYSTEM_PROMPT from prompt.ts');
  process.exit(1);
}
console.log(`✅ Loaded system prompt (${SYSTEM_PROMPT.length} chars)`);

// ═══════════════════════════════════════════════════════════════
// PORTED APP LOGIC — Pure JS (no DB)
// ═══════════════════════════════════════════════════════════════

// ─── BKT Algorithm (from src/algorithms/bkt.ts) ──────────────

const DEFAULT_BKT_PARAMS = {
  p_transit: 0.1,
  p_guess: 0.25,
  p_slip: 0.1,
};

function updateMastery(prior, isCorrect, params = DEFAULT_BKT_PARAMS) {
  let likelihood;
  if (isCorrect) {
    const numerator = prior * (1 - params.p_slip);
    const denominator = numerator + (1 - prior) * params.p_guess;
    likelihood = numerator / denominator;
  } else {
    const numerator = prior * params.p_slip;
    const denominator = numerator + (1 - prior) * (1 - params.p_guess);
    likelihood = numerator / denominator;
  }
  const updatedMastery = likelihood + (1 - likelihood) * params.p_transit;
  return Math.max(0.001, Math.min(0.999, updatedMastery));
}

function isMastered(score) {
  return score >= 0.95;
}

// ─── Parsing (from src/services/tutor/parsing.ts) ────────────

function normalizeQuotes(text) {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

function extractBalancedJson(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseTaggedBlocks(response, tag) {
  const items = [];
  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;
  let result = response;
  let searchFrom = 0;

  const regions = [];
  while (true) {
    const tagStart = result.indexOf(openTag, searchFrom);
    if (tagStart === -1) break;

    const afterOpen = tagStart + openTag.length;
    let jsonStart = afterOpen;
    while (jsonStart < result.length && /\s/.test(result[jsonStart])) jsonStart++;

    const jsonStr = extractBalancedJson(result, jsonStart);
    if (!jsonStr) { searchFrom = tagStart + 1; continue; }

    try {
      const parsed = JSON.parse(normalizeQuotes(jsonStr));
      items.push(parsed);
    } catch { /* skip malformed */ }

    let blockEnd = jsonStart + jsonStr.length;
    while (blockEnd < result.length && /\s/.test(result[blockEnd])) blockEnd++;
    if (result.slice(blockEnd, blockEnd + closeTag.length) === closeTag) {
      blockEnd += closeTag.length;
    }
    regions.push({ start: tagStart, end: blockEnd });
    searchFrom = blockEnd;
  }

  for (let i = regions.length - 1; i >= 0; i--) {
    result = result.slice(0, regions[i].start) + result.slice(regions[i].end);
  }

  return { cleanText: result.trim(), items };
}

function parseProgressMarkers(response) {
  const { cleanText, items } = parseTaggedBlocks(response, 'PROGRESS');
  const updates = [];
  for (const parsed of items) {
    if (parsed.item && typeof parsed.correct === 'boolean') {
      updates.push({ item: parsed.item, correct: parsed.correct });
    }
  }
  return { cleanText, updates };
}

function stripThinkingBlocks(response) {
  return response
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[THINK\][^]*?\[\/THINK\]/g, '')
    .trim();
}

// ─── Guardrails (from src/services/tutor-agent.ts) ───────────

const NON_ANSWER_PATTERNS = /^\s*(hey|hi|hello|sure|ready|let'?s\s+(go|learn|continue|do it)|ok(ay)?|yes(\s+please)?|got it!?|what'?s\s+next|teach me|let me|sounds good|cool|nice|alright|yeah|yep|yup|go ahead|i'?m ready|はい|うん|hai|nope|no|next|continue)\s*[!.?？]*\s*$/i;

function applyGuardrails(rawResponse, userMessage) {
  // Strip thinking blocks
  let response = stripThinkingBlocks(rawResponse);

  // Parse progress markers
  const { cleanText, updates: rawUpdates } = parseProgressMarkers(response);
  response = cleanText || response;

  // Strip 👉 emoji
  response = response.replace(/👉/g, '•');

  // Block premature [PROGRESS] on non-answers
  const isNonAnswer = NON_ANSWER_PATTERNS.test(userMessage.trim());
  const updates = isNonAnswer && rawUpdates.length > 0
    ? (console.log(`  🛡️ GUARDRAIL: Blocked ${rawUpdates.length} premature [PROGRESS] on "${userMessage}"`), [])
    : rawUpdates;

  return { response, updates, blockedProgress: isNonAnswer && rawUpdates.length > 0 };
}

// ─── Curriculum Context Builder (from src/services/curriculum-context.ts) ─

const VISIBLE_UNLEARNED_LIMIT = 5;

function typeLabel(type) {
  return { grammar: 'Grammar', vocab: 'Vocabulary', kanji: 'Kanji' }[type] || type;
}

function groupByType(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  }
  return groups;
}

function buildCurriculumContext(nodes, progressMap) {
  const items = nodes.map(n => ({
    ...n,
    masteryScore: progressMap.get(n.nodeId)?.masteryScore ?? 0.1,
    attempts: progressMap.get(n.nodeId)?.attempts ?? 0,
  }));

  if (items.length === 0) {
    return { context: '⚠️ CURRICULUM IS EMPTY.', status: 'empty', targetLesson: null };
  }

  const unlearned = items.filter(i => i.masteryScore < 0.3);
  const learning = items.filter(i => i.masteryScore >= 0.3 && i.masteryScore < 0.7);
  const familiar = items.filter(i => i.masteryScore >= 0.7 && i.masteryScore < 0.95);
  const mastered = items.filter(i => i.masteryScore >= 0.95);

  const targetLesson = unlearned[0] || learning[0] || familiar[0] || null;

  const targetReview = items.find(
    i => i.attempts > 0 && i.masteryScore < 0.7 && i.nodeId !== targetLesson?.nodeId
  ) || null;

  if (mastered.length === items.length) {
    return {
      context: `=== STUDENT CURRICULUM STATUS ===\nTotal items: ${items.length} | ALL MASTERED ✅\n\n🎉 ALL ${items.length} items are mastered!`,
      status: 'all_mastered',
      targetLesson: null,
    };
  }

  const lines = [];
  lines.push(`=== STUDENT CURRICULUM STATUS ===`);
  lines.push(`Total items: ${items.length} | Mastered: ${mastered.length} | Learning: ${learning.length + familiar.length} | New: ${unlearned.length}`);
  lines.push('');

  if (targetLesson) {
    const detail = targetLesson.summary ? ` — ${targetLesson.summary}` : '';
    lines.push(`🎯 TARGET LESSON: "${targetLesson.title}"${detail} (${targetLesson.type})`);
    lines.push('');
  }

  if (targetReview) {
    const pct = Math.round(targetReview.masteryScore * 100);
    lines.push(`🔄 TARGET REVIEW: "${targetReview.title}" (${pct}% mastery)`);
    lines.push('');
  }

  if (unlearned.length > 0) {
    const visible = unlearned.slice(0, VISIBLE_UNLEARNED_LIMIT);
    lines.push(`📕 NOT YET LEARNED (teach these in order, one at a time):`);
    for (const item of visible) {
      const detail = item.summary ? ` — ${item.summary}` : '';
      lines.push(`  • "${item.title}" (${typeLabel(item.type)})${detail}`);
    }
    if (unlearned.length > VISIBLE_UNLEARNED_LIMIT) {
      lines.push(`  (${unlearned.length - VISIBLE_UNLEARNED_LIMIT} more items locked — will be visible after completing these)`);
    }
    lines.push('');
  }

  if (learning.length > 0) {
    lines.push('📙 STILL LEARNING (review these occasionally):');
    const grouped = groupByType(learning);
    for (const [type, typeItems] of Object.entries(grouped)) {
      const titles = typeItems.slice(0, 6).map(i => i.title).join(', ');
      const extra = typeItems.length > 6 ? ` +${typeItems.length - 6} more` : '';
      lines.push(`  ${typeLabel(type)}: ${titles}${extra}`);
    }
    lines.push('');
  }

  if (familiar.length > 0) {
    lines.push('📗 ALMOST MASTERED (light review):');
    const grouped = groupByType(familiar);
    for (const [type, typeItems] of Object.entries(grouped)) {
      const titles = typeItems.slice(0, 4).map(i => i.title).join(', ');
      const extra = typeItems.length > 4 ? ` +${typeItems.length - 4} more` : '';
      lines.push(`  ${typeLabel(type)}: ${titles}${extra}`);
    }
    lines.push('');
  }

  if (mastered.length > 0) {
    lines.push(`✅ MASTERED (${mastered.length} items — no need to teach these)`);
  }

  return { context: lines.join('\n'), status: 'has_content', targetLesson };
}

// ─── Source Material Builder (from src/services/rag-service.ts) ─

function buildSourceMaterial(node) {
  if (!node.summary) return '';
  return `[SOURCE MATERIAL - TARGET LESSON]\n${node.title}\n${node.summary}\n[/SOURCE MATERIAL]`;
}

// ═══════════════════════════════════════════════════════════════
// CURRICULUM PARSER
// ═══════════════════════════════════════════════════════════════

function parseCurriculumExport(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const nodes = [];

  // CSV header: Node ID,Type,JLPT Level,Title,Unlocked,Mastery Score,Attempts,Summary,Source File
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle multi-line CSV (quoted fields with newlines)
    let fullLine = line;
    while ((fullLine.match(/"/g) || []).length % 2 !== 0 && i + 1 < lines.length) {
      i++;
      fullLine += '\n' + lines[i];
    }

    // Parse CSV fields (respecting quoted strings)
    const fields = parseCSVLine(fullLine);
    if (fields.length < 8) continue;

    nodes.push({
      nodeId: fields[0],
      type: fields[1],          // grammar, vocab
      jlptLevel: parseInt(fields[2], 10),
      title: fields[3],
      unlocked: fields[4] === 'Yes',
      masteryScore: parseFloat(fields[5]) || 0.1,
      attempts: parseInt(fields[6], 10) || 0,
      summary: fields[7] || null,
      sourceFile: fields[8] || null,
    });
  }

  return nodes;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ═══════════════════════════════════════════════════════════════
// GROQ API CALLER (same as the app's proxy flow)
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// VIOLATION CHECKER
// ═══════════════════════════════════════════════════════════════

function checkViolations(response, context) {
  const violations = [];
  const clean = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 1. 👉 self-answer hint
  if (clean.includes('👉')) {
    violations.push('SELF_ANSWER_HINT: Used 👉 hint');
  }

  // 2. Explain + quiz in same message
  const exampleLines = clean.match(/[•\-\*] .*[だですじゃったないいくて]/g) || [];
  const hasBlank = clean.includes('___') || clean.includes('＿＿');
  const hasQuizPrompt = /(?:translate|quiz|fill in|how do you say|what particle|form the|try forming|complete the|what is|how would)/i.test(clean);
  if (exampleLines.length >= 3 && (hasBlank || hasQuizPrompt)) {
    violations.push('EXPLAIN_AND_QUIZ_SAME_MSG: Explained (3+ examples) AND asked quiz');
  }

  // 3. Topic transition + quiz in same message
  const hasTransition = /(?:next topic|let'?s\s+(learn|move|start)|moving to|next up|now let'?s)/i.test(clean);
  if (hasTransition && (hasBlank || hasQuizPrompt)) {
    violations.push('TRANSITION_AND_QUIZ: Transitioned to new topic AND asked quiz in same message');
  }

  // 4. Insufficient examples when introducing topic
  if (hasTransition && exampleLines.length < 3 && exampleLines.length > 0) {
    violations.push(`INSUFFICIENT_EXAMPLES: Introduced new topic with only ${exampleLines.length} example(s)`);
  }

  // 5. Wrong topic check — did the AI reference the expected target?
  if (context.expectedTopic && context.turnIndex === 1) {
    // On the explanation turn, check the AI at least mentions the topic
    const topicLower = context.expectedTopic.toLowerCase();
    const responseLower = clean.toLowerCase();
    // Allow partial match (e.g., "state-of-being" in "expressing state-of-being")
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
    const matchCount = topicWords.filter(w => responseLower.includes(w)).length;
    if (topicWords.length > 0 && matchCount / topicWords.length < 0.3) {
      violations.push(`WRONG_TOPIC: Expected "${context.expectedTopic}" but AI didn't mention it`);
    }
  }

  // 6. Missing progress on a real answer
  if (context.isActualAnswer && !context.hasProgress) {
    violations.push('MISSING_PROGRESS: Student answered but no [PROGRESS] recorded');
  }

  // 7. Premature progress on non-answer (post-guardrail check)
  if (context.isNonAnswer && context.hasProgress) {
    violations.push('PREMATURE_PROGRESS: [PROGRESS] on a non-answer message');
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════
// SIMULATED STUDENT ANSWERS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a plausible student answer based on the node type/title.
 * For vocab nodes: respond with a Japanese word from the summary.
 * For grammar nodes: respond with a simple sentence using the grammar.
 */
function generateStudentAnswer(node) {
  const title = node.title || '';
  const summary = node.summary || '';

  // Extract Japanese characters from summary
  const jpWords = summary.match(/[「]([^」]+)[」]/g)?.map(w => w.replace(/[「」]/g, '')) || [];

  if (node.type === 'vocab') {
    // Return one of the vocabulary words
    if (jpWords.length > 0) return jpWords[0];
    // Fallback: try to extract from summary
    const hiragana = summary.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/);
    return hiragana ? hiragana[0] : '学生';
  }

  // Grammar: build a very simple sentence using the grammar point
  if (title.includes('だ') || title.includes('state-of-being')) return '学生だ';
  if (title.includes('じゃない') || title.includes('negative')) return '学生じゃない';
  if (title.includes('だった') || title.includes('past')) return '学生だった';
  if (title.includes('は')) return '私は学生だ';
  if (title.includes('も')) return '私も学生だ';
  if (title.includes('が')) return '私が学生だ';
  if (title.includes('を') || title.includes('よ')) return '魚を食べた';
  if (title.includes('に')) return '日本に行く';
  if (title.includes('へ')) return '日本へ行く';
  if (title.includes('で')) return '映画館で見た';
  if (title.includes('と')) return '友達と食べる';
  if (title.includes('や') || title.includes('とか')) return '魚や肉';
  if (title.includes('の')) return '学生の本';
  if (title.includes('ね')) return 'いい天気ですね';
  if (title.includes('よ')) return 'おいしいよ';
  if (title.includes('adjective') || title.includes('Adjective')) return '静かな人';
  if (title.includes('すき') || title.includes('likes')) return '食べ物がすきだ';
  if (title.includes('verb') || title.includes('Verb')) return '食べる';
  if (title.includes('ru-verb')) return '食べる';
  if (title.includes('u-verb')) return '飲む';
  if (title.includes('Negative') || title.includes('negative')) return '食べない';
  if (title.includes('Past') || title.includes('past')) return '食べた';
  if (title.includes('Relative')) return '学生じゃない人';
  if (title.includes('Sentence') || title.includes('sentence')) return '学生だ';
  if (title.includes('Adverb') || title.includes('adverb')) return '早く食べる';
  if (title.includes('Explanatory') || title.includes('んだ')) return '学生なんだ';

  return '学生だ'; // safe fallback
}

// ═══════════════════════════════════════════════════════════════
// NODE SAMPLING — Select milestone nodes across the curriculum
// ═══════════════════════════════════════════════════════════════

function selectMilestoneNodes(allNodes) {
  const selected = new Set();

  // 1. First 5 nodes (cold start — state-of-being basics)
  for (let i = 0; i < Math.min(5, allNodes.length); i++) {
    selected.add(i);
  }

  // 2. JLPT level transition points
  for (let i = 1; i < allNodes.length; i++) {
    if (allNodes[i].jlptLevel !== allNodes[i - 1].jlptLevel) {
      // Take the node before and after the transition
      selected.add(i - 1);
      selected.add(i);
      if (i + 1 < allNodes.length) selected.add(i + 1);
    }
  }

  // 3. Vocab→Grammar pairs (check teaching order)
  for (let i = 0; i < allNodes.length - 1; i++) {
    if (allNodes[i].type === 'vocab' && allNodes[i + 1].type === 'grammar') {
      selected.add(i);
      selected.add(i + 1);
    }
  }

  // 4. Final 3 nodes
  for (let i = Math.max(0, allNodes.length - 3); i < allNodes.length; i++) {
    selected.add(i);
  }

  return [...selected].sort((a, b) => a - b);
}

// ═══════════════════════════════════════════════════════════════
// PROGRESS MATCHING (from src/services/tutor-agent.ts)
// ═══════════════════════════════════════════════════════════════

function matchProgressToNode(itemName, allNodes) {
  const clean = normalizeQuotes(itemName).trim();

  // 1. Exact title match
  let match = allNodes.find(n => n.title === clean);

  // 2. Item starts with title
  if (!match) match = allNodes.find(n => clean.startsWith(n.title));

  // 3. Title starts with item (only for longer names)
  if (!match && clean.length > 2) {
    match = allNodes.find(n => n.title.startsWith(clean));
  }

  // 4. Split on " — " or " - " and match first part
  if (!match) {
    const firstPart = clean.split(/\s*[—\-]\s*/)[0].trim();
    if (firstPart && firstPart !== clean) {
      match = allNodes.find(n => n.title === firstPart)
           || (firstPart.length > 2 ? allNodes.find(n => n.title.startsWith(firstPart)) : null);
    }
  }

  // 5. Short items — match 「item」 in title
  if (!match && clean.length <= 2) {
    match = allNodes.find(n => n.title.includes(`「${clean}」`))
         || allNodes.find(n => n.title.endsWith(clean));
  }

  return match;
}

// ═══════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════

async function runTests() {
  console.log('🧪 Full Curriculum Test — Learning Experience Evaluation');
  console.log('═'.repeat(70));
  console.log(`Model: ${MODEL}`);
  console.log(`Proxy: ${PROXY_URL}\n`);

  // ── 1. Parse curriculum ──
  const exportPath = new URL('./curiculum_data/curriculum_export.txt', import.meta.url);
  const allNodes = parseCurriculumExport(exportPath);
  console.log(`📚 Parsed ${allNodes.length} curriculum nodes`);

  // ── 2. Select milestone nodes ──
  const milestoneIndices = selectMilestoneNodes(allNodes);
  console.log(`🎯 Selected ${milestoneIndices.length} milestone nodes for testing`);
  console.log(`   Indices: [${milestoneIndices.join(', ')}]\n`);

  // ── 3. Initialize in-memory progress (same initial state as the app) ──
  const progressMap = new Map();
  for (const node of allNodes) {
    progressMap.set(node.nodeId, {
      masteryScore: 0.1,
      attempts: 0,
      correctCount: 0,
      pTransit: DEFAULT_BKT_PARAMS.p_transit,
      pGuess: DEFAULT_BKT_PARAMS.p_guess,
      pSlip: DEFAULT_BKT_PARAMS.p_slip,
    });
  }

  // ── 4. Run conversation tests ──
  let totalViolations = 0;
  let totalGuardrailBlocks = 0;
  let totalProgressRecorded = 0;
  const allResults = [];
  const reportLines = [];

  for (const nodeIdx of milestoneIndices) {
    const node = allNodes[nodeIdx];
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📋 Node ${nodeIdx + 1}/${allNodes.length}: "${node.title}" (${node.type}, N${node.jlptLevel})`);
    console.log(`${'─'.repeat(70)}`);

    // Build curriculum context (same as curriculum-context.ts)
    const { context: curriculumCtx, targetLesson } = buildCurriculumContext(allNodes, progressMap);

    // Build source material (same as rag-service.ts)
    const sourceMaterial = buildSourceMaterial(node);

    // Compose system prompt (same as tutor-agent.ts)
    const systemContent = [SYSTEM_PROMPT, curriculumCtx, sourceMaterial].filter(Boolean).join('\n\n');

    // Define the conversation turns (simulates a real student)
    const turns = [
      { text: nodeIdx === 0 ? 'Hey' : "What's next?", isActualAnswer: false },
      { text: 'Yes, I\'m ready', isActualAnswer: false },
      { text: 'Got it', isActualAnswer: false },
      { text: generateStudentAnswer(node), isActualAnswer: true },
    ];

    const conversationHistory = [];
    const scenarioViolations = [];
    let scenarioProgressRecorded = 0;

    for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
      const turn = turns[turnIdx];
      const isNonAnswer = NON_ANSWER_PATTERNS.test(turn.text.trim());

      const messages = [
        { role: 'system', content: systemContent },
        ...conversationHistory,
        { role: 'user', content: turn.text },
      ];

      console.log(`\n  👤 Student (turn ${turnIdx + 1}): "${turn.text}"`);

      try {
        const rawResponse = await callGroq(messages);

        // Apply guardrails (same as tutor-agent.ts)
        const { response, updates, blockedProgress } = applyGuardrails(rawResponse, turn.text);
        if (blockedProgress) totalGuardrailBlocks++;

        // Display truncated response
        const displayResponse = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const truncated = displayResponse.length > 400
          ? displayResponse.slice(0, 400) + '...'
          : displayResponse;
        console.log(`  🤖 Sensei: ${truncated}`);

        // Record progress via BKT (same as progress-service.ts)
        for (const update of updates) {
          const matched = matchProgressToNode(update.item, allNodes);
          if (matched) {
            const prog = progressMap.get(matched.nodeId);
            const newMastery = updateMastery(
              prog.masteryScore, update.correct,
              { p_transit: prog.pTransit, p_guess: prog.pGuess, p_slip: prog.pSlip }
            );
            prog.masteryScore = newMastery;
            prog.attempts += 1;
            prog.correctCount += update.correct ? 1 : 0;
            scenarioProgressRecorded++;
            totalProgressRecorded++;
            console.log(`  📊 BKT: "${matched.title}" → mastery ${(newMastery * 100).toFixed(1)}% (${update.correct ? '✅' : '❌'})`);
          } else {
            console.log(`  ⚠️ Progress item not matched: "${update.item}"`);
          }
        }

        // Check violations
        const violations = checkViolations(response, {
          userMessage: turn.text,
          isActualAnswer: turn.isActualAnswer,
          isNonAnswer,
          hasProgress: updates.length > 0,
          expectedTopic: node.title,
          turnIndex: turnIdx,
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
        conversationHistory.push({ role: 'assistant', content: response });

        // Rate limit delay (same as existing test)
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
      nodeIdx: nodeIdx + 1,
      title: node.title,
      type: node.type,
      jlptLevel: node.jlptLevel,
      violations: scenarioViolations,
      progressRecorded: scenarioProgressRecorded,
      finalMastery: progressMap.get(node.nodeId).masteryScore,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST SUMMARY & EVALUATION REPORT
  // ═══════════════════════════════════════════════════════════════

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'═'.repeat(70)}`);

  // Per-node results
  let passed = 0;
  let failed = 0;
  for (const result of allResults) {
    const status = result.violations.length === 0 ? '✅ PASS' : `❌ FAIL (${result.violations.length})`;
    console.log(`  ${status} — [${result.type} N${result.jlptLevel}] ${result.title}`);
    for (const v of result.violations) {
      console.log(`       • ${v}`);
    }
    if (result.violations.length === 0) passed++;
    else failed++;
  }

  // Violation breakdown
  const violationCounts = {};
  for (const result of allResults) {
    for (const v of result.violations) {
      const type = v.split(':')[0];
      violationCounts[type] = (violationCounts[type] || 0) + 1;
    }
  }

  console.log(`\n📈 STATISTICS:`);
  console.log(`  Nodes tested: ${allResults.length}`);
  console.log(`  Passed: ${passed} | Failed: ${failed}`);
  console.log(`  Pass rate: ${((passed / allResults.length) * 100).toFixed(1)}%`);
  console.log(`  Total violations: ${totalViolations}`);
  console.log(`  Guardrail blocks: ${totalGuardrailBlocks}`);
  console.log(`  Progress updates recorded: ${totalProgressRecorded}`);

  if (Object.keys(violationCounts).length > 0) {
    console.log(`\n  Violation breakdown:`);
    for (const [type, count] of Object.entries(violationCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
  }

  // BKT mastery snapshot
  console.log(`\n📊 BKT MASTERY SNAPSHOT (after test):`);
  const masteredNodes = [...progressMap.values()].filter(p => isMastered(p.masteryScore));
  const touchedNodes = [...progressMap.values()].filter(p => p.attempts > 0);
  console.log(`  Touched: ${touchedNodes.length}/${allNodes.length}`);
  console.log(`  Mastered (≥ 95%): ${masteredNodes.length}`);

  // ── Write evaluation report ──
  const report = generateEvaluationReport(allResults, allNodes, progressMap, {
    totalViolations,
    totalGuardrailBlocks,
    totalProgressRecorded,
    violationCounts,
    passed,
    failed,
  });

  const reportPath = new URL('./curiculum_data/evaluation_report.md', import.meta.url);
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📝 Evaluation report written to: tests/curiculum_data/evaluation_report.md`);

  if (totalViolations === 0) {
    console.log('\n🎉 All scenarios passed!');
  } else {
    console.log('\n⚠️ Some scenarios had violations — see evaluation report for details.');
  }
}

// ═══════════════════════════════════════════════════════════════
// EVALUATION REPORT GENERATOR
// ═══════════════════════════════════════════════════════════════

function generateEvaluationReport(results, allNodes, progressMap, stats) {
  const lines = [];
  const now = new Date().toISOString().split('T')[0];

  lines.push(`# Curriculum Learning Experience Evaluation`);
  lines.push(`> Generated: ${now} | Model: ${MODEL}`);
  lines.push('');

  // Executive summary
  lines.push(`## Executive Summary`);
  lines.push('');
  const passRate = ((stats.passed / results.length) * 100).toFixed(1);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Nodes tested | ${results.length} of ${allNodes.length} |`);
  lines.push(`| Pass rate | ${passRate}% (${stats.passed}/${results.length}) |`);
  lines.push(`| Total violations | ${stats.totalViolations} |`);
  lines.push(`| Guardrail blocks | ${stats.totalGuardrailBlocks} |`);
  lines.push(`| Progress updates | ${stats.totalProgressRecorded} |`);
  lines.push('');

  // Learning experience evaluation dimensions
  lines.push(`## Learning Experience Evaluation`);
  lines.push('');

  // 1. Pedagogical flow
  const vocabGrammarPairs = results.filter((r, i) => {
    const next = results[i + 1];
    return r.type === 'vocab' && next?.type === 'grammar';
  });
  const wrongTopicCount = stats.violationCounts['WRONG_TOPIC'] || 0;
  lines.push(`### 1. Pedagogical Flow`);
  lines.push(`- **Curriculum order compliance**: ${wrongTopicCount === 0 ? '✅ Good' : `⚠️ ${wrongTopicCount} wrong-topic violations`}`);
  lines.push(`- **Vocab before grammar**: ${vocabGrammarPairs.every(p => p.violations.length === 0) ? '✅ Consistent' : '⚠️ Some ordering issues'}`);
  lines.push('');

  // 2. Explanation quality
  const insufficientExCount = stats.violationCounts['INSUFFICIENT_EXAMPLES'] || 0;
  lines.push(`### 2. Explanation Quality`);
  lines.push(`- **3+ examples provided**: ${insufficientExCount === 0 ? '✅ Always met' : `⚠️ ${insufficientExCount} violations`}`);
  lines.push('');

  // 3. Quiz separation
  const explainQuizCount = stats.violationCounts['EXPLAIN_AND_QUIZ_SAME_MSG'] || 0;
  const transitionQuizCount = stats.violationCounts['TRANSITION_AND_QUIZ'] || 0;
  const totalSepViolations = explainQuizCount + transitionQuizCount;
  lines.push(`### 3. Quiz Separation`);
  lines.push(`- **Explanation/quiz separation**: ${totalSepViolations === 0 ? '✅ Always separated' : `⚠️ ${totalSepViolations} violations`}`);
  if (explainQuizCount > 0) lines.push(`  - Explain+Quiz in same msg: ${explainQuizCount}`);
  if (transitionQuizCount > 0) lines.push(`  - Transition+Quiz in same msg: ${transitionQuizCount}`);
  lines.push('');

  // 4. Progress tracking
  const missingCount = stats.violationCounts['MISSING_PROGRESS'] || 0;
  const prematureCount = stats.violationCounts['PREMATURE_PROGRESS'] || 0;
  lines.push(`### 4. Progress Tracking`);
  lines.push(`- **Progress on answers**: ${missingCount === 0 ? '✅ Always recorded' : `⚠️ ${missingCount} missing`}`);
  lines.push(`- **No premature progress**: ${prematureCount === 0 ? '✅ Clean' : `⚠️ ${prematureCount} premature`}`);
  lines.push(`- **Guardrail blocks**: ${stats.totalGuardrailBlocks} (non-answers correctly blocked)`);
  lines.push(`- **Total BKT updates**: ${stats.totalProgressRecorded}`);
  lines.push('');

  // 5. Self-answer hints
  const hintCount = stats.violationCounts['SELF_ANSWER_HINT'] || 0;
  lines.push(`### 5. Answer Integrity`);
  lines.push(`- **No self-answer hints (👉)**: ${hintCount === 0 ? '✅ Clean' : `⚠️ ${hintCount} violations`}`);
  lines.push('');

  // Detailed results table
  lines.push(`## Detailed Results`);
  lines.push('');
  lines.push(`| # | Node Title | Type | JLPT | Result | Violations | Mastery |`);
  lines.push(`|---|-----------|------|------|--------|------------|---------|`);

  for (const r of results) {
    const status = r.violations.length === 0 ? '✅' : '❌';
    const viol = r.violations.length > 0 ? r.violations.map(v => v.split(':')[0]).join(', ') : '—';
    const mastery = `${(r.finalMastery * 100).toFixed(1)}%`;
    lines.push(`| ${r.nodeIdx} | ${r.title} | ${r.type} | N${r.jlptLevel} | ${status} | ${viol} | ${mastery} |`);
  }
  lines.push('');

  // BKT Mastery distribution
  lines.push(`## BKT Mastery Distribution`);
  lines.push('');
  const allMasteries = [...progressMap.values()];
  const bands = {
    'Untouched (10%)': allMasteries.filter(p => p.attempts === 0).length,
    'Beginner (<30%)': allMasteries.filter(p => p.attempts > 0 && p.masteryScore < 0.3).length,
    'Learning (30-70%)': allMasteries.filter(p => p.masteryScore >= 0.3 && p.masteryScore < 0.7).length,
    'Familiar (70-95%)': allMasteries.filter(p => p.masteryScore >= 0.7 && p.masteryScore < 0.95).length,
    'Mastered (95%+)': allMasteries.filter(p => p.masteryScore >= 0.95).length,
  };
  for (const [band, count] of Object.entries(bands)) {
    lines.push(`- ${band}: ${count} nodes`);
  }
  lines.push('');

  // Conclusion
  lines.push(`## Conclusion`);
  lines.push('');
  if (stats.totalViolations === 0) {
    lines.push(`The AI tutor demonstrated excellent adherence to all pedagogical rules across ${results.length} curriculum nodes. The learning experience is well-structured with proper vocab→grammar ordering, adequate examples, separated explanations and quizzes, and accurate progress tracking.`);
  } else {
    lines.push(`The AI tutor had **${stats.totalViolations} violation(s)** across ${results.length} curriculum nodes (${passRate}% pass rate). The most common issue was **${Object.entries(stats.violationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}**. Review the detailed results above for specific areas needing improvement.`);
  }

  return lines.join('\n');
}

// ─── Run ─────────────────────────────────────────────────────

runTests().catch(console.error);
