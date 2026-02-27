/**
 * Starter Curriculum — JLPT N5 Seed Data
 *
 * Seeded on first launch so the app has curriculum items and progress
 * data immediately, instead of showing empty screens.
 */

export interface SeedItem {
  title: string;
  type: 'vocab' | 'grammar' | 'kanji';
  jlptLevel: number;
  summary: string;
}

// ─── Vocabulary (15 items) ────────────────────────────────────

const VOCAB: SeedItem[] = [
  { title: 'こんにちは', type: 'vocab', jlptLevel: 5, summary: 'Hello / Good afternoon' },
  { title: 'ありがとう', type: 'vocab', jlptLevel: 5, summary: 'Thank you' },
  { title: 'すみません', type: 'vocab', jlptLevel: 5, summary: 'Excuse me / Sorry' },
  { title: '食べる', type: 'vocab', jlptLevel: 5, summary: 'To eat (たべる)' },
  { title: '飲む', type: 'vocab', jlptLevel: 5, summary: 'To drink (のむ)' },
  { title: '行く', type: 'vocab', jlptLevel: 5, summary: 'To go (いく)' },
  { title: '見る', type: 'vocab', jlptLevel: 5, summary: 'To see / to watch (みる)' },
  { title: '書く', type: 'vocab', jlptLevel: 5, summary: 'To write (かく)' },
  { title: '読む', type: 'vocab', jlptLevel: 5, summary: 'To read (よむ)' },
  { title: '聞く', type: 'vocab', jlptLevel: 5, summary: 'To listen / to ask (きく)' },
  { title: '話す', type: 'vocab', jlptLevel: 5, summary: 'To speak / to talk (はなす)' },
  { title: '大きい', type: 'vocab', jlptLevel: 5, summary: 'Big / large (おおきい)' },
  { title: '小さい', type: 'vocab', jlptLevel: 5, summary: 'Small / little (ちいさい)' },
  { title: '新しい', type: 'vocab', jlptLevel: 5, summary: 'New (あたらしい)' },
  { title: '好き', type: 'vocab', jlptLevel: 5, summary: 'Like / fond of (すき)' },
];

// ─── Grammar (15 items) ───────────────────────────────────────

const GRAMMAR: SeedItem[] = [
  { title: 'は — Topic Marker', type: 'grammar', jlptLevel: 5, summary: 'Marks the topic of a sentence. Ex: 私は学生です。 (I am a student.)' },
  { title: 'です — Copula', type: 'grammar', jlptLevel: 5, summary: 'To be (polite). Ex: これはペンです。 (This is a pen.)' },
  { title: 'を — Object Marker', type: 'grammar', jlptLevel: 5, summary: 'Marks the direct object of a verb. Ex: りんごを食べます。 (I eat an apple.)' },
  { title: 'に — Direction/Time', type: 'grammar', jlptLevel: 5, summary: 'Indicates direction, time, or indirect object. Ex: 七時に起きます。 (I wake up at 7 o\'clock.)' },
  { title: 'で — Location of Action', type: 'grammar', jlptLevel: 5, summary: 'Indicates where an action takes place. Ex: レストランで食べます。 (I eat at a restaurant.)' },
  { title: 'が — Subject Marker', type: 'grammar', jlptLevel: 5, summary: 'Marks the subject (especially with adjectives of feeling). Ex: 日本語が好きです。 (I like Japanese.)' },
  { title: 'も — Also/Too', type: 'grammar', jlptLevel: 5, summary: 'Also, too (replaces は/が). Ex: 私も学生です。 (I am also a student.)' },
  { title: 'か — Question', type: 'grammar', jlptLevel: 5, summary: 'Sentence-ending particle to form a question. Ex: これは何ですか。 (What is this?)' },
  { title: 'の — Possessive', type: 'grammar', jlptLevel: 5, summary: 'Indicates possession or relation. Ex: 私の本です。 (It is my book.)' },
  { title: 'ます — Polite Verb', type: 'grammar', jlptLevel: 5, summary: 'Polite verb ending (present/future). Ex: 毎日勉強します。 (I study every day.)' },
  { title: 'ません — Negative Polite', type: 'grammar', jlptLevel: 5, summary: 'Polite negative verb ending. Ex: 肉を食べません。 (I don\'t eat meat.)' },
  { title: 'ました — Past Polite', type: 'grammar', jlptLevel: 5, summary: 'Polite past tense verb ending. Ex: 昨日映画を見ました。 (I watched a movie yesterday.)' },
  { title: 'たい — Want to', type: 'grammar', jlptLevel: 5, summary: 'Expresses desire to do something. Ex: 日本に行きたいです。 (I want to go to Japan.)' },
  { title: 'から — Because/From', type: 'grammar', jlptLevel: 5, summary: 'Because (reason) / From (origin). Ex: 暑いですから、窓を開けます。 (Because it\'s hot, I\'ll open the window.)' },
  { title: 'て-form — Connecting', type: 'grammar', jlptLevel: 5, summary: 'Connects verbs/adjectives (and, then, please). Ex: 起きて、朝ごはんを食べます。 (I wake up and eat breakfast.)' },
];

