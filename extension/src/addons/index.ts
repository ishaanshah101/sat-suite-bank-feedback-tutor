// Rulecard add-ons controller. ONE object the existing sidepanel.ts talks to through a few
// hooks, render slots and the panel's tabs (Home, Progress, Practice, Words, Settings). See docs/CLAUDE_HANDOFF.md (feature catalog, checklist) and
// docs/UPSTREAM-0.3.0.md (line-by-line hook spots in upstream 0.3.0).
// It also wires offline practice (flashcards.ts, redo.ts, practice-ui.ts), capture anywhere
// (selection.ts, paste.ts), seen before (seen.ts), the weekly report (report.ts) and the coach:
// today's plan (plan.ts), badges (achievements.ts) and traps you fall for (traps.ts). Wave 5 adds the
// Question Bank export quiz (qbquiz.ts, qbquiz-ui.ts), the skill map (skillmap.ts) and the word bank (vocab.ts).

import { badgeProgress, badgeToast, renderBadges, syncBadges, writeBadges, type BadgeInput, type EarnedBadges } from "./achievements";
import { chip, h, spinner } from "./dom";
import { BACKUP_MAX_BYTES, cardAsText, downloadText, filterScope, openPrintable, parseBackup, stamp, toAnkiCsv, toBackup, toMarkdown, toPrintableHtml, type ExportScope } from "./export";
import { createDeck, deckCounts, type DeckState } from "./flashcards";
import { HOTKEY_HELP, installHotkeys, type HotkeyActions } from "./hotkeys";
import { defaultFilter, renderJournal, type JournalFilter } from "./journal";
import { clearLog, entryFromExplain, importEntries, readLog, recordAttempt, recordDrill, updateEntry, type LogEntry, type SelfConfidence } from "./log";
import {
  answerQuiz, createQuiz, currentAnswer, currentQuestion, finishQuiz, isFinished, nextQuiz, parseExport, previewOf, QUIZ_KEY, quizKey, quizProgress,
  quizSummary, readQuizStore, recordResult, resumeQuiz, retryMisses, saveActive, skipQuiz, toParsedQB, writeQuizStore,
  type ParsedExport, type QuizQuestion, type QuizResult, type QuizState,
} from "./qbquiz";
import { QUIZ_TEXT_MAX, renderQuiz, renderQuizEntry, renderQuizResult, type QuizStartOptions } from "./qbquiz-ui";
import { buildPlan, renderPlan } from "./plan";
import { pressPracticeKey, renderFlashcards, renderPracticeEntry, renderRedo, type PracticeHandlers, type PracticeMode } from "./practice-ui";
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "./prefs";
import { renderProgress } from "./progress";
import { createRedo, readRedo, recordRedo, REDO_KEY, redoQueue, redoStats, writeRedo, type RedoState, type RedoStore } from "./redo";
import { buildWeeklyReport, renderReportTools } from "./report";
import { renderSkillMap, skillMap } from "./skillmap";
import { addToSet, emptySets, endSet, readSets, startSet, writeSets, type SetState } from "./sets";
import { KEYS, kv } from "./store";
import { downloadDataUrl, renderShareImage } from "./share";
import { applyAttempt, applyReview, describeDue, dueRules, nextDue, readSrs, rebuildFromLog, writeSrs, type RuleSrs, type SrsState } from "./srs";
import { countdown, insights, MATH_TARGET_SECONDS, summarize, TARGET_SECONDS, targetSecondsFor, type Summary } from "./stats";
import { renderQuestionImage } from "./textcapture";
import { renderTraps, trapReport } from "./traps";
import { emptyTimer, formatClock, lap, readTimer, renderTimer, writeTimer, type TimerState } from "./timer";
import { hasChoices, LETTERS, type AddonContext, type ApiExplainResponse, type ApiPick, type DrillCheckResponse, type ExplainResponse, type Letter, type Question } from "./types";
import { collectWords, renderWordBank } from "./vocab";
import { activityModel, renderCalendar } from "./calendar";
import { errorLogFilename, errorLogRows, toErrorLogCsv, toErrorLogTsv } from "./errorlog";
import {
  answerWord, createWordQuiz, currentWord, currentWordAnswer, finishWordQuiz, isWordQuizFinished, nextWord, readWordRecord,
  saveWordResults, wordQuizAvailability, wordQuizKey, wordQuizProgress, wordQuizSummary, WORDQUIZ_KEY, writeWordRecord, type WordQuizState,
} from "./wordquiz";
import { renderWordQuiz, renderWordQuizEntry, renderWordQuizResult } from "./wordquiz-ui";


/** What the add-ons need to call back into sidepanel.ts. All optional except processImage. */
export interface HostBridge {
  getQuestion(): Question | null;
  getExplained(): { attemptId: string; picked: Letter | "correct" } | null;
  /** sidepanel.ts: read the question in this picture, explain it, and record `picked` when it is known. */
  processImage(image: string, picked?: Letter | null): Promise<void>;
  /** Resolves once the host has read its saved settings (boot), so ready() knows whose data it loads. */
  settingsReady?: Promise<void>;
  capture?(): void;
  pick?(letter: Letter | "correct"): void;
  explain?(): void;
  testMe?(): void;
  focusChat?(): void;
}

interface DrillData {
  drillId: string;
  ruleId: string;
  ruleName: string;
  /** 0.3.0: "spr" for a grid-in drill, which comes with choices: null. */
  format?: "mcq" | "spr";
  question: { passage?: string | null; stem: string; choices: Record<Letter, string> | null };
}

interface ReviewUi {
  open: boolean;
  /** A specific rule to review next, even if it isn't due (from the Journal). */
  forced: string | null;
  rule: RuleSrs | null;
  drill: DrillData | null;
  picked: Letter | null;
  result: DrillCheckResponse | null;
  loading: boolean;
  error: string | null;
  /** Rules passed over in this session (a grid-in drill, or Skip), so the queue moves on. */
  skipped: string[];
  done: number;
  correct: number;
}

const freshReview = (): ReviewUi => ({ open: false, forced: null, rule: null, drill: null, picked: null, result: null, loading: false, error: null, skipped: [], done: 0, correct: 0 });

/** The review has no typed-answer box, so a grid-in drill is skipped with this message. */
const GRID_IN_SKIP = "This one needs a typed answer, so it is skipped here.";


/** The side panel's tabs. Home is the capture-and-explain flow; everything else waits one click away. */
export type PanelTab = "home" | "plan" | "progress" | "practice" | "words" | "settings";
export const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "plan", label: "Plan" },
  { id: "progress", label: "Progress" },
  { id: "practice", label: "Practice" },
  { id: "words", label: "Words" },
  { id: "settings", label: "Settings" },
];

/** An open offline practice screen. */
type Practice = { mode: "flashcards"; deck: DeckState } | { mode: "redo"; redo: RedoState };

/** chrome.storage.local: the account (id, or email on older sign-ins) whose study data is on this device. */
export const OWNER_KEY = "rc.addons.owner.v1";
/** Every add-on key, for the wipe when another account signs in. */
export const ADDON_KEYS: readonly string[] = [...Object.values(KEYS), REDO_KEY, QUIZ_KEY, WORDQUIZ_KEY];

