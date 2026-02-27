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
  content: {
    reading?: string;
    meaning: string;
    example?: string;
    exampleTranslation?: string;
    pitch?: string;
    mora?: string[];
    // Kanji-specific
    onyomi?: string;
    kunyomi?: string;
    strokeCount?: number;
  };
}

// ─── Vocabulary (15 items) ────────────────────────────────────

const VOCAB: SeedItem[] = [
  {
    title: 'こんにちは',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      meaning: 'Hello / Good afternoon',
      example: 'こんにちは、お元気ですか。',
      exampleTranslation: 'Hello, how are you?',
    },
  },
  {
    title: 'ありがとう',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      meaning: 'Thank you',
      example: 'ありがとうございます。',
      exampleTranslation: 'Thank you very much.',
    },
  },
  {
    title: 'すみません',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      meaning: 'Excuse me / Sorry',
      example: 'すみません、駅はどこですか。',
      exampleTranslation: 'Excuse me, where is the station?',
    },
  },
  {
    title: '食べる',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'たべる',
      meaning: 'To eat',
      example: '朝ごはんを食べます。',
      exampleTranslation: 'I eat breakfast.',
    },
  },
  {
    title: '飲む',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'のむ',
      meaning: 'To drink',
      example: 'お茶を飲みます。',
      exampleTranslation: 'I drink tea.',
    },
  },
  {
    title: '行く',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'いく',
      meaning: 'To go',
      example: '学校に行きます。',
      exampleTranslation: 'I go to school.',
    },
  },
  {
    title: '見る',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'みる',
      meaning: 'To see / to watch',
      example: '映画を見ます。',
      exampleTranslation: 'I watch a movie.',
    },
  },
  {
    title: '書く',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'かく',
      meaning: 'To write',
      example: '手紙を書きます。',
      exampleTranslation: 'I write a letter.',
    },
  },
  {
    title: '読む',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'よむ',
      meaning: 'To read',
      example: '本を読みます。',
      exampleTranslation: 'I read a book.',
    },
  },
  {
    title: '聞く',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'きく',
      meaning: 'To listen / to ask',
      example: '音楽を聞きます。',
      exampleTranslation: 'I listen to music.',
    },
  },
  {
    title: '話す',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'はなす',
      meaning: 'To speak / to talk',
      example: '日本語を話します。',
      exampleTranslation: 'I speak Japanese.',
    },
  },
  {
    title: '大きい',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'おおきい',
      meaning: 'Big / large',
      example: 'あの家は大きいです。',
      exampleTranslation: 'That house is big.',
    },
  },
  {
    title: '小さい',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'ちいさい',
      meaning: 'Small / little',
      example: 'この猫は小さいです。',
      exampleTranslation: 'This cat is small.',
    },
  },
  {
    title: '新しい',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'あたらしい',
      meaning: 'New',
      example: '新しい車を買いました。',
      exampleTranslation: 'I bought a new car.',
    },
  },
  {
    title: '好き',
    type: 'vocab',
    jlptLevel: 5,
    content: {
      reading: 'すき',
      meaning: 'Like / fond of',
      example: '寿司が好きです。',
      exampleTranslation: 'I like sushi.',
    },
  },
];

// ─── Grammar (15 items) ───────────────────────────────────────

const GRAMMAR: SeedItem[] = [
  {
    title: 'は — Topic Marker',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Marks the topic of a sentence',
      example: '私は学生です。',
      exampleTranslation: 'I am a student.',
    },
  },
  {
    title: 'です — Copula',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'To be (polite)',
      example: 'これはペンです。',
      exampleTranslation: 'This is a pen.',
    },
  },
  {
    title: 'を — Object Marker',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Marks the direct object of a verb',
      example: 'りんごを食べます。',
      exampleTranslation: 'I eat an apple.',
    },
  },
  {
    title: 'に — Direction/Time',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Indicates direction, time, or indirect object',
      example: '七時に起きます。',
      exampleTranslation: 'I wake up at 7 o\'clock.',
    },
  },
  {
    title: 'で — Location of Action',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Indicates where an action takes place',
      example: 'レストランで食べます。',
      exampleTranslation: 'I eat at a restaurant.',
    },
  },
  {
    title: 'が — Subject Marker',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Marks the subject (especially with adjectives of feeling)',
      example: '日本語が好きです。',
      exampleTranslation: 'I like Japanese.',
    },
  },
  {
    title: 'も — Also/Too',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Also, too (replaces は/が)',
      example: '私も学生です。',
      exampleTranslation: 'I am also a student.',
    },
  },
  {
    title: 'か — Question',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Sentence-ending particle to form a question',
      example: 'これは何ですか。',
      exampleTranslation: 'What is this?',
    },
  },
  {
    title: 'の — Possessive',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Indicates possession or relation',
      example: '私の本です。',
      exampleTranslation: 'It is my book.',
    },
  },
  {
    title: 'ます — Polite Verb',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Polite verb ending (present/future)',
      example: '毎日勉強します。',
      exampleTranslation: 'I study every day.',
    },
  },
  {
    title: 'ません — Negative Polite',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Polite negative verb ending',
      example: '肉を食べません。',
      exampleTranslation: 'I don\'t eat meat.',
    },
  },
  {
    title: 'ました — Past Polite',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Polite past tense verb ending',
      example: '昨日映画を見ました。',
      exampleTranslation: 'I watched a movie yesterday.',
    },
  },
  {
    title: 'たい — Want to',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Expresses desire to do something',
      example: '日本に行きたいです。',
      exampleTranslation: 'I want to go to Japan.',
    },
  },
  {
    title: 'から — Because/From',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Because (reason) / From (origin)',
      example: '暑いですから、窓を開けます。',
      exampleTranslation: 'Because it\'s hot, I\'ll open the window.',
    },
  },
  {
    title: 'て-form — Connecting',
    type: 'grammar',
    jlptLevel: 5,
    content: {
      meaning: 'Connects verbs/adjectives (and, then, please)',
      example: '起きて、朝ごはんを食べます。',
      exampleTranslation: 'I wake up and eat breakfast.',
    },
  },
];

