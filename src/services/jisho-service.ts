/**
 * Jisho Dictionary Service
 *
 * Wraps the public Jisho API to provide ground-truth
 * definitions for Japanese words. Used to augment
 * the tutor's knowledge and prevent hallucinated meanings.
 */

// ─── Types ───────────────────────────────────────────────────

export interface JishoReading {
  word?: string;
  reading: string;
}

export interface JishoSense {
  english_definitions: string[];
  parts_of_speech: string[];
  tags: string[];
  info: string[];
}

export interface JishoResult {
  slug: string;
  is_common: boolean;
  jlpt: string[];
  japanese: JishoReading[];
  senses: JishoSense[];
}

// ─── Public API ──────────────────────────────────────────────

const JISHO_API = 'https://jisho.org/api/v1/search/words';
const TIMEOUT_MS = 4000;

/**
 * Look up a word using the Jisho API.
 * Returns parsed results or an empty array on failure.
 */
export async function lookupWord(query: string): Promise<JishoResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `${JISHO_API}?keyword=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'JapaneseTutorApp/1.0' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`Jisho API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data?.data || !Array.isArray(data.data)) {
      return [];
    }

    // Return top 3 results
    return data.data.slice(0, 3).map((item: any) => ({
      slug: item.slug || '',
      is_common: item.is_common || false,
      jlpt: item.jlpt || [],
      japanese: (item.japanese || []).map((j: any) => ({
        word: j.word,
        reading: j.reading,
      })),
      senses: (item.senses || []).slice(0, 3).map((s: any) => ({
        english_definitions: s.english_definitions || [],
        parts_of_speech: s.parts_of_speech || [],
        tags: s.tags || [],
        info: s.info || [],
      })),
    }));
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('Jisho API request timed out');
    } else {
      console.warn('Jisho API error:', err?.message || err);
    }
    return [];
  }
}

/**
 * Format Jisho results into a compact string for the tutor's context.
 */
export function formatForTutor(results: JishoResult[]): string {
  if (results.length === 0) return 'No dictionary results found.';

  const lines: string[] = [];

  for (const result of results.slice(0, 2)) {
    const primary = result.japanese[0];
    const word = primary?.word || primary?.reading || result.slug;
    const reading = primary?.reading || '';

    const header = reading && word !== reading
      ? `📖 ${word} (${reading})`
      : `📖 ${word}`;

    const jlptTag = result.jlpt.length > 0
      ? ` [${result.jlpt.join(', ')}]`
      : '';

    const commonTag = result.is_common ? ' ★common' : '';

    lines.push(`${header}${jlptTag}${commonTag}`);

    for (let i = 0; i < result.senses.length && i < 2; i++) {
      const sense = result.senses[i];
      const pos = sense.parts_of_speech.length > 0
        ? `(${sense.parts_of_speech.join(', ')}) `
        : '';
      const defs = sense.english_definitions.join('; ');
      lines.push(`  ${i + 1}. ${pos}${defs}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}