export function createAddons(ctx: AddonContext, host: HostBridge) {
  const s = {
    /** Which tab of the side panel is showing. */
    tab: "home" as PanelTab,
    prefs: { ...DEFAULT_PREFS } as Prefs,
    log: [] as LogEntry[],
    srs: {} as SrsState,
    timer: emptyTimer() as TimerState,
    sets: emptySets() as SetState,
    summary: null as Summary | null,
    review: freshReview(),
    confidence: null as SelfConfidence | null,
    journal: defaultFilter() as JournalFilter,
    showHelp: false,
    strategyOpen: false,
    lastSeconds: null as number | null,
    toast: null as string | null,
    practice: null as Practice | null,
    redoStore: {} as RedoStore,
    /** achievements.ts: badge id -> when it was earned. */
    badges: {} as EarnedBadges,
    /** The next extract came from a right-click selection or a paste, not from the active tab. */
    fromElsewhere: false,
    /** qbquiz.ts: the Question Bank export quiz on screen (or its results). null when there is none. */
    quiz: null as QuizState | null,
    /** Finished quizzes, newest first (qbquiz.ts keeps 20). */
    quizHistory: [] as QuizResult[],
    /** The quiz is set aside (a slim strip on top) while Rulecard explains one of its misses. */
    quizPaused: false,
    quizBusy: false,
    /** Seconds the student spent on the quiz question being explained. afterExtract logs it instead of a timer lap. */
    quizSeconds: null as number | null,
    /** The paste box of "Practice a Question Bank export". Kept in memory only. */
    quizEntry: { open: false, text: "", parsed: null as ParsedExport | null },
    /** wordquiz.ts: "Quiz me on my words" on screen (or its results). Memory only. */
    wordQuiz: null as WordQuizState | null,
    wordQuizN: 10,
    /** Capturing is allowed on every site (the optional <all_urls> grant). Cached: contains() is async. */
  };
  /** Handlers of the practice screen on view, for the hotkeys. */
  let practiceView: { mode: PracticeMode; handlers: PracticeHandlers } | null = null;

  const recompute = () => {
    s.summary = summarize(s.log, s.srs);
  };
  const toast = (msg: string) => {
    s.toast = msg;
    ctx.rerender();
    setTimeout(() => {
      if (s.toast === msg) { s.toast = null; ctx.rerender(); }
    }, 2200);
  };
  const badgeInput = (): BadgeInput => ({ log: s.log, srs: s.srs, recaps: s.sets.recap ? [s.sets.recap] : [], dailyGoal: s.prefs.dailyGoal });
  /** Save any newly earned badges. Returns the toast line ("" when nothing is new or badges are off). */
  const checkBadges = async (): Promise<string> => {
    const { badges, fresh } = await syncBadges(badgeInput());
    s.badges = badges;
    return s.prefs.badges && fresh.length ? badgeToast(fresh) : "";
  };
  const applyZoom = () => {
    if (typeof document !== "undefined" && document.body) (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(s.prefs.zoom || 1);
  };

  let unhook: (() => void) | null = null;

  /** Read everything saved on this device into s. */
  async function load(): Promise<void> {
    [s.prefs, s.log, s.srs, s.timer, s.sets, s.redoStore] = await Promise.all([readPrefs(), readLog(), readSrs(), readTimer(), readSets(), readRedo()]);
    if (!Object.keys(s.srs).length && s.log.length) {
      s.srs = rebuildFromLog(s.log);
      await writeSrs(s.srs);
    }
    const quizStore = await readQuizStore();
    // A quiz left open picks up where it was. The clock restarts on an unanswered question.
    s.quiz = quizStore.active ? resumeQuiz(quizStore.active, Date.now()) : null;
    s.quizPaused = false;
    s.quizHistory = quizStore.history;
    recompute();
    s.badges = (await syncBadges(badgeInput())).badges;
  }

  /**
   * Tie the local study data to the signed-in account. Data left by a different account is wiped first.
   * A fresh profile (no marker yet) is claimed as is, so the first sign-in keeps what was there. Returns true after a wipe.
   */
  async function claimOwner(): Promise<boolean> {
    const settings = ctx.settings;
    const owner = settings?.userId || settings?.email || null;
    if (!owner) return false;
    // Older sign-ins only saved the email, so a marker holding this account's email is still this account.
    const mine = new Set([settings.userId, settings.email].filter((x): x is string => Boolean(x)));
    const prev = await kv().get<unknown>(OWNER_KEY);
    let wiped = false;
    if (typeof prev === "string" && !mine.has(prev)) {
      for (const key of ADDON_KEYS) await kv().remove(key);
      s.review = freshReview();
      s.practice = null;
      practiceView = null;
      s.wordQuiz = null;
      s.quizEntry = { open: false, text: "", parsed: null };
      wiped = true;
    }
    if (prev !== owner) await kv().set(OWNER_KEY, owner);
    return wiped;
  }

  const ready = (async () => {
    try {
      await host.settingsReady;
      await claimOwner();
      await load();
      applyZoom();
      if (s.prefs.hotkeys) unhook = installHotkeys(hotkeyActions);
    } catch (error) {
      console.error("Rulecard: couldn't load the local study data", error);
      toast("Couldn't load your local study data");
    }
    ctx.rerender();
  })();

  /** Call after a sign-in: another account's data is wiped and the add-ons reload. */
  async function accountChanged(): Promise<void> {
    await ready;
    try {
      if (await claimOwner()) {
        await load();
        ctx.rerender();
      }
    } catch (error) {
      console.error("Rulecard: couldn't switch the local study data", error);
      toast("Couldn't load your local study data");
    }
  }

  // ---------------------------------------------------------------- questions from elsewhere

  // A miss from the Question Bank export quiz goes through the same processImage as a PDF question.
  const captureHost = {
    processImage: async (image: string, picked: Letter | null = null) => {
      s.fromElsewhere = true;
      try {
        await host.processImage(image, picked);
      } catch (error) {
        s.fromElsewhere = false;
        throw error;
      }
    },
  };

  /** Show a tab (and start it at the top). */
  function showTab(tab: PanelTab) {
    if (s.tab === tab) return;
    s.tab = tab;
    ctx.rerender();
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function hotkeyActions(): HotkeyActions {
    // Keys act on the tab you can see: a quiz waiting on another tab never eats a letter meant for Home.
    if (s.tab === "words") return s.wordQuiz ? { raw: pressWordQuizKey, help: toggleHelp } : { capture: () => host.capture?.(), help: toggleHelp };
    if (s.tab === "practice") {
      if (s.review.loading) return { help: toggleHelp };
      if (s.quiz && !s.quizPaused) return { raw: pressQuizKey, help: toggleHelp };
      if (s.practice && practiceView) {
        const v = practiceView;
        return { raw: (key) => pressPracticeKey(v.handlers, key, v.mode), help: toggleHelp };
      }
      const r = s.review;
      if (r.open && r.drill && !r.result) {
        return { pick: (l: Letter) => void answerReview(l), help: toggleHelp };
      }
      if (r.open && r.result) return { review: () => void nextReview(), help: toggleHelp };
      return { capture: () => host.capture?.(), review: () => void startReview(), help: toggleHelp };
    }
    if (s.tab !== "home") return { capture: () => host.capture?.(), help: toggleHelp };
    return {
      pick: (l: Letter) => host.pick?.(l),
      capture: () => host.capture?.(),
      review: s.review.loading ? undefined : () => void startReview(),
      copyCard: () => void copyCurrentCard(),
      help: toggleHelp,
    };
  }
  function toggleHelp() {
    s.showHelp = !s.showHelp;
    ctx.rerender();
  }

  /** Call after processImage() succeeds (state.question is set). */
  async function afterExtract(question: Question): Promise<void> {
    // Read it before the first await: the next capture resets it.
    const elsewhere = s.fromElsewhere;
    s.fromElsewhere = false;
    const quizSeconds = s.quizSeconds;
    s.quizSeconds = null;
    if (s.prefs.timer) {
      if (quizSeconds !== null) {
        // A miss from the Question Bank export quiz: log the time the student took in the quiz, not a lap.
        s.lastSeconds = quizSeconds;
      } else {
        const res = lap(s.timer, Date.now());
        s.timer = res.state;
        s.lastSeconds = res.seconds;
        await writeTimer(s.timer);
      }
    }
    s.confidence = null;
    void elsewhere;
    void question;
    ctx.rerender();
  }

  /**
   * Call after /api/explain succeeds, with the raw response, the pick (a letter, "correct", or "spr"
   * for a typed grid-in answer) and, for grid-in, the typed answer.
   */
  async function afterExplain(data: ExplainResponse | ApiExplainResponse, picked: ApiPick, typed: string | null = null): Promise<void> {
    try {
      await afterExplainInner(data, picked, typed);
    } catch (error) {
      console.warn("Rulecard: couldn't save this card on the device", error);
      toast("Couldn't save this card on this device");
    }
  }

  async function afterExplainInner(data: ExplainResponse | ApiExplainResponse, picked: ApiPick, typed: string | null): Promise<void> {
    const entry = entryFromExplain(data, picked, { seconds: s.prefs.timer ? s.lastSeconds : null, selfConfidence: s.confidence, typed });
    s.log = await recordAttempt(entry);
    s.srs = applyAttempt(s.srs, entry, entry.at);
    await writeSrs(s.srs);
    let setDone = false;
    if (s.sets.active) {
      s.sets = addToSet(s.sets, entry.attemptId, s.log, Date.now());
      await writeSets(s.sets);
      setDone = Boolean(s.sets.recap && !s.sets.active);
    }
    recompute();
    const earned = await checkBadges();
    if (setDone || earned) toast([setDone ? "Set complete" : "", earned].filter(Boolean).join(". "));
    if (s.prefs.autoSpeak) speak(`${data.rule?.name ?? ""}. ${data.card.rule_statement}`);
    ctx.rerender();
  }

  /** Call after /api/drill/check succeeds in the normal (non-review) Test me flow. */
  async function afterDrillCheck(attemptId: string, correct: boolean): Promise<void> {
    try {
      await recordDrill(attemptId, correct, false);
      s.log = await readLog();
    } catch (error) {
      console.warn("Rulecard: couldn't save the drill result", error);
      return;
    }
    recompute();
    ctx.rerender();
  }

  // ---------------------------------------------------------------- review queue

  const due = () => dueRules(s.srs, Date.now());
  /** Due rules this review session hasn't passed over. */
  const queueLeft = () => due().filter((d) => !s.review.skipped.includes(d.ruleId));

  /** Set a quiz aside (a strip on top) so a review or a deck is visible. A finished quiz is closed. */
  function parkQuiz() {
    if (!s.quiz) return;
    if (isFinished(s.quiz)) setQuiz(null);
    else s.quizPaused = true;
  }

  async function startReview(ruleId?: string): Promise<void> {
    if (s.review.loading) return;
    parkQuiz();
    if (ruleId && !s.srs[ruleId]) {
      // Not scheduled yet (shouldn't happen, but older logs may predate the scheduler).
      const latest = s.log.find((e) => e.ruleId === ruleId);
      if (latest) { s.srs = applyAttempt(s.srs, latest, latest.at); await writeSrs(s.srs); }
    }
    s.review = { ...freshReview(), open: true, forced: ruleId ?? null };
    s.practice = null;
    s.tab = "practice";
    await nextReview();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function nextReview(): Promise<void> {
    const r = s.review;
    const forced = r.forced ? s.srs[r.forced] ?? null : null;
    r.forced = null;
    const rule = forced ?? queueLeft()[0] ?? null;
    Object.assign(r, { rule, drill: null, picked: null, result: null, error: null, loading: Boolean(rule) });
    ctx.rerender();
    if (!rule) return;
    try {
      const d = await ctx.request<DrillData>(ctx.settings, "/api/drill", { body: { attemptId: rule.attemptId } });
      // A Math rule can come back as a grid-in drill (choices: null). Skip it instead of crashing.
      if (d.format === "spr" || !hasChoices(d.question.choices)) r.error = GRID_IN_SKIP;
      else r.drill = d;
    } catch (error) {
      r.error = ctx.describe(error);
    } finally {
      r.loading = false;
      ctx.rerender();
    }
  }

  async function answerReview(letter: Letter): Promise<void> {
    const r = s.review;
    if (!r.drill || r.result || r.picked || !r.rule) return;
    r.picked = letter;
    ctx.rerender();
    try {
      r.result = await ctx.request<DrillCheckResponse>(ctx.settings, "/api/drill/check", { body: { drillId: r.drill.drillId, picked: letter } });
      r.done++;
      if (r.result.correct) r.correct++;
      s.srs = applyReview(s.srs, r.rule.ruleId, r.result.correct, Date.now());
      await writeSrs(s.srs);
      await recordDrill(r.rule.attemptId, r.result.correct, true);
      s.log = await readLog();
      recompute();
      const earned = await checkBadges();
      if (earned) toast(earned);
    } catch (error) {
      r.error = ctx.describe(error);
      r.picked = null;
    }
    ctx.rerender();
  }

  function renderReview(): HTMLElement | null {
    const r = s.review;
    const dueList = due();
    if (!r.open) {
      if (!Object.keys(s.srs).length) return null;
      const next = nextDue(s.srs, Date.now());
      return h(
        "div",
        { class: "card rc-review-cta" },
        h(
          "div",
          { class: "row between" },
          h("div", null, h("h2", { text: "Review" }), h("p", { class: "small", text: dueList.length ? `${dueList.length} rule${dueList.length === 1 ? "" : "s"} due` : next ? `Nothing due. Next review ${describeDue(next.due, Date.now())}.` : "Nothing due." })),
          dueList.length ? h("button", { class: "btn primary", onclick: () => void startReview(), title: "R" }, `Review ${dueList.length}`) : null,
        ),
        dueList.length ? h("div", { class: "row rc-wrap" }, ...dueList.slice(0, 6).map((d) => chip(d.ruleName ? `${d.ruleId} · ${d.ruleName}` : d.ruleId, d.lapses > 1 ? "danger" : "accent"))) : null,
      );
    }
    const header = h(
      "div",
      { class: "row between" },
      h("h2", { text: `Review${r.done ? ` · ${r.correct}/${r.done}` : ""}` }),
      h("button", { class: "btn link small", text: "Done", onclick: () => { s.review = freshReview(); ctx.rerender(); } }),
    );
    if (!r.rule) {
      return h("div", { class: "card" }, header, h("div", { class: "banner good" }, h("p", { class: "stem", text: r.done ? `Done. ${r.correct} of ${r.done} right.` : "Nothing due right now." }), h("p", { class: "small muted", text: "Missed rules come back tomorrow. Ones you get right come back after longer and longer gaps." })));
    }
    const children: (Node | null)[] = [header, h("div", { class: "row" }, chip(r.rule.ruleName ? `${r.rule.ruleId} · ${r.rule.ruleName}` : r.rule.ruleId, "accent"), chip(`box ${r.rule.box}/6`))];
    if (r.loading) children.push(h("p", { class: "muted small row" }, spinner(), "Writing a fresh question on this rule..."));
    if (r.drill) {
      const d = r.drill;
      children.push(
        d.question.passage ? h("div", { class: "passage", text: d.question.passage }) : null,
        h("p", { class: "stem", text: d.question.stem }),
        h(
          "ol",
          { class: "choices" },
          ...LETTERS.map((letter) => {
            const isPick = r.picked === letter;
            const isCorrect = r.result?.correctLetter === letter;
            // NB: "picked" (red row). v0.2.0's renderDrill uses "pick" here, which is the 36px letter-button style — a bug.
            const cls = r.result ? (isCorrect ? "correct" : isPick ? "picked" : "") : isPick ? "selected" : "selectable";
            return h("li", { class: `choice ${cls}`.trim(), onclick: () => void answerReview(letter) }, h("span", { class: "letter", text: `${letter}.` }), h("span", { text: d.question.choices?.[letter] ?? "" }));
          }),
        ),
      );
    }
    if (r.result) {
      children.push(
        h("div", { class: `banner ${r.result.correct ? "good" : "danger"}` },
          h("p", { class: "stem", text: r.result.correct ? "Right. This rule's next review is pushed further out." : `Not quite. The answer is ${r.result.correctLetter ?? r.result.correctAnswer ?? "not available"}. This rule comes back tomorrow.` }),
          h("p", { text: r.result.correct ? r.result.whyCorrect : r.result.fix ?? r.result.whyCorrect }),
        ),
        h("button", { class: "btn primary", onclick: () => void nextReview(), title: "R" }, queueLeft().length ? `Next rule (${queueLeft().length} left)` : "Finish"),
      );
    }
    if (r.error) {
      const gridIn = r.error === GRID_IN_SKIP;
      children.push(h("div", { class: `banner ${gridIn ? "warn" : "danger"}`, role: "alert", text: r.error }), h("button", { class: "btn", text: "Skip this rule", onclick: () => {
        if (r.rule) {
          r.skipped.push(r.rule.ruleId);
          // A failed request counts as a miss so the rule comes back tomorrow. A grid-in drill is not a miss.
          if (!gridIn) { s.srs = applyReview(s.srs, r.rule.ruleId, false, Date.now()); void writeSrs(s.srs); }
        }
        void nextReview();
      } }));
    }
    return h("div", { class: "card rc-review" }, ...children);
  }

  // ---------------------------------------------------------------- offline practice (flashcards, redo)

  function openPractice(p: Practice) {
    parkQuiz();
    s.review = freshReview();
    s.practice = p;
    s.tab = "practice";
    ctx.rerender();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function quitPractice() {
    s.practice = null;
    practiceView = null;
    recompute();
    ctx.rerender();
  }

  /** The practice screen when one is open, else the entry card (null when there is nothing to practice). */
  function renderPractice(): HTMLElement | null {
    const p = s.practice;
    if (!p) {
      practiceView = null;
      if (!s.prefs.practice || s.review.open) return null;
      const counts = deckCounts(s.log, s.srs, Date.now());
      return renderPracticeEntry({ due: counts.due, weak: counts.weak, misses: redoQueue(s.log, s.redoStore).length }, {
        flashcards: (extra) => openPractice({ mode: "flashcards", deck: createDeck(s.log, s.srs, Date.now(), { extra }) }),
        redo: () => openPractice({ mode: "redo", redo: createRedo(s.log, s.redoStore, Date.now()) }),
      });
    }
    const view = p.mode === "flashcards"
      ? renderFlashcards(p.deck, {
        update: (deck) => { s.practice = { mode: "flashcards", deck }; ctx.rerender(); },
        saveSrs: (srs) => { s.srs = srs; void writeSrs(srs); recompute(); void checkBadges().then((m) => { if (m) toast(m); }); },
        getSrs: () => s.srs,
        quit: quitPractice,
      })
      : renderRedo(p.redo, {
        update: (redo) => { s.practice = { mode: "redo", redo }; ctx.rerender(); },
        saveAnswer: (attemptId, attempt) => void recordRedo(attemptId, attempt).then((store) => { s.redoStore = store; if (!s.practice) ctx.rerender(); }),
        quit: quitPractice,
      }, { stats: redoStats(s.log, s.redoStore) });
    practiceView = { mode: p.mode, handlers: view.handlers };
    return view.el;
  }

  // ---------------------------------------------------------------- Question Bank export quiz (qbquiz.ts)

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Show and save a quiz state (null closes it). Records the result once, when the quiz finishes. */
  function setQuiz(next: QuizState | null) {
    const prev = s.quiz;
    s.quiz = next;
    if (!next) s.quizPaused = false;
    void saveActive(next).catch((error) => console.warn("Rulecard: couldn't save the quiz", error));
    if (next && isFinished(next) && !(prev && prev.id === next.id && isFinished(prev))) {
      void recordResult(next).then((store) => { s.quizHistory = store.history; });
    }
    ctx.rerender();
  }

  function startQuiz(opts: QuizStartOptions) {
    const parsed = s.quizEntry.parsed;
    if (!parsed?.questions.length) return;
    s.review = freshReview();
    s.practice = null;
    s.quizEntry.open = false;
    s.tab = "practice";
    setQuiz(createQuiz(parsed.questions, { now: Date.now(), shuffle: opts.shuffle, limit: opts.limit }));
    scrollTop();
  }

  /** Quit: the results when something was answered, else just close. On the results screen, close. */
  function quitQuiz() {
    const st = s.quiz;
    if (!st) return;
    if (isFinished(st)) return setQuiz(null);
    setQuiz(quizProgress(st).answered ? finishQuiz(st, Date.now()) : null);
  }

  function nextInQuiz() {
    const st = s.quiz;
    if (!st || isFinished(st)) return;
    setQuiz(currentQuestion(st) ? nextQuiz(st, Date.now()) : finishQuiz(st, Date.now()));
  }

  /** Hotkeys while the quiz is on screen: 1-4 and A-D answer, Enter or Space go on, Esc quits. */
  // ---------------------------------------------------------------- word quiz (Quiz me on my words)

  function setWordQuiz(next: WordQuizState | null) {
    const prev = s.wordQuiz;
    s.wordQuiz = next;
    if (next && isWordQuizFinished(next) && !(prev && prev.id === next.id && isWordQuizFinished(prev))) {
      void saveWordResults(next, Date.now()).catch((error) => console.warn("Rulecard: couldn't save word quiz results", error));
    }
    ctx.rerender();
  }

  async function startWordQuiz(n: number) {
    s.wordQuizN = n;
    const record = await readWordRecord().catch(() => ({}));
    s.tab = "words";
    setWordQuiz(createWordQuiz(collectWords(s.log), record, { now: Date.now(), n }));
    window.scrollTo({ top: 0 });
  }

  function quitWordQuiz() {
    const st = s.wordQuiz;
    if (st && !isWordQuizFinished(st) && wordQuizProgress(st).answered) setWordQuiz(finishWordQuiz(st, Date.now()));
    else setWordQuiz(null);
  }

  function pressWordQuizKey(key: string): boolean {
    const st = s.wordQuiz;
    if (!st) return false;
    if (key === "Escape") { quitWordQuiz(); return true; }
    const k = wordQuizKey(key);
    if (!k) return false;
    if (isWordQuizFinished(st)) {
      if (key !== "Enter") return false;
      setWordQuiz(null);
      return true;
    }
    const answered = !currentWord(st) || currentWordAnswer(st) !== null;
    if (k === "next") { if (!answered) return false; setWordQuiz(nextWord(st, Date.now())); return true; }
    if (answered) return false;
    setWordQuiz(answerWord(st, k, Date.now()));
    return true;
  }

  function renderWordQuizSlot(): HTMLElement | null {
    const st = s.wordQuiz;
    if (!st) return null;
    if (isWordQuizFinished(st)) {
      return renderWordQuizResult(wordQuizSummary(st), { again: () => void startWordQuiz(s.wordQuizN), done: () => setWordQuiz(null) });
    }
    return renderWordQuiz(st, {
      pick: (l) => { if (!currentWordAnswer(st)) setWordQuiz(answerWord(st, l, Date.now())); },
      next: () => setWordQuiz(nextWord(st, Date.now())),
      quit: quitWordQuiz,
    });
  }

  function renderWordBankCard(): HTMLElement {
    const words = collectWords(s.log);
    const card = renderWordBank(words, { download: downloadText });
    if (words.length && !s.wordQuiz) card.append(renderWordQuizEntry(wordQuizAvailability(words), { start: (n) => void startWordQuiz(n) }));
    return card;
  }

  function pressQuizKey(key: string): boolean {
    const st = s.quiz;
    if (!st) return false;
    if (key === "Escape") { quitQuiz(); return true; }
    const k = quizKey(key);
    if (!k) return false;
    if (isFinished(st)) {
      // Results: Enter is Done. Space keeps scrolling the page.
      if (key !== "Enter") return false;
      setQuiz(null);
      return true;
    }
    const answered = !currentQuestion(st) || currentAnswer(st) !== null;
    // Before an answer, Space scrolls and Enter does nothing. After one, letters do nothing.
    if (k === "next") { if (!answered) return false; nextInQuiz(); return true; }
    if (answered) return false;
    setQuiz(answerQuiz(st, k, Date.now()));
    return true;
  }

  /** "Explain with Rulecard" on a quiz miss: the clean question render goes to /api/extract (one
   *  capture), the student's pick is preselected and the card explains it. The quiz waits in a strip. */
  async function explainQuizMiss(q: QuizQuestion, picked: Letter) {
    const st = s.quiz;
    if (!st || s.quizBusy) return;
    const qi = st.questions.findIndex((x) => x === q || (q.qbId !== null && x.qbId === q.qbId));
    s.quizBusy = true;
    s.quizPaused = true;
    s.tab = "home";
    ctx.rerender();
    try {
      const image = await renderQuestionImage(toParsedQB(q));
      s.quizSeconds = qi >= 0 ? st.answers[qi]?.seconds ?? null : null;
      await captureHost.processImage(image, picked);
    } catch (error) {
      s.quizSeconds = null;
      s.quizPaused = false;
      toast(ctx.describe(error));
    } finally {
      s.quizBusy = false;
      ctx.rerender();
    }
  }

  /** Top slot while a quiz exists: the question, the results, or a slim strip while a miss is explained. */
  function renderQuizSlot(): HTMLElement | null {
    const st = s.quiz;
    if (!st) return null;
    const done = isFinished(st);
    if (s.quizPaused) {
      const p = quizProgress(st);
      return h("div", { class: "rc-setbar active rc-quiz-strip row between small" },
        h("span", null, h("b", { text: "Question Bank practice" }),
          h("span", { class: "muted", text: s.quizBusy ? " · getting the question ready..." : done ? " · results saved" : ` · paused at ${p.number} of ${p.total}` })),
        h("button", {
          class: "btn small",
          disabled: s.quizBusy,
          onclick: () => { s.quizPaused = false; s.tab = "practice"; setQuiz(done ? st : resumeQuiz(st, Date.now())); scrollTop(); },
        }, done ? "Back to results" : "Back to quiz"));
    }
    const explain = (q: QuizQuestion, picked: Letter) => void explainQuizMiss(q, picked);
    if (done) {
      return renderQuizResult(quizSummary(st), {
        retry: () => { if (s.quiz) setQuiz(retryMisses(s.quiz, Date.now())); scrollTop(); },
        done: () => setQuiz(null),
        explain,
      });
    }
    return renderQuiz(st, {
      pick: (l) => { if (s.quiz) setQuiz(answerQuiz(s.quiz, l, Date.now())); },
      next: nextInQuiz,
      skip: () => { if (s.quiz) setQuiz(skipQuiz(s.quiz, Date.now())); },
      quit: quitQuiz,
      explain,
    });
  }

  /** "Practice a Question Bank export" (collapsed, in the bottom area) while no quiz is open. */
  function renderQuizEntryCard(): HTMLElement | null {
    if (!s.prefs.qbQuiz || s.quiz) return null;
    const e = s.quizEntry;
    const last = s.quizHistory[0] ?? null;
    const entry = renderQuizEntry({ text: e.text, preview: e.parsed ? previewOf(e.parsed) : null, last }, {
      input: (text) => {
        if (text.length > QUIZ_TEXT_MAX) {
          e.text = "";
          e.parsed = null;
          return { found: 0, skipped: 0, message: "That paste is too big. Paste one export at a time (under 2 MB of text)." };
        }
        e.text = text;
        e.parsed = text.trim() ? parseExport(text) : null;
        return e.parsed ? previewOf(e.parsed) : null;
      },
      start: startQuiz,
    });
    return h("details", { class: "card rc-quiz-box", open: e.open ? "" : null, ontoggle: (ev: Event) => { e.open = (ev.target as HTMLDetailsElement).open; } },
      h("summary", null, h("h2", { text: "Practice a Question Bank export" }),
        h("span", { class: "small muted", text: last ? `last: ${last.right} of ${last.total}` : "offline quiz" })),
      entry);
  }

  // ---------------------------------------------------------------- practice sets

  async function beginSet(target: number) {
    s.sets = startSet(target, Date.now());
    await writeSets(s.sets);
    if (s.prefs.timer) { s.timer = { ...emptyTimer(), startedAt: Date.now() }; await writeTimer(s.timer); }
    ctx.rerender();
  }
  async function finishSet() {
    s.sets = endSet(s.sets, s.log, Date.now());
    await writeSets(s.sets);
    ctx.rerender();
  }
  async function dismissRecap() {
    s.sets = { ...s.sets, recap: null };
    await writeSets(s.sets);
    ctx.rerender();
  }

  // ---------------------------------------------------------------- today's plan (plan.ts)

  function renderPlanCard(): HTMLElement | null {
    if (!s.prefs.plan || s.review.open) return null;
    const plan = buildPlan({ log: s.log, srs: s.srs, now: Date.now(), dailyGoal: s.prefs.dailyGoal, testDate: s.prefs.testDate });
    return renderPlan(plan, {
      startReview: () => void startReview(),
      openFlashcards: s.prefs.practice ? () => openPractice({ mode: "flashcards", deck: createDeck(s.log, s.srs, Date.now()) }) : undefined,
      startSet: s.sets.active ? undefined : (n) => void beginSet(n),
      copy: (text) => void navigator.clipboard.writeText(text).then(() => toast("Plan copied"), () => toast("Couldn't copy")),
    });
  }

  function renderSetStrip(): HTMLElement | null {
    const a = s.sets.active;
    if (!a) {
      if (s.sets.recap) return null;
      return h("div", { class: "rc-setbar row between small" },
        h("span", { class: "muted", text: "Practice set" }),
        h("span", { class: "row" }, ...[5, 10, 20].map((n) => h("button", { class: "btn small", text: `${n}`, title: `Start a ${n}-question set`, onclick: () => void beginSet(n) }))));
    }
    const ids = new Set(a.attemptIds);
    const mine = s.log.filter((e) => ids.has(e.attemptId));
    const missed = mine.filter((e) => e.result === "missed").length;
    const pctDone = Math.round((a.attemptIds.length / a.target) * 100);
    return h("div", { class: "rc-setbar active" },
      h("div", { class: "row between small" },
        h("span", null, h("b", { text: `Set ${a.attemptIds.length}/${a.target}` }), h("span", { class: "muted", text: ` · ${missed} missed · ${formatClock((Date.now() - a.startedAt) / 1000)} elapsed` })),
        h("button", { class: "btn link small", text: "End set", onclick: () => void finishSet() })),
      h("div", { class: "rc-goal" }, h("span", { style: `width:${pctDone}%` })));
  }

  function renderRecap(): HTMLElement | null {
    const r = s.sets.recap;
    if (!r) return null;
    const ids = new Set(r.attemptIds);
    const entries = s.log.filter((e) => ids.has(e.attemptId));
    // Mixed sets: the average of the per-question targets (71 s Reading and Writing, 95 s Math).
    const target = entries.length ? entries.reduce((a, e) => a + targetSecondsFor(e), 0) / entries.length : TARGET_SECONDS;
    const tone = r.accuracy >= 0.8 ? "good" : r.accuracy >= 0.6 ? "accent" : "warn";
    return h("div", { class: `card rc-recap ${tone}` },
      h("div", { class: "row between" }, h("h2", { text: "Set complete" }), h("button", { class: "btn link small", text: "Dismiss", onclick: () => void dismissRecap() })),
      h("div", { class: "rc-tiles" },
        h("div", { class: "rc-tile" }, h("span", { class: "rc-tile-value", text: `${r.right}/${r.count}` }), h("span", { class: "rc-tile-label", text: "right" })),
        h("div", { class: "rc-tile" }, h("span", { class: "rc-tile-value", text: `${Math.round(r.accuracy * 100)}%` }), h("span", { class: "rc-tile-label", text: "accuracy" })),
        h("div", { class: `rc-tile ${r.avgSeconds !== null && r.avgSeconds > target ? "" : "good"}`.trim() }, h("span", { class: "rc-tile-value", text: r.avgSeconds === null ? "–" : `${r.avgSeconds}s` }), h("span", { class: "rc-tile-label", text: "avg pace" })),
        h("div", { class: "rc-tile" }, h("span", { class: "rc-tile-value", text: `${r.minutes}m` }), h("span", { class: "rc-tile-label", text: "total" }))),
      r.missedRules.length
        ? h("div", null, h("p", { class: "small", text: "Rules to fix:" }), h("div", { class: "row rc-wrap" }, ...r.missedRules.map((m) => chip(`${m.ruleName ? `${m.ruleId} · ${m.ruleName}` : m.ruleId}${m.misses > 1 ? ` ×${m.misses}` : ""}`, "danger"))))
        : h("p", { class: "small", text: "No misses. Clean set." }),
      h("div", { class: "row rc-wrap" },
        r.missedRules.length ? h("button", { class: "btn primary small", text: "Review these rules", onclick: () => void startReview(r.missedRules[0]!.ruleId) }) : null,
        h("button", { class: "btn small", text: "Print this set", onclick: () => entries.length && openPrintable(toPrintableHtml(entries, `Rulecard set · ${new Date(r.endedAt).toLocaleDateString()}`)) }),
        h("button", { class: "btn small", text: "Another set", onclick: () => void beginSet(r.count || 10) })));
  }

  // ---------------------------------------------------------------- card tools

  const currentEntry = () => {
    const ex = host.getExplained();
    return ex ? s.log.find((e) => e.attemptId === ex.attemptId) ?? null : null;
  };

  async function copyCurrentCard() {
    const e = currentEntry();
    if (!e) return;
    try {
      await navigator.clipboard.writeText(cardAsText(e));
      toast("Rule card copied");
    } catch {
      toast("Couldn't copy");
    }
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }

  // ---------------------------------------------------------------- capture-area extras

  function renderCaptureExtras(): (Node | null)[] {
    const out: (Node | null)[] = [];
    out.push(renderSetStrip());
    if (s.prefs.timer) out.push(renderTimer(s.timer, { reset: async () => { s.timer = emptyTimer(); await writeTimer(s.timer); ctx.rerender(); } }, targetSecondsFor(host.getQuestion())));
    return out;
  }

  // ---------------------------------------------------------------- bottom: progress, journal, export, settings

  async function doExport(kind: "anki" | "md" | "print" | "backup", scope: ExportScope) {
    const entries = filterScope(s.log, scope);
    if (!entries.length && kind !== "backup") { toast("Nothing to export yet"); return; }
    if (kind === "anki") downloadText(`rulecard-anki-${scope}-${stamp()}.csv`, toAnkiCsv(entries), "text/csv");
    if (kind === "md") downloadText(`rulecard-notes-${scope}-${stamp()}.md`, toMarkdown(entries), "text/markdown");
    if (kind === "print") openPrintable(toPrintableHtml(entries));
    if (kind === "backup") downloadText(`rulecard-backup-${stamp()}.json`, toBackup(s.log), "application/json");
  }

  async function doImport(file: File) {
    if (file.size > BACKUP_MAX_BYTES) { toast("That file is over 25 MB, which is too big for a Rulecard backup."); return; }
    let entries: unknown[];
    try {
      entries = parseBackup(await file.text());
    } catch {
      toast("That file is not a Rulecard backup.");
      return;
    }
    try {
      const added = await importEntries(entries);
      s.log = await readLog();
      s.srs = rebuildFromLog(s.log);
      await writeSrs(s.srs);
      recompute();
      s.badges = (await syncBadges(badgeInput())).badges;
      toast(`Imported ${added} question${added === 1 ? "" : "s"}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Import failed");
    }
  }

  async function share() {
    if (!s.summary) return;
    try {
      const img = await renderShareImage(s.summary, countdown(s.prefs.testDate, s.summary));
      downloadDataUrl(`rulecard-progress-${stamp()}.png`, img);
      toast("Progress image saved");
    } catch {
      toast("Couldn't make the image");
    }
  }

  async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    if (key === "reminders" && value === true) {
      const granted = await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false);
      if (!granted) { toast("Reminders need notification permission"); return; }
    }
    s.prefs = { ...s.prefs, [key]: value };
    await writePrefs(s.prefs);
    if (key === "hotkeys") {
      unhook?.();
      unhook = value ? installHotkeys(hotkeyActions) : null;
    }
    if (key === "zoom") applyZoom();
    ctx.rerender();
  }

  function renderSettings(): HTMLElement {
    const toggle = (key: keyof Prefs, label: string, hint: string) =>
      h("label", { class: "rc-toggle" },
        h("input", { type: "checkbox", checked: Boolean(s.prefs[key]), onchange: (ev: Event) => void setPref(key, (ev.target as HTMLInputElement).checked as never) }),
        h("span", null, h("span", { text: label }), h("span", { class: "muted small", text: hint })));
    const exportScope = h("select", { id: "rc-export-scope", class: "input rc-select" },
      h("option", { value: "missed", text: "Missed questions" }), h("option", { value: "starred", text: "Starred" }), h("option", { value: "all", text: "Everything" }));
    const scope = () => ((document.getElementById("rc-export-scope") as HTMLSelectElement | null)?.value ?? "missed") as ExportScope;
    const fileInput = h("input", { type: "file", accept: "application/json,.json", hidden: "", onchange: (ev: Event) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) void doImport(f); } });
    const goal = h("input", { class: "input rc-num", type: "number", min: "1", max: "100", value: String(s.prefs.dailyGoal), onchange: (ev: Event) => void setPref("dailyGoal", Math.max(1, Math.min(100, Number((ev.target as HTMLInputElement).value) || 10))) });
    const hour = h("input", { class: "input rc-num", type: "number", min: "0", max: "23", value: String(s.prefs.reminderHour), onchange: (ev: Event) => void setPref("reminderHour", Math.max(0, Math.min(23, Number((ev.target as HTMLInputElement).value) || 19))) });
    const testDate = h("input", { class: "input rc-date", type: "date", value: s.prefs.testDate ?? "", onchange: (ev: Event) => void setPref("testDate", (ev.target as HTMLInputElement).value || null) });
    const zoom = h("select", { class: "input rc-select", onchange: (ev: Event) => void setPref("zoom", Number((ev.target as HTMLSelectElement).value) || 1) },
      ...[[0.9, "Small"], [1, "Normal"], [1.1, "Large"], [1.25, "Extra large"]].map(([v, l]) => h("option", { value: String(v), text: String(l) })));
    zoom.value = String(s.prefs.zoom || 1);

    return h("div", { class: "card rc-settings" },
      h("h2", { text: "Export & settings" }),
      h("section", null, h("h2", { text: "Export" }),
        h("div", { class: "row rc-wrap" }, exportScope),
        h("div", { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Anki deck (.csv)", onclick: () => void doExport("anki", scope()) }),
          h("button", { class: "btn small", text: "Notes (.md)", onclick: () => void doExport("md", scope()) }),
          h("button", { class: "btn small", text: "Print / PDF", onclick: () => void doExport("print", scope()) }),
          h("button", { class: "btn small", text: "Progress image", onclick: () => void share() })),
        h("div", { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Error log (.csv)", title: "The mistake spreadsheet tutors ask for. Opens in Excel or Numbers.", onclick: () => downloadText(errorLogFilename(scope(), Date.now()), toErrorLogCsv(errorLogRows(s.log, { scope: scope(), srs: s.srs })), "text/csv") }),
          h("button", { class: "btn small", text: "Copy for Google Sheets", onclick: () => void navigator.clipboard.writeText(toErrorLogTsv(errorLogRows(s.log, { scope: scope(), srs: s.srs }))).then(() => toast("Error log copied. Paste it into cell A1."), () => toast("Couldn't copy")) })),
        renderReportTools(() => buildWeeklyReport(s.log, s.srs, Date.now()), { notify: toast })),
      h("section", null, h("h2", { text: "Practice" }),
        toggle("practice", "Offline practice", "Rule flashcards and redo my misses. No connection needed."),
        toggle("qbQuiz", "Question Bank export quiz", "Paste an exported Question Bank PDF and practice it here, graded with the official answer key."),
        toggle("timer", "Pacing timer", `Times each question between captures. Target ${TARGET_SECONDS}s for Reading and Writing, ${MATH_TARGET_SECONDS}s for Math.`),
        toggle("hotkeys", "Keyboard shortcuts", "Press ? in the panel to see them."),
        toggle("autoSpeak", "Read the rule aloud", "Speaks each new rule card."),
        h("label", { class: "rc-toggle" }, h("span", { text: "Daily goal" }), goal, h("span", { class: "muted small", text: "questions" })),
        h("label", { class: "rc-toggle" }, h("span", { text: "My SAT date" }), testDate),
        toggle("reminders", "Daily reminder", "A notification if you haven't practiced by the hour below."),
        s.prefs.reminders ? h("label", { class: "rc-toggle" }, h("span", { text: "Remind at" }), hour, h("span", { class: "muted small", text: ":00 (24h)" })) : null,
        h("label", { class: "rc-toggle" }, h("span", { text: "Text size" }), zoom)),
      h("section", null, h("h2", { text: "Coach" }),
        toggle("plan", "Today's plan", "A daily checklist: due reviews, your weakest skills with Question Bank filters, timed sets as the test gets close."),
        toggle("skillMap", "Skill map", "All 29 SAT skills colored by how you do, with the Question Bank filters for each."),
        toggle("wordBank", "Word bank", "The Words in Context words from your cards, with your mix-ups, a word quiz and an Anki export."),
        toggle("activity", "Activity calendar", "A 16-week heatmap of your practice against your daily goal, with streaks."),
        toggle("badges", "Badges", "Milestones for streaks, mastered rules and steady habits.")),
      h("section", null, h("h2", { text: "Your data (on this device)" }),
        h("p", { class: "muted small", text: `${s.log.length} questions saved locally for stats, review and export. Your account history on the web app is separate.` }),
        h("div", { class: "row rc-wrap" },
          h("button", { class: "btn small", text: "Back up", onclick: () => void doExport("backup", "all") }),
          h("button", { class: "btn small", text: "Restore", onclick: () => fileInput.click() }),
          h("button", { class: "btn small danger", text: "Erase local data", onclick: async () => {
            if (!confirm("Erase the local stats, review schedule, notes and quiz history? Your account history is not affected.")) return;
            await clearLog(); s.log = []; s.srs = {}; await writeSrs(s.srs); s.redoStore = {}; await writeRedo(s.redoStore); s.sets = emptySets(); await writeSets(s.sets); s.badges = {}; await writeBadges(s.badges);
            s.quiz = null; s.quizPaused = false; s.quizHistory = []; await writeQuizStore({ active: null, history: [] });
            s.wordQuiz = null; await writeWordRecord({});
            recompute(); ctx.rerender();
          } }),
          fileInput)));
  }

  function renderHelp(): HTMLElement | null {
    if (!s.showHelp) return null;
    return h("div", { class: "rc-overlay", onclick: toggleHelp },
      h("div", { class: "card rc-help", onclick: (ev: Event) => ev.stopPropagation() },
        h("div", { class: "row between" }, h("h2", { text: "Keyboard shortcuts" }), h("button", { class: "btn link small", text: "Close", onclick: toggleHelp })),
        h("dl", null, ...HOTKEY_HELP.flatMap(([k, v]) => [h("dt", null, h("kbd", { text: k })), h("dd", { text: v })])),
        h("p", { class: "muted small", text: "Press C (or click the Rulecard icon in Chrome's toolbar) to capture the question on screen." })));
  }

  /** The tab bar. A count shows what is waiting; a dot marks a session still open on another tab. */
  function renderTabBar(): HTMLElement {
    const dueCount = due().length;
    const live: Partial<Record<PanelTab, boolean>> = {
      practice: Boolean(s.practice) || s.review.open || (Boolean(s.quiz) && !s.quizPaused),
      words: Boolean(s.wordQuiz),
    };
    return h("nav", { class: "rc-tabbar", role: "tablist", "aria-label": "Rulecard sections" },
      ...PANEL_TABS.map((t) => {
        const active = s.tab === t.id;
        const count = t.id === "practice" && dueCount && !live.practice ? dueCount : 0;
        return h("button", {
          class: `rc-tabbtn${active ? " active" : ""}`,
          role: "tab",
          "aria-selected": String(active),
          title: t.id === "practice" && dueCount ? `${dueCount} rule${dueCount === 1 ? "" : "s"} due for review` : t.label,
          onclick: () => showTab(t.id),
        },
        t.label,
        count ? h("span", { class: "rc-tabcount", text: String(count) }) : null,
        live[t.id] && !active ? h("span", { class: "rc-tabdot", "aria-label": "in progress" }) : null);
      }));
  }

  /** Plan: today's checklist, with the practice set and the timer that go with it. */
  function renderPlanTab(): (Node | null)[] {
    const out: (Node | null)[] = [renderRecap(), ...renderCaptureExtras(), renderPlanCard()];
    if (!s.prefs.plan) out.push(h("div", { class: "card" }, h("h2", { text: "Today's plan" }), h("p", { class: "small muted", text: "Today's plan is switched off. Turn it on in Settings." })));
    return out;
  }

  function renderProgressTab(): (Node | null)[] {
    const cd = s.summary ? countdown(s.prefs.testDate, s.summary) : null;
    return [
      s.summary ? renderProgress(s.summary, insights(s.summary, due().length), s.prefs.dailyGoal, (path) => void ctx.openWeb(path), { countdown: cd, onShare: () => void share() }) : null,
      s.prefs.activity && s.log.length ? renderCalendar(activityModel(s.log, { now: Date.now(), dailyGoal: s.prefs.dailyGoal })) : null,
      s.prefs.skillMap ? renderSkillMap(skillMap(s.log)) : null,
      renderTraps(trapReport(s.log)),
      s.prefs.badges ? renderBadges(badgeProgress(badgeInput(), s.badges)) : null,
      s.log.length
        ? renderJournal(s.log, s.journal, {
          change: (f) => { s.journal = f; ctx.rerender(); },
          openWeb: (path) => void ctx.openWeb(path),
          toggleStar: async (e) => { await updateEntry(e.attemptId, { starred: !e.starred }); s.log = await readLog(); ctx.rerender(); },
          reviewRule: (ruleId) => void startReview(ruleId),
        }, ctx.rerender)
        : null,
    ];
  }

  function renderPracticeTab(): (Node | null)[] {
    if (s.quiz && !s.quizPaused) return [renderQuizSlot()];
    if (s.practice) return [renderPractice()];
    if (s.review.open) return [renderReview()];
    const cards = [s.quiz ? renderQuizSlot() : null, renderReview(), renderPractice(), renderQuizEntryCard()].filter(Boolean);
    if (!cards.length) cards.push(h("div", { class: "card" }, h("h2", { text: "Practice" }), h("p", { class: "small muted", text: "Explain a few questions on Home first. The rules you miss come back here for review and flashcards." })));
    return cards;
  }

  function renderWordsTab(): (Node | null)[] {
    if (s.wordQuiz) return [renderWordQuizSlot()];
    if (!s.prefs.wordBank) return [h("div", { class: "card" }, h("h2", { text: "Word bank" }), h("p", { class: "small muted", text: "The word bank is switched off. Turn it on in Settings." }))];
    return [renderWordBankCard()];
  }

  function renderSettingsTab(): (Node | null)[] {
    return [
      renderSettings(),
      h("div", { class: "card" },
        h("div", { class: "row between" }, h("h2", { text: "Keyboard shortcuts" }), h("button", { class: "btn small", text: "Show", onclick: toggleHelp })),
        h("p", { class: "small muted", text: "Press ? anywhere in the panel. Press C to capture this tab." })),
    ];
  }

  /** One tab's content (Home's question flow is drawn by sidepanel.ts). */
  function renderTab(tab: PanelTab): (Node | null)[] {
    if (tab === "plan") return renderPlanTab();
    if (tab === "progress") return renderProgressTab();
    if (tab === "practice") return renderPracticeTab();
    if (tab === "words") return renderWordsTab();
    if (tab === "settings") return renderSettingsTab();
    return [];
  }

  /** Always on top of whichever tab is showing. */
  function renderOverlays(): (Node | null)[] {
    return [renderHelp(), s.toast ? h("div", { class: "rc-toast", role: "status", text: s.toast }) : null];
  }

  return {
    ready,
    accountChanged,
    state: s,
    // hooks
    afterExtract,
    afterExplain,
    afterDrillCheck,
    startReview,
    // tabs
    tab: () => s.tab,
    showTab,
    renderTabBar,
    renderTab,
    renderOverlays,
    // render slots (Home)
    /** Home shows only the capture card; a quiz set aside while one of its misses is explained sits above it. */
    renderAboveCapture: (): (Node | null)[] => [s.quiz && s.quizPaused ? renderQuizSlot() : null],
    /** While a review is open, the host can hide the capture/question flow if it wants a focused screen. */
    isReviewing: () => s.review.open,
    /** True while a flashcard deck, a redo session or a Question Bank export quiz is on screen. */
    isPracticing: () => Boolean(s.practice) || Boolean(s.wordQuiz) || (Boolean(s.quiz) && !s.quizPaused),
    destroy: () => { unhook?.(); },
  };
}

export type Addons = ReturnType<typeof createAddons>;