// ─── Kanji (20 items) ─────────────────────────────────────────

const KANJI: SeedItem[] = [
  { title: '一', type: 'kanji', jlptLevel: 5, summary: 'One (イチ / ひと). Ex: 一つください。' },
  { title: '二', type: 'kanji', jlptLevel: 5, summary: 'Two (ニ / ふた). Ex: 二人で行きます。' },
  { title: '三', type: 'kanji', jlptLevel: 5, summary: 'Three (サン / み). Ex: 三月です。' },
  { title: '日', type: 'kanji', jlptLevel: 5, summary: 'Day / Sun (ニチ・ジツ / ひ・か). Ex: 日曜日は休みです。' },
  { title: '月', type: 'kanji', jlptLevel: 5, summary: 'Month / Moon (ゲツ・ガツ / つき). Ex: 今月は忙しいです。' },
  { title: '人', type: 'kanji', jlptLevel: 5, summary: 'Person (ジン・ニン / ひと). Ex: あの人は先生です。' },
  { title: '大', type: 'kanji', jlptLevel: 5, summary: 'Big / Large (ダイ・タイ / おお). Ex: 大学に通います。' },
  { title: '小', type: 'kanji', jlptLevel: 5, summary: 'Small / Little (ショウ / ちい・こ). Ex: 小さい犬がいます。' },
  { title: '中', type: 'kanji', jlptLevel: 5, summary: 'Middle / Inside (チュウ / なか). Ex: 箱の中にあります。' },
  { title: '山', type: 'kanji', jlptLevel: 5, summary: 'Mountain (サン / やま). Ex: 山に登ります。' },
  { title: '川', type: 'kanji', jlptLevel: 5, summary: 'River (セン / かわ). Ex: 川で泳ぎます。' },
  { title: '水', type: 'kanji', jlptLevel: 5, summary: 'Water (スイ / みず). Ex: 水を飲みます。' },
  { title: '火', type: 'kanji', jlptLevel: 5, summary: 'Fire (カ / ひ). Ex: 火曜日に会いましょう。' },
  { title: '木', type: 'kanji', jlptLevel: 5, summary: 'Tree / Wood (ボク・モク / き). Ex: 木の下で休みます。' },
  { title: '金', type: 'kanji', jlptLevel: 5, summary: 'Gold / Money (キン・コン / かね). Ex: お金がありません。' },
  { title: '土', type: 'kanji', jlptLevel: 5, summary: 'Earth / Soil (ド・ト / つち). Ex: 土曜日に遊びます。' },
  { title: '学', type: 'kanji', jlptLevel: 5, summary: 'Study / Learn (ガク / まな). Ex: 日本語を学びます。' },
  { title: '生', type: 'kanji', jlptLevel: 5, summary: 'Life / Birth (セイ・ショウ / い・う). Ex: 先生は優しいです。' },
  { title: '食', type: 'kanji', jlptLevel: 5, summary: 'Eat / Food (ショク / た). Ex: 食べ物は何が好きですか。' },
  { title: '車', type: 'kanji', jlptLevel: 5, summary: 'Car / Vehicle (シャ / くるま). Ex: 車で行きます。' },
];

export const STARTER_CURRICULUM: SeedItem[] = [...VOCAB, ...GRAMMAR, ...KANJI];