// ─── Kanji (20 items) ─────────────────────────────────────────

const KANJI: SeedItem[] = [
  {
    title: '一', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'イチ', kunyomi: 'ひと(つ)', meaning: 'One', strokeCount: 1, example: '一つください。', exampleTranslation: 'One, please.' },
  },
  {
    title: '二', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ニ', kunyomi: 'ふた(つ)', meaning: 'Two', strokeCount: 2, example: '二人で行きます。', exampleTranslation: 'Two people will go.' },
  },
  {
    title: '三', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'サン', kunyomi: 'み(つ)', meaning: 'Three', strokeCount: 3, example: '三月です。', exampleTranslation: 'It is March.' },
  },
  {
    title: '日', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ニチ・ジツ', kunyomi: 'ひ・か', meaning: 'Day / Sun', strokeCount: 4, example: '日曜日は休みです。', exampleTranslation: 'Sunday is a day off.' },
  },
  {
    title: '月', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ゲツ・ガツ', kunyomi: 'つき', meaning: 'Month / Moon', strokeCount: 4, example: '今月は忙しいです。', exampleTranslation: 'This month is busy.' },
  },
  {
    title: '人', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ジン・ニン', kunyomi: 'ひと', meaning: 'Person', strokeCount: 2, example: 'あの人は先生です。', exampleTranslation: 'That person is a teacher.' },
  },
  {
    title: '大', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ダイ・タイ', kunyomi: 'おお(きい)', meaning: 'Big / Large', strokeCount: 3, example: '大学に通います。', exampleTranslation: 'I attend university.' },
  },
  {
    title: '小', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ショウ', kunyomi: 'ちい(さい)・こ', meaning: 'Small / Little', strokeCount: 3, example: '小さい犬がいます。', exampleTranslation: 'There is a small dog.' },
  },
  {
    title: '中', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'チュウ', kunyomi: 'なか', meaning: 'Middle / Inside', strokeCount: 4, example: '箱の中にあります。', exampleTranslation: 'It is inside the box.' },
  },
  {
    title: '山', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'サン', kunyomi: 'やま', meaning: 'Mountain', strokeCount: 3, example: '山に登ります。', exampleTranslation: 'I climb the mountain.' },
  },
  {
    title: '川', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'セン', kunyomi: 'かわ', meaning: 'River', strokeCount: 3, example: '川で泳ぎます。', exampleTranslation: 'I swim in the river.' },
  },
  {
    title: '水', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'スイ', kunyomi: 'みず', meaning: 'Water', strokeCount: 4, example: '水を飲みます。', exampleTranslation: 'I drink water.' },
  },
  {
    title: '火', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'カ', kunyomi: 'ひ', meaning: 'Fire', strokeCount: 4, example: '火曜日に会いましょう。', exampleTranslation: 'Let\'s meet on Tuesday.' },
  },
  {
    title: '木', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ボク・モク', kunyomi: 'き', meaning: 'Tree / Wood', strokeCount: 4, example: '木の下で休みます。', exampleTranslation: 'I rest under the tree.' },
  },
  {
    title: '金', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'キン・コン', kunyomi: 'かね', meaning: 'Gold / Money', strokeCount: 8, example: 'お金がありません。', exampleTranslation: 'I don\'t have money.' },
  },
  {
    title: '土', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ド・ト', kunyomi: 'つち', meaning: 'Earth / Soil', strokeCount: 3, example: '土曜日に遊びます。', exampleTranslation: 'I play on Saturday.' },
  },
  {
    title: '学', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ガク', kunyomi: 'まな(ぶ)', meaning: 'Study / Learn', strokeCount: 8, example: '日本語を学びます。', exampleTranslation: 'I study Japanese.' },
  },
  {
    title: '生', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'セイ・ショウ', kunyomi: 'い(きる)・う(まれる)', meaning: 'Life / Birth', strokeCount: 5, example: '先生は優しいです。', exampleTranslation: 'The teacher is kind.' },
  },
  {
    title: '食', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'ショク', kunyomi: 'た(べる)', meaning: 'Eat / Food', strokeCount: 9, example: '食べ物は何が好きですか。', exampleTranslation: 'What food do you like?' },
  },
  {
    title: '車', type: 'kanji', jlptLevel: 5,
    content: { onyomi: 'シャ', kunyomi: 'くるま', meaning: 'Car / Vehicle', strokeCount: 7, example: '車で行きます。', exampleTranslation: 'I go by car.' },
  },
];

export const STARTER_CURRICULUM: SeedItem[] = [...VOCAB, ...GRAMMAR, ...KANJI];
