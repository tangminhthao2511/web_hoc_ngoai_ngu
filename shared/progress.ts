import { z } from 'zod';
import type { UserState } from '../src/types';

const text = z.string().max(1000);
const id = z.string().min(1).max(200);
const count = z.number().int().min(0).max(1_000_000_000);
const timestamp = z.number().min(0).max(9e15);
const percent = z.number().min(0).max(100);
const strings = z.array(text).max(5000);
const language = z.enum(['en', 'jp']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const tally = z.object({ correct: count, total: count });
const scored = z.object({ completed: count, avgScore: percent });
const skills = z.object({ reading: tally, listening: tally, writing: scored, speaking: scored, grammar: tally, vocabulary: tally });
const navigation = z.enum(['home', 'roadmap', 'english', 'english_ipa', 'english_reading', 'japanese', 'japanese_pronunciation', 'japanese_reading', 'vocabulary', 'practice', 'analytics', 'notes', 'settings']);

// Keys from old backups are accepted and discarded. Credentials never cross the
// persistence boundary, even when imported from an older browser installation.
const aiConfig = z.object({
  provider: z.enum(['demo', 'openai_compatible', 'gemini']),
  model: text.default(''), endpoint: text.default(''),
}).transform(value => ({ provider: value.provider, model: '', endpoint: '', apiKey: '' }));

export const progressSchema = z.object({
  xp: count, streakDays: count, lastActiveDate: z.union([date, z.literal('')]),
  lessonProgress: z.record(id, z.object({
    lessonId: id, completedSteps: z.array(z.number().int().min(0).max(4)).max(5),
    progressPct: percent.optional(), lastStep: z.number().int().min(0).max(4).optional(),
    status: z.enum(['available', 'in_progress', 'completed']),
    bestScore: percent, lastScore: percent, attempts: count,
    completedAt: timestamp.optional(), lastStudiedAt: timestamp.optional(), weakTags: strings,
  })),
  vocabItems: z.array(z.object({
    id, language, word: text, reading: text, romaji: text.optional(), partOfSpeech: text.optional(),
    meaningVi: text, topic: text, levelTag: text, example: z.string().max(10_000), exampleVi: z.string().max(10_000),
    srsState: z.enum(['new', 'learning', 'reviewing', 'mastered']), easeFactor: z.number().min(0).max(10),
    intervalDays: count, repetitions: count, nextReviewAt: timestamp, lastReviewedAt: timestamp.optional(),
    isDifficult: z.boolean().optional(), customLists: strings, sourceLessonId: id.optional(),
  })).max(10_000),
  customVocabLists: strings,
  dailyTasks: z.array(z.object({
    id, title: text, language: z.enum(['en', 'jp', 'both']),
    category: z.enum(['lesson', 'vocab', 'listening', 'quiz', 'custom']),
    targetMinutes: z.number().min(0).max(1440), completed: z.boolean(), date,
    targetNav: navigation.optional(), lessonId: id.optional(),
  })).max(10_000),
  studyLogs: z.record(date, z.object({
    date, englishMinutes: z.number().min(0).max(1e7), japaneseMinutes: z.number().min(0).max(1e7),
    vocabMinutes: z.number().min(0).max(1e7), xpEarned: count, quizzesTaken: count, quizCorrect: count, quizTotal: count,
  })),
  skillStats: z.object({ en: skills, jp: skills }),
  notes: z.array(z.object({
    id, language: z.enum(['en', 'jp', 'general']), title: text, content: z.string().max(100_000),
    tags: strings, lessonId: id.optional(), updatedAt: timestamp,
  })).max(5000),
  unlockedBadges: strings,
  assessments: z.array(z.object({
    id, language, title: text, score: z.number().min(0).max(1e6), maxScore: z.number().min(0).max(1e6),
    breakdown: z.record(id, tally), strengths: strings, weaknesses: strings, takenAt: timestamp,
  })).max(5000),
  settings: z.object({
    userName: text, dailyEnglishMinutes: z.number().min(0).max(1440), dailyJapaneseMinutes: z.number().min(0).max(1440),
    dailyVocabMinutes: z.number().min(0).max(1440), dailyXpGoal: count,
    speechRate: z.number().min(0.1).max(10), unlockAllPreview: z.boolean(), aiConfig,
  }),
  masteredKana: strings, masteredKanji: strings,
}).superRefine((value, context) => {
  for (const name of ['vocabItems', 'dailyTasks', 'notes', 'assessments'] as const) {
    if (new Set(value[name].map(item => item.id)).size !== value[name].length) {
      context.addIssue({ code: 'custom', message: 'Duplicate record id', path: [name] });
    }
  }
  for (const [key, record] of Object.entries(value.lessonProgress)) {
    if (key !== record.lessonId) context.addIssue({ code: 'custom', message: 'Lesson id mismatch', path: ['lessonProgress', key] });
  }
});

export function sanitizeProgress(input: unknown): UserState {
  return progressSchema.parse(input);
}

export interface ProgressResponse {
  state: UserState | null;
  revision: number;
  mutationId: string | null;
  imported: boolean;
}

export const writeProgressSchema = z.object({
  state: progressSchema,
  revision: count,
  mutationId: z.string().uuid(),
  importLegacy: z.boolean().default(false),
});

export const COLLECTIONS = ['lessonProgress', 'vocabItems', 'dailyTasks', 'studyLogs', 'notes', 'assessments'] as const;
export type Collection = typeof COLLECTIONS[number];

export function splitProgress(state: UserState) {
  const { lessonProgress, vocabItems, dailyTasks, studyLogs, notes, assessments, ...summary } = state;
  const collectionData = { lessonProgress, vocabItems, dailyTasks, studyLogs, notes, assessments };
  return {
    summary,
    collections: Object.fromEntries(COLLECTIONS.map(kind => [kind,
      ['lessonProgress', 'studyLogs'].includes(kind)
        ? Object.entries(collectionData[kind]).map(([id, data]) => ({ id, data }))
        : (collectionData[kind] as { id: string }[]).map(data => ({ id: data.id, data })),
    ])) as Record<Collection, { id: string; data: unknown }[]>,
  };
}
