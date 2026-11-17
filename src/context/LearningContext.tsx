import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BADGE_DEFINITIONS } from '../data/badges';
import { ENGLISH_LESSONS, ENGLISH_MODULES } from '../data/englishCurriculum';
import { INITIAL_VOCAB_ITEMS } from '../data/initialVocab';
import { JAPANESE_LESSONS, JAPANESE_MODULES } from '../data/japaneseCurriculum';
import {
  AssessmentAttempt,
  DailyTask,
  Language,
  LessonData,
  NoteEntry,
  SkillTag,
  UserSettings,
  UserState,
  VocabItem,
} from '../types';
import { ProgressSync } from '../services/progressSync';
import { sanitizeProgress } from '../../shared/progress';
import type { AuthUserSession } from '../utils/auth';
import { getTodayISO } from '../utils/date';
import { gradeVocabItem, SRSRating } from '../utils/srs';


const MODULE_TITLE_MAP = new Map(
  [...ENGLISH_MODULES, ...JAPANESE_MODULES].map((m) => [m.id, m.title])
);

export const ALL_LESSONS: LessonData[] = [...ENGLISH_LESSONS, ...JAPANESE_LESSONS].map((l) => ({
  ...l,
  moduleTitle: l.moduleTitle || MODULE_TITLE_MAP.get(l.moduleId) || `Module ${l.moduleOrder}`,
}));

function buildDefaultDailyTasks(dateStr: string): DailyTask[] {
  return [
    {
      id: `task-en-${dateStr}`,
      title: 'Học 1 bài Tiếng Anh B1→B2',
      language: 'en',
      category: 'lesson',
      targetMinutes: 25,
      completed: false,
      date: dateStr,
      targetNav: 'roadmap',
    },
    {
      id: `task-jp-${dateStr}`,
      title: 'Học 1 bài Tiếng Nhật N5',
      language: 'jp',
      category: 'lesson',
      targetMinutes: 20,
      completed: false,
      date: dateStr,
      targetNav: 'roadmap',
    },
    {
      id: `task-vocab-${dateStr}`,
      title: 'Ôn tập từ vựng SRS (Anh & Nhật)',
      language: 'both',
      category: 'vocab',
      targetMinutes: 10,
      completed: false,
      date: dateStr,
      targetNav: 'vocabulary',
    },
    {
      id: `task-listen-${dateStr}`,
      title: 'Luyện nghe hoặc phát âm nhanh',
      language: 'both',
      category: 'listening',
      targetMinutes: 10,
      completed: false,
      date: dateStr,
      targetNav: 'practice',
    },
    {
      id: `task-quiz-${dateStr}`,
      title: 'Hoàn thành 1 bài kiểm tra ngắn',
      language: 'both',
      category: 'quiz',
      targetMinutes: 5,
      completed: false,
      date: dateStr,
      targetNav: 'practice',
    },
  ];
}

export function createInitialState(): UserState {
  const today = getTodayISO();
  return {
    xp: 0,
    streakDays: 0,
    lastActiveDate: '',
    lessonProgress: {},
    vocabItems: INITIAL_VOCAB_ITEMS,
    customVocabLists: [
      'Công sở B2',
      'Tech & AI',
      'IELTS / B2 Core',
      'Phrasal Verbs & Idioms',
      'Wellbeing',
      'Writing Connectors',
      'N5 Thiết yếu',
      'Giao tiếp N5',
      'Đồ ăn & Quán xá',
      'Động từ N5',
      'Tính từ N5',
    ],
    dailyTasks: buildDefaultDailyTasks(today),
    studyLogs: {},
    skillStats: {
      en: {
        reading: { correct: 0, total: 0 },
        listening: { correct: 0, total: 0 },
        writing: { completed: 0, avgScore: 0 },
        speaking: { completed: 0, avgScore: 0 },
        grammar: { correct: 0, total: 0 },
        vocabulary: { correct: 0, total: 0 },
      },
      jp: {
        reading: { correct: 0, total: 0 },
        listening: { correct: 0, total: 0 },
        writing: { completed: 0, avgScore: 0 },
        speaking: { completed: 0, avgScore: 0 },
        grammar: { correct: 0, total: 0 },
        vocabulary: { correct: 0, total: 0 },
      },
    },
    notes: [
      {
        id: 'note-welcome',
        language: 'general',
        title: 'Mục tiêu học tập song ngữ của tôi',
        content:
          '• Tiếng Anh: Củng cố B1, nâng cấp Collocations & Ngữ pháp phức để vững vàng B2.\n• Tiếng Nhật: Thuộc 46 Hiragana + 46 Katakana trước, sau đó học song song Trợ từ N5 và Kanji theo nhóm Hán Việt.',
        tags: ['Kế hoạch', 'Mục tiêu'],
        updatedAt: Date.now(),
      },
    ],
    unlockedBadges: [],
    assessments: [],
    settings: {
      userName: 'Bạn',
      dailyEnglishMinutes: 25,
      dailyJapaneseMinutes: 20,
      dailyVocabMinutes: 10,
      dailyXpGoal: 50,
      speechRate: 0.95,
      unlockAllPreview: false,
      aiConfig: {
        provider: 'demo',
        apiKey: '',
        model: '',
        endpoint: '',
      },
    },
    masteredKana: [],
    masteredKanji: [],
  };
}

