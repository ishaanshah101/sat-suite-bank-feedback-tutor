// Settings the student can change under Export & settings. Saved under KEYS.prefs. Missing keys fall
// back to DEFAULT_PREFS, so a new toggle needs no migration.

import { KEYS, kv } from "./store";

export interface Prefs {
  /** Pacing timer strip + seconds recorded per question. */
  timer: boolean;
  /** Show the cropper before each upload. */
  cropBeforeSend: boolean;
  /** On Question Bank pages, read the page text first: warn if the answer isn't revealed, and cross-check the capture. */
  pageCheck: boolean;
  hotkeys: boolean;
  /** Daily reminder notification if you haven't practiced (needs the optional "notifications" permission). */
  reminders: boolean;
  reminderHour: number;
  dailyGoal: number;
  /** Speak the rule statement aloud after each card. */
  autoSpeak: boolean;
  /** On Question Bank pages, send a clean render of the page text instead of a screenshot. */
  textCapture: boolean;
  /** Show the "how to attack this question type" card. */
  strategies: boolean;
  /** Ask "how sure were you?" before explaining. */
  askConfidence: boolean;
  /** YYYY-MM-DD of the student's SAT, for the countdown. */
  testDate: string | null;
  /** Side panel zoom: 0.9 | 1 | 1.1 | 1.25 */
  zoom: number;
  /** Banner when the question on screen is already in the local log (seen.ts). */
  seenBefore: boolean;
  /** "Paste a question" box under the capture button (paste.ts). */
  pastePanel: boolean;
  /** "Practice offline" card: rule flashcards and redo my misses (practice-ui.ts). */
  practice: boolean;
  /** "Today's plan" checklist above Capture (plan.ts). */
  plan: boolean;
  /** Badges card and "Badge earned" toasts (achievements.ts). */
  badges: boolean;
  /** "Practice a Question Bank export" card: an offline quiz from a pasted export (qbquiz.ts, qbquiz-ui.ts). */
  qbQuiz: boolean;
  /** Skill map card: all 29 official skills colored by how you do (skillmap.ts). */
  skillMap: boolean;
  /** Word bank card: Words in Context vocabulary from your cards, with Anki export (vocab.ts). */
  wordBank: boolean;
  /** Activity card: a 16-week practice heatmap with streaks (calendar.ts). */
  activity: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  timer: true,
  cropBeforeSend: false,
  pageCheck: true,
  hotkeys: true,
  reminders: false,
  reminderHour: 19,
  dailyGoal: 10,
  autoSpeak: false,
  textCapture: true,
  strategies: true,
  askConfidence: true,
  testDate: null,
  zoom: 1,
  seenBefore: true,
  pastePanel: true,
  practice: true,
  plan: true,
  badges: true,
  qbQuiz: true,
  skillMap: true,
  wordBank: true,
  activity: true,
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (v: unknown, min: number, max: number, fallback: number, integer = false) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fallback;

/** Saved prefs with every value checked: a wrong type or an out-of-range number falls back to the default. */
export function sanitizePrefs(raw: unknown): Prefs {
  const r = isObj(raw) ? raw : {};
  const out = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const v = r[key];
    if (typeof DEFAULT_PREFS[key] === "boolean" && typeof v === "boolean") (out as Record<string, unknown>)[key] = v;
  }
  out.reminderHour = num(r.reminderHour, 0, 23, DEFAULT_PREFS.reminderHour, true);
  out.dailyGoal = num(r.dailyGoal, 1, 100, DEFAULT_PREFS.dailyGoal, true);
  out.zoom = num(r.zoom, 0.5, 2, DEFAULT_PREFS.zoom);
  out.testDate = typeof r.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.testDate) ? r.testDate : null;
  return out;
}

export async function readPrefs(): Promise<Prefs> {
  return sanitizePrefs(await kv().get<unknown>(KEYS.prefs));
}
export async function writePrefs(p: Prefs): Promise<void> {
  await kv().set(KEYS.prefs, p);
}
