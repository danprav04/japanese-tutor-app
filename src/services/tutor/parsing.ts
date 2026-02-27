import { ParsedProgress } from './types';

/**
 * Normalize smart/curly quotes to straight quotes so JSON.parse works.
 * The AI sometimes outputs curly quotes instead of straight quotes which breaks parsing.
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')  // smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");  // smart single quotes
}

/**
 * Extract a JSON object string with balanced braces, handling nested
 * objects/arrays and braces inside quoted strings.
 * Returns the full balanced JSON substring starting at `start`, or null.
 */
export function extractBalancedJson(text: string, start: number): string | null {
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
  return null; // unbalanced
}

/**
 * Generic tagged-block parser: finds [TAG]{json}[/TAG] blocks,
 * extracts the JSON using balanced-brace matching, and strips them.
 */
export function parseTaggedBlocks(response: string, tag: string): { cleanText: string; items: any[] } {
  const items: any[] = [];
  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;
  let result = response;
  let searchFrom = 0;

  // Collect all block regions first
  const regions: { start: number; end: number }[] = [];
  while (true) {
    const tagStart = result.indexOf(openTag, searchFrom);
    if (tagStart === -1) break;

    const afterOpen = tagStart + openTag.length;
    // Skip optional whitespace before {
    let jsonStart = afterOpen;
    while (jsonStart < result.length && /\s/.test(result[jsonStart])) jsonStart++;

    const jsonStr = extractBalancedJson(result, jsonStart);
    if (!jsonStr) { searchFrom = tagStart + 1; continue; }

    try {
      const parsed = JSON.parse(normalizeQuotes(jsonStr));
      items.push(parsed);
    } catch {
      // Skip malformed JSON
    }

    // Determine end of block (with or without closing tag)
    let blockEnd = jsonStart + jsonStr.length;
    // Skip optional whitespace after JSON
    while (blockEnd < result.length && /\s/.test(result[blockEnd])) blockEnd++;
    // Skip closing tag if present
    if (result.slice(blockEnd, blockEnd + closeTag.length) === closeTag) {
      blockEnd += closeTag.length;
    }
    regions.push({ start: tagStart, end: blockEnd });
    searchFrom = blockEnd;
  }

  // Strip regions in reverse to preserve indices
  for (let i = regions.length - 1; i >= 0; i--) {
    result = result.slice(0, regions[i].start) + result.slice(regions[i].end);
  }

  return { cleanText: result.trim(), items };
}



export function parseProgressMarkers(response: string): { cleanText: string; updates: ParsedProgress[] } {
  const { cleanText, items } = parseTaggedBlocks(response, 'PROGRESS');
  const updates: ParsedProgress[] = [];

  for (const parsed of items) {
    if (parsed.item && typeof parsed.correct === 'boolean') {
      updates.push({ item: parsed.item, correct: parsed.correct });
    }
  }
  return { cleanText, updates };
}

// ─── Legacy: strip any [THINK] blocks if the AI still generates them ───

export function stripThinkingBlocks(response: string): string {
  return response.replace(/\[THINK\][^]*?\[\/THINK\]/g, '').trim();
}

/**
 * Detect if the user is asking about a specific Japanese word.
 * Returns the query string if detected, null otherwise.
 */
export function detectDictionaryQuery(message: string): string | null {
  const patterns = [
    /what (?:does|is|means?) ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
    /(?:meaning|definition) of ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
    /([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)(?:の意味|って(?:なに|何)|とは|ってどういう意味)/,
    /look ?up ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
    /translate ["「]?([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]+)["」]?/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}