export function hydrateLearningState(parsed: UserState): UserState {
  const base = createInitialState();
  const today = getTodayISO();
  const existingIds = new Set(parsed.vocabItems.map(item => item.id));
  return {
    ...parsed,
    vocabItems: [...parsed.vocabItems, ...INITIAL_VOCAB_ITEMS.filter(item => !existingIds.has(item.id))],
    customVocabLists: Array.from(new Set([...parsed.customVocabLists, ...base.customVocabLists])),
    dailyTasks: parsed.dailyTasks.some(task => task.date === today)
      ? parsed.dailyTasks : [...parsed.dailyTasks.slice(-10), ...buildDefaultDailyTasks(today)],
  };
}

interface LearningContextValue {
  sync: ReturnType<ProgressSync['getSnapshot']>;
  retrySync: () => Promise<void>;
  reloadRemoteProgress: () => Promise<void>;
  flushProgress: () => Promise<void>;
  hasLegacyProgress: boolean;
  importLegacyProgress: () => boolean;
  state: UserState;
  todayISO: string;
  todayXP: number;
  userLevel: number;
  isLessonUnlocked: (lesson: LessonData) => boolean;
  getLessonStatus: (lesson: LessonData) => 'locked' | 'available' | 'in_progress' | 'completed';
  markLessonStep: (lessonId: string, stepIndex: number) => void;
  setLessonProgressPct: (lessonId: string, pct: number, stepIndex?: number) => void;
  completeLesson: (params: {
    lesson: LessonData;
    scorePercent: number;
    skillResults: { skill: SkillTag; correct: boolean }[];
    weakTags: string[];
    minutesSpent: number;
  }) => { xpAwarded: number; newlyUnlockedBadges: string[] };
  recordPracticeResult: (params: {
    language: Language;
    skill: SkillTag;
    correct: number;
    total: number;
    minutes: number;
    xp: number;
  }) => void;
  toggleDailyTask: (taskId: string) => void;
  addDailyTask: (task: Omit<DailyTask, 'id' | 'date' | 'completed'>) => void;
  deleteDailyTask: (taskId: string) => void;
  rescheduleUnfinishedTasks: () => void;
  reviewVocabCard: (vocabId: string, rating: SRSRating) => void;
  addVocabItem: (item: Omit<VocabItem, 'id' | 'srsState' | 'easeFactor' | 'intervalDays' | 'repetitions' | 'nextReviewAt'>) => void;
  toggleVocabDifficult: (vocabId: string) => void;
  markVocabMastered: (vocabId: string) => void;
  addCustomVocabList: (name: string) => void;
  toggleMasteredKana: (char: string) => void;
  toggleMasteredKanji: (char: string) => void;
  saveNote: (note: Omit<NoteEntry, 'id' | 'updatedAt'> & { id?: string }) => void;
  deleteNote: (id: string) => void;
  saveAssessment: (attempt: Omit<AssessmentAttempt, 'id' | 'takenAt'>) => void;
  updateSettings: (partial: Partial<UserSettings>) => void;
  resetAllProgress: () => void;
  importProgressJSON: (json: string) => boolean;
  getLanguageStats: (lang: Language) => {
    totalLessons: number;
    completedLessons: number;
    completionPct: number;
    avgQuizScore: number;
    estimatedProficiencyPct: number;
    totalMinutes: number;
    vocabMastered: number;
    vocabTotal: number;
    currentLesson: LessonData | undefined;
    weakTags: string[];
  };
}

const LearningContext = createContext<LearningContextValue | null>(null);

export const LearningProvider: React.FC<{ children: React.ReactNode; session: AuthUserSession; onLogout: () => void }> = ({ children, session, onLogout }) => {
  const [controller] = useState(() => new ProgressSync(session, () => {
    const initial = createInitialState();
    initial.settings.userName = session.name;
    return initial;
  }, hydrateLearningState));
  const sync = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const state = sync.state;
  const setState = controller.update;
  const todayISO = getTodayISO();

  useEffect(() => {
    void controller.start();
    const resume = () => { void controller.retry(); };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    return () => {
      controller.stop();
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
    };
  }, [controller]);

  const applyActivityAndBadges = (draft: UserState, xpDelta: number, lang: Language | 'vocab', minutes: number, quizCorrect = 0, quizTotal = 0): { next: UserState; newlyUnlocked: string[] } => {
    const today = getTodayISO();
    const prevLog = draft.studyLogs[today] || {
      date: today,
      englishMinutes: 0,
      japaneseMinutes: 0,
      vocabMinutes: 0,
      xpEarned: 0,
      quizzesTaken: 0,
      quizCorrect: 0,
      quizTotal: 0,
    };

    const nextLog = {
      ...prevLog,
      englishMinutes: prevLog.englishMinutes + (lang === 'en' ? minutes : 0),
      japaneseMinutes: prevLog.japaneseMinutes + (lang === 'jp' ? minutes : 0),
      vocabMinutes: prevLog.vocabMinutes + (lang === 'vocab' ? minutes : 0),
      xpEarned: prevLog.xpEarned + xpDelta,
      quizzesTaken: prevLog.quizzesTaken + (quizTotal > 0 ? 1 : 0),
      quizCorrect: prevLog.quizCorrect + quizCorrect,
      quizTotal: prevLog.quizTotal + quizTotal,
    };

    // Update streak if first activity today
    let nextStreak = draft.streakDays;
    if (draft.lastActiveDate !== today && (xpDelta > 0 || minutes > 0)) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
        yesterday.getDate()
      ).padStart(2, '0')}`;
      nextStreak = draft.lastActiveDate === yISO ? draft.streakDays + 1 : 1;
    }

    const updated: UserState = {
      ...draft,
      xp: draft.xp + xpDelta,
      streakDays: nextStreak,
      lastActiveDate: xpDelta > 0 || minutes > 0 ? today : draft.lastActiveDate,
      studyLogs: {
        ...draft.studyLogs,
        [today]: nextLog,
      },
    };

    const newlyUnlocked: string[] = [];
    for (const badge of BADGE_DEFINITIONS) {
      if (!updated.unlockedBadges.includes(badge.id) && badge.check(updated)) {
        newlyUnlocked.push(badge.id);
      }
    }
    if (newlyUnlocked.length > 0) {
      updated.unlockedBadges = [...updated.unlockedBadges, ...newlyUnlocked];
    }

    return { next: updated, newlyUnlocked };
  };

  const isLessonUnlocked = (lesson: LessonData): boolean => {
    if (state.settings.unlockAllPreview) return true;
    if (lesson.prerequisites.length === 0) return true;
    return lesson.prerequisites.every((pid) => state.lessonProgress[pid]?.status === 'completed');
  };

  const getLessonStatus = (lesson: LessonData): 'locked' | 'available' | 'in_progress' | 'completed' => {
    const rec = state.lessonProgress[lesson.id];
    if (rec?.status === 'completed') return 'completed';
    if (!isLessonUnlocked(lesson)) return 'locked';
    if (rec?.status === 'in_progress' || (rec?.completedSteps?.length || 0) > 0) return 'in_progress';
    return 'available';
  };

  const markLessonStep = (lessonId: string, stepIndex: number) => {
    setState((prev) => {
      const existing = prev.lessonProgress[lessonId] || {
        lessonId,
        completedSteps: [],
        progressPct: 0,
        lastStep: 0,
        status: 'in_progress' as const,
        bestScore: 0,
        lastScore: 0,
        attempts: 0,
        weakTags: [],
      };
      const steps = existing.completedSteps.includes(stepIndex)
        ? existing.completedSteps
        : [...existing.completedSteps, stepIndex].sort((a, b) => a - b);

      const stepDerivedPct = Math.min(95, Math.round((steps.length / 5) * 100));
      const nextPct =
        existing.status === 'completed'
          ? 100
          : Math.max(existing.progressPct || 0, stepDerivedPct);

      return {
        ...prev,
        lessonProgress: {
          ...prev.lessonProgress,
          [lessonId]: {
            ...existing,
            completedSteps: steps,
            progressPct: nextPct,
            lastStep: stepIndex,
            status: existing.status === 'completed' ? 'completed' : 'in_progress',
            lastStudiedAt: Date.now(),
          },
        },
      };
    });
  };

  const setLessonProgressPct = (lessonId: string, rawPct: number, stepIndex?: number) => {
    const pct = Math.max(0, Math.min(100, Math.round(rawPct)));
    setState((prev) => {
      if (pct === 0) {
        const nextMap = { ...prev.lessonProgress };
        delete nextMap[lessonId];
        return { ...prev, lessonProgress: nextMap };
      }

      const existing = prev.lessonProgress[lessonId] || {
        lessonId,
        completedSteps: [],
        progressPct: 0,
        lastStep: 0,
        status: 'in_progress' as const,
        bestScore: 0,
        lastScore: 0,
        attempts: 0,
        weakTags: [],
      };

      const derivedStepsCount = pct >= 100 ? 5 : Math.max(1, Math.min(4, Math.ceil(pct / 20)));
      const derivedSteps = Array.from({ length: derivedStepsCount }, (_, i) => i);
      const resolvedStep =
        typeof stepIndex === 'number' ? stepIndex : Math.max(0, Math.min(4, derivedStepsCount - 1));

      return {
        ...prev,
        lessonProgress: {
          ...prev.lessonProgress,
          [lessonId]: {
            ...existing,
            completedSteps: pct >= 100 ? [0, 1, 2, 3, 4] : derivedSteps,
            progressPct: pct,
            lastStep: resolvedStep,
            status: pct >= 100 ? 'completed' : 'in_progress',
            bestScore: pct >= 100 ? Math.max(existing.bestScore || 0, 100) : existing.bestScore,
            lastScore: pct >= 100 ? Math.max(existing.lastScore || 0, 100) : existing.lastScore,
            completedAt: pct >= 100 ? existing.completedAt || Date.now() : existing.completedAt,
            lastStudiedAt: Date.now(),
          },
        },
      };
    });
  };

  const completeLesson: LearningContextValue['completeLesson'] = ({
    lesson,
    scorePercent,
    skillResults,
    weakTags,
    minutesSpent,
  }) => {
    let xpAwarded = 0;
    let newlyUnlockedBadges: string[] = [];

    setState((prev) => {
      const existing = prev.lessonProgress[lesson.id];
      const alreadyCompleted = existing?.status === 'completed';
      xpAwarded = alreadyCompleted ? Math.round(lesson.xpReward * 0.35) : lesson.xpReward;

      const nextStats = structuredClone(prev.skillStats);
      const langStats = nextStats[lesson.language];
      for (const r of skillResults) {
        const key =
          r.skill === 'reading' || r.skill === 'kana' || r.skill === 'kanji'
            ? 'reading'
            : r.skill === 'listening'
            ? 'listening'
            : r.skill === 'vocabulary'
            ? 'vocabulary'
            : 'grammar';
        langStats[key].total += 1;
        if (r.correct) langStats[key].correct += 1;
      }
      if (lesson.applyTask.mode === 'speaking') {
        const prevC = langStats.speaking.completed;
        langStats.speaking.avgScore = Math.round((langStats.speaking.avgScore * prevC + scorePercent) / (prevC + 1));
        langStats.speaking.completed += 1;
      } else {
        const prevC = langStats.writing.completed;
        langStats.writing.avgScore = Math.round((langStats.writing.avgScore * prevC + scorePercent) / (prevC + 1));
        langStats.writing.completed += 1;
      }

      const nextVocab = prev.vocabItems.map((v) =>
        lesson.lessonVocabIds?.includes(v.id) && v.srsState === 'new'
          ? { ...v, srsState: 'learning' as const }
          : v
      );

      const draft: UserState = {
        ...prev,
        skillStats: nextStats,
        vocabItems: nextVocab,
        lessonProgress: {
          ...prev.lessonProgress,
          [lesson.id]: {
            lessonId: lesson.id,
            completedSteps: [0, 1, 2, 3, 4],
            progressPct: 100,
            lastStep: 4,
            status: 'completed',
            bestScore: Math.max(existing?.bestScore || 0, scorePercent),
            lastScore: scorePercent,
            attempts: (existing?.attempts || 0) + 1,
            completedAt: existing?.completedAt || Date.now(),
            lastStudiedAt: Date.now(),
            weakTags,
          },
        },
      };

      const qCorrect = skillResults.filter((s) => s.correct).length;
      const res = applyActivityAndBadges(draft, xpAwarded, lesson.language, minutesSpent, qCorrect, skillResults.length);
      newlyUnlockedBadges = res.newlyUnlocked;
      return res.next;
    });

    return { xpAwarded, newlyUnlockedBadges };
  };

  const recordPracticeResult: LearningContextValue['recordPracticeResult'] = ({
    language,
    skill,
    correct,
    total,
    minutes,
    xp,
  }) => {
    setState((prev) => {
      const nextStats = structuredClone(prev.skillStats);
      const langStats = nextStats[language];
      if (skill === 'speaking') {
        const pct = total > 0 ? Math.round((correct / total) * 100) : 80;
        const c = langStats.speaking.completed;
        langStats.speaking.avgScore = Math.round((langStats.speaking.avgScore * c + pct) / (c + 1));
        langStats.speaking.completed += 1;
      } else if (skill === 'writing') {
        const pct = total > 0 ? Math.round((correct / total) * 100) : 80;
        const c = langStats.writing.completed;
        langStats.writing.avgScore = Math.round((langStats.writing.avgScore * c + pct) / (c + 1));
        langStats.writing.completed += 1;
      } else {
        const key =
          skill === 'listening'
            ? 'listening'
            : skill === 'vocabulary'
            ? 'vocabulary'
            : skill === 'reading' || skill === 'kana' || skill === 'kanji'
            ? 'reading'
            : 'grammar';
        langStats[key].correct += correct;
        langStats[key].total += total;
      }

      const draft: UserState = { ...prev, skillStats: nextStats };
      return applyActivityAndBadges(draft, xp, language, minutes, correct, total).next;
    });
  };

  const toggleDailyTask = (taskId: string) => {
    setState((prev) => {
      const target = prev.dailyTasks.find((t) => t.id === taskId);
      if (!target) return prev;
      const nextCompleted = !target.completed;
      const updatedTasks = prev.dailyTasks.map((t) => (t.id === taskId ? { ...t, completed: nextCompleted } : t));
      const draft = { ...prev, dailyTasks: updatedTasks };
      if (nextCompleted) {
        const langArg = target.language === 'both' ? 'vocab' : target.language;
        return applyActivityAndBadges(draft, 10, langArg, Math.min(target.targetMinutes, 10)).next;
      }
      return draft;
    });
  };

  const addDailyTask: LearningContextValue['addDailyTask'] = (task) => {
    setState((prev) => ({
      ...prev,
      dailyTasks: [
        ...prev.dailyTasks,
        {
          ...task,
          id: `task-custom-${crypto.randomUUID()}`,
          date: getTodayISO(),
          completed: false,
        },
      ],
    }));
  };

  const deleteDailyTask = (taskId: string) => {
    setState((prev) => ({
      ...prev,
      dailyTasks: prev.dailyTasks.filter((t) => t.id !== taskId),
    }));
  };

  const rescheduleUnfinishedTasks = () => {
    const today = getTodayISO();
    setState((prev) => ({
      ...prev,
      dailyTasks: prev.dailyTasks.map((t) => (!t.completed ? { ...t, date: today } : t)),
    }));
  };

  const reviewVocabCard = (vocabId: string, rating: SRSRating) => {
    setState((prev) => {
      let lang: Language = 'en';
      const updated = prev.vocabItems.map((v) => {
        if (v.id === vocabId) {
          lang = v.language;
          return gradeVocabItem(v, rating);
        }
        return v;
      });
      const nextStats = structuredClone(prev.skillStats);
      nextStats[lang].vocabulary.total += 1;
      if (rating !== 'again') nextStats[lang].vocabulary.correct += 1;

      const draft: UserState = { ...prev, vocabItems: updated, skillStats: nextStats };
      return applyActivityAndBadges(draft, rating === 'again' ? 2 : 5, 'vocab', 1, rating !== 'again' ? 1 : 0, 1).next;
    });
  };

  const addVocabItem: LearningContextValue['addVocabItem'] = (item) => {
    setState((prev) => ({
      ...prev,
      vocabItems: [
        {
          ...item,
          id: `vocab-${crypto.randomUUID()}`,
          srsState: 'new',
          easeFactor: 2.5,
          intervalDays: 0,
          repetitions: 0,
          nextReviewAt: Date.now(),
        },
        ...prev.vocabItems,
      ],
    }));
  };

  const toggleVocabDifficult = (vocabId: string) => {
    setState((prev) => ({
      ...prev,
      vocabItems: prev.vocabItems.map((v) => (v.id === vocabId ? { ...v, isDifficult: !v.isDifficult } : v)),
    }));
  };

  const markVocabMastered = (vocabId: string) => {
    setState((prev) => ({
      ...prev,
      vocabItems: prev.vocabItems.map((v) =>
        v.id === vocabId
          ? {
              ...v,
              srsState: 'mastered',
              isDifficult: false,
              intervalDays: 30,
              nextReviewAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            }
          : v
      ),
    }));
  };

  const addCustomVocabList = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setState((prev) =>
      prev.customVocabLists.includes(clean)
        ? prev
        : { ...prev, customVocabLists: [...prev.customVocabLists, clean] }
    );
  };

  const toggleMasteredKana = (char: string) => {
    setState((prev) => {
      const exists = prev.masteredKana.includes(char);
      const next = exists ? prev.masteredKana.filter((c) => c !== char) : [...prev.masteredKana, char];
      return { ...prev, masteredKana: next };
    });
  };

  const toggleMasteredKanji = (char: string) => {
    setState((prev) => {
      const exists = prev.masteredKanji.includes(char);
      const next = exists ? prev.masteredKanji.filter((c) => c !== char) : [...prev.masteredKanji, char];
      return { ...prev, masteredKanji: next };
    });
  };

  const saveNote: LearningContextValue['saveNote'] = (note) => {
    setState((prev) => {
      if (note.id) {
        return {
          ...prev,
          notes: prev.notes.map((n) => (n.id === note.id ? { ...n, ...note, updatedAt: Date.now() } : n)),
        };
      }
      return {
        ...prev,
        notes: [
          {
            ...note,
            id: `note-${crypto.randomUUID()}`,
            updatedAt: Date.now(),
          },
          ...prev.notes,
        ],
      };
    });
  };

  const deleteNote = (id: string) => {
    setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
  };

  const saveAssessment: LearningContextValue['saveAssessment'] = (attempt) => {
    setState((prev) => {
      const fullAttempt: AssessmentAttempt = {
        ...attempt,
        id: `assess-${crypto.randomUUID()}`,
        takenAt: Date.now(),
      };
      const pct = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
      const draft: UserState = {
        ...prev,
        assessments: [fullAttempt, ...prev.assessments],
      };
      return applyActivityAndBadges(draft, Math.max(25, Math.round(pct * 0.8)), attempt.language, 15, attempt.score, attempt.maxScore).next;
    });
  };

  const updateSettings = (partial: Partial<UserSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...partial },
    }));
  };

  const resetAllProgress = () => {
    const fresh = createInitialState();
    setState(fresh);
  };

  const importProgressJSON = (json: string): boolean => {
    try {
      const parsed = sanitizeProgress(JSON.parse(json));
      setState(hydrateLearningState(parsed));
      return true;
    } catch {
      return false;
    }
  };

  const getLanguageStats = (lang: Language) => {
    const lessons = lang === 'en' ? ENGLISH_LESSONS : JAPANESE_LESSONS;
    const completed = lessons.filter((l) => state.lessonProgress[l.id]?.status === 'completed');
    const totalPctSum = lessons.reduce((sum, l) => {
      const rec = state.lessonProgress[l.id];
      if (!rec) return sum;
      if (rec.status === 'completed') return sum + 100;
      const pct =
        typeof rec.progressPct === 'number'
          ? rec.progressPct
          : Math.min(90, (rec.completedSteps?.length || 0) * 20);
      return sum + pct;
    }, 0);
    const completionPct = lessons.length > 0 ? Math.round(totalPctSum / lessons.length) : 0;

    const scores = completed
      .map((l) => state.lessonProgress[l.id]?.lastScore)
      .filter((s): s is number => typeof s === 'number');
    const avgQuizScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Proficiency estimates combine lesson coverage AND actual quiz/assessment performance
    const latestAssess = state.assessments.find((a) => a.language === lang);
    const assessPct = latestAssess && latestAssess.maxScore > 0 ? (latestAssess.score / latestAssess.maxScore) * 100 : avgQuizScore;
    const estimatedProficiencyPct =
      completed.length === 0 && !latestAssess
        ? 0
        : Math.round(completionPct * 0.45 + assessPct * 0.55);

    const totalMinutes = Object.values(state.studyLogs).reduce(
      (sum, log) => sum + (lang === 'en' ? log.englishMinutes : log.japaneseMinutes),
      0
    );

    const langVocab = state.vocabItems.filter((v) => v.language === lang);
    const vocabMastered = langVocab.filter((v) => v.srsState === 'mastered' || v.srsState === 'reviewing').length;

    const inProgressLessons = lessons
      .filter((l) => state.lessonProgress[l.id]?.status === 'in_progress')
      .sort(
        (a, b) =>
          (state.lessonProgress[b.id]?.lastStudiedAt || 0) -
          (state.lessonProgress[a.id]?.lastStudiedAt || 0)
      );

    const currentLesson =
      inProgressLessons[0] ||
      lessons.find((l) => getLessonStatus(l) === 'available') ||
      lessons[lessons.length - 1];

    const weakTags = Array.from(
      new Set(
        lessons.flatMap((l) => state.lessonProgress[l.id]?.weakTags || [])
      )
    );

    return {
      totalLessons: lessons.length,
      completedLessons: completed.length,
      completionPct,
      avgQuizScore,
      estimatedProficiencyPct,
      totalMinutes,
      vocabMastered,
      vocabTotal: langVocab.length,
      currentLesson,
      weakTags,
    };
  };

  const todayXP = state.studyLogs[todayISO]?.xpEarned || 0;
  const userLevel = Math.floor(state.xp / 120) + 1;

  const value = useMemo<LearningContextValue>(
    () => ({
      sync,
      retrySync: controller.retry,
      reloadRemoteProgress: controller.reloadRemote,
      flushProgress: controller.flush,
      hasLegacyProgress: controller.hasLegacy(),
      importLegacyProgress: controller.importLegacy,
      state,
      todayISO,
      todayXP,
      userLevel,
      isLessonUnlocked,
      getLessonStatus,
      markLessonStep,
      setLessonProgressPct,
      completeLesson,
      recordPracticeResult,
      toggleDailyTask,
      addDailyTask,
      deleteDailyTask,
      rescheduleUnfinishedTasks,
      reviewVocabCard,
      addVocabItem,
      toggleVocabDifficult,
      markVocabMastered,
      addCustomVocabList,
      toggleMasteredKana,
      toggleMasteredKanji,
      saveNote,
      deleteNote,
      saveAssessment,
      updateSettings,
      resetAllProgress,
      importProgressJSON,
      getLanguageStats,
    }),
    [state, todayISO, sync]
  );

  return <LearningContext.Provider value={value}>
    {sync.ready ? children : <div className="min-h-screen flex items-center justify-center p-6 bg-[#F6F6F4]">
      <div className="max-w-md space-y-4 rounded-2xl bg-white p-6" role="status">
        <h1 className="text-xl font-bold">{sync.status === 'loading' ? 'Đang tải tiến độ học…' : 'Chưa tải được tiến độ'}</h1>
        <p>{sync.error || 'Vui lòng đợi để tiếp tục học.'}</p>
        {sync.status === 'error' && <button className="rounded-full bg-black text-white px-4 py-2" onClick={() => void controller.retry()}>Thử lại</button>}
        <button className="ml-3 underline" onClick={onLogout}>Đăng xuất</button>
      </div>
    </div>}
  </LearningContext.Provider>;
};

export function useLearning(): LearningContextValue {
  const ctx = useContext(LearningContext);
  if (!ctx) throw new Error('useLearning must be used inside LearningProvider');
  return ctx;
}
