// Rulecard add-ons controller. ONE object the existing sidepanel.ts talks to through a few
// hooks and render slots. See docs/CLAUDE_HANDOFF.md (feature catalog, checklist) and
// docs/UPSTREAM-0.3.0.md (line-by-line hook spots in upstream 0.3.0).
// It also wires offline practice (flashcards.ts, redo.ts, practice-ui.ts), capture anywhere
// (selection.ts, paste.ts), seen before (seen.ts), the weekly report (report.ts) and the coach:
// today's plan (plan.ts), badges (achievements.ts) and traps you fall for (traps.ts). Wave 5 adds the
// Question Bank export quiz (qbquiz.ts, qbquiz-ui.ts), the skill map (skillmap.ts) and the word bank (vocab.ts).

import { badgeProgress, badgeToast, renderBadges, syncBadges, writeBadges, type BadgeInput, type EarnedBadges } from "./achievements";
import { chip, h, spinner } from "./dom";
import { cropDataUrl, renderCropper } from "./crop";
import { cardAsText, downloadText, filterScope, openPrintable, parseBackup, stamp, toAnkiCsv, toBackup, toMarkdown, toPrintableHtml, type ExportScope } from "./export";
import { createDeck, deckCounts, type DeckState } from "./flashcards";
import { HOTKEY_HELP, installHotkeys, type HotkeyActions } from "./hotkeys";
import { defaultFilter, renderJournal, type JournalFilter } from "./journal";
import { clearLog, entryFromExplain, importEntries, readLog, recordAttempt, recordDrill, updateEntry, type LogEntry, type SelfConfidence } from "./log";
import { createPastePanel } from "./paste";
import {
  answerQuiz, createQuiz, currentAnswer, currentQuestion, finishQuiz, isFinished, nextQuiz, parseExport, previewOf, quizKey, quizProgress,
  quizSummary, readQuizStore, recordResult, resumeQuiz, retryMisses, saveActive, skipQuiz, toParsedQB, writeQuizStore,
  type ParsedExport, type QuizQuestion, type QuizResult, type QuizState,
} from "./qbquiz";
import { renderQuiz, renderQuizEntry, renderQuizResult, type QuizStartOptions } from "./qbquiz-ui";
import { buildPlan, renderPlan } from "./plan";
import { pressPracticeKey, renderFlashcards, renderPracticeEntry, renderRedo, type PracticeHandlers, type PracticeMode } from "./practice-ui";
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "./prefs";
import { renderProgress } from "./progress";
import { crossCheck, isQuestionBankUrl, readQuestionBankPage, type PageRead } from "./qbtext";
import { createRedo, readRedo, recordRedo, redoQueue, redoStats, writeRedo, type RedoState, type RedoStore } from "./redo";
import { buildWeeklyReport, renderReportTools } from "./report";
import { createSeenCheck } from "./seen";
import { createSelectionCapture, type CaptureHost } from "./selection";
import { renderSkillMap, skillMap } from "./skillmap";
import { addToSet, emptySets, endSet, readSets, startSet, writeSets, type SetState } from "./sets";
import { downloadDataUrl, renderShareImage } from "./share";
import { applyAttempt, applyReview, describeDue, dueRules, nextDue, readSrs, rebuildFromLog, writeSrs, type RuleSrs, type SrsState } from "./srs";
import { countdown, insights, MATH_TARGET_SECONDS, summarize, TARGET_SECONDS, targetSecondsFor, type Summary } from "./stats";
import { strategyFor } from "./strategies";
import { canTextCapture, renderQuestionImage } from "./textcapture";
import { renderTraps, trapReport } from "./traps";
import { emptyTimer, formatClock, lap, readTimer, renderTimer, writeTimer, type TimerState } from "./timer";
import { hasChoices, isMathTaxonomy, LETTERS, type AddonContext, type ApiExplainResponse, type ApiPick, type DrillCheckResponse, type ExplainResponse, type Letter, type Question } from "./types";
import { collectWords, renderWordBank } from "./vocab";
import { activityModel, renderCalendar } from "./calendar";
import { errorLogFilename, errorLogRows, toErrorLogCsv, toErrorLogTsv } from "./errorlog";
import {
  answerWord, createWordQuiz, currentWord, currentWordAnswer, finishWordQuiz, isWordQuizFinished, nextWord, readWordRecord,
  saveWordResults, wordQuizAvailability, wordQuizKey, wordQuizProgress, wordQuizSummary, writeWordRecord, type WordQuizState,
} from "./wordquiz";
import { renderWordQuiz, renderWordQuizEntry, renderWordQuizResult } from "./wordquiz-ui";

export { cropDataUrl };

/** What the add-ons need to call back into sidepanel.ts. All optional except processImage. */
export interface HostBridge {
  getQuestion(): Question | null;
  getExplained(): { attemptId: string; picked: Letter | "correct" } | null;
  /** sidepanel.ts processImage(image): POST /api/extract and show the question. */
  processImage(image: string): Promise<void>;
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
const GRID_IN_SKIP = "This one needs a typed answer. Use Test me on the card.";

const CONFIDENCE: { key: SelfConfidence; label: string; hint: string }[] = [
  { key: "sure", label: "Sure", hint: "I knew it" },
  { key: "unsure", label: "Unsure", hint: "50/50" },
  { key: "guess", label: "Guessed", hint: "no idea" },
];

/** An open offline practice screen. */
type Practice = { mode: "flashcards"; deck: DeckState } | { mode: "redo"; redo: RedoState };

export function createAddons(ctx: AddonContext, host: HostBridge) {
  const s = {
    prefs: { ...DEFAULT_PREFS } as Prefs,
    log: [] as LogEntry[],
    srs: {} as SrsState,
    timer: emptyTimer() as TimerState,
    sets: emptySets() as SetState,
    summary: null as Summary | null,
    review: freshReview(),
    page: null as (PageRead & { at: number; tabId: number }) | null,
    pageWarning: null as string | null,
    captureAnyway: false,
    checkWarnings: [] as string[],
    cropping: null as { image: string; resolve: (v: string | null) => void } | null,
    lastSent: null as { kind: "text" | "screenshot"; image: string } | null,
    confidence: null as SelfConfidence | null,
    journal: defaultFilter() as JournalFilter,
    showHelp: false,
    showSettings: false,
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
  const ready = (async () => {
    [s.prefs, s.log, s.srs, s.timer, s.sets, s.redoStore] = await Promise.all([readPrefs(), readLog(), readSrs(), readTimer(), readSets(), readRedo()]);
    if (!Object.keys(s.srs).length && s.log.length) {
      s.srs = rebuildFromLog(s.log);
      await writeSrs(s.srs);
    }
    const quizStore = await readQuizStore();
    // A quiz left open picks up where it was. The clock restarts on an unanswered question.
    s.quiz = quizStore.active ? resumeQuiz(quizStore.active, Date.now()) : null;
    s.quizHistory = quizStore.history;
    recompute();
    s.badges = (await syncBadges(badgeInput())).badges;
    applyZoom();
    if (s.prefs.hotkeys) unhook = installHotkeys(hotkeyActions);
    ctx.rerender();
  })();

  // ---------------------------------------------------------------- capture anywhere

  // Right-click selections and pasted questions go through the same processImage as a capture.
  const captureHost: CaptureHost = {
    processImage: async (image) => {
      s.fromElsewhere = true;
      s.lastSent = null;
      try {
        await host.processImage(image);
      } catch (error) {
        s.fromElsewhere = false;
        throw error;
      }
    },
    rerender: () => ctx.rerender(),
    describe: (error) => ctx.describe(error),
  };
  const selection = createSelectionCapture(captureHost);
  const paste = createPastePanel(captureHost);
  const seen = createSeenCheck(() => ctx.rerender());
  // The panel loads its sign-in in boot(). Wait for it (up to 3 s) so a selection saved before the
  // panel opened goes out with the token.
  void ready.then(async () => {
    for (let i = 0; i < 30 && !ctx.settings?.token; i++) await new Promise((r) => setTimeout(r, 100));
    await selection.start();
  });

  function hotkeyActions(): HotkeyActions {
    if (s.wordQuiz) return { raw: pressWordQuizKey, help: toggleHelp };
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
    return {
      pick: (l: Letter) => host.pick?.(l),
      pickCorrect: () => host.pick?.("correct"),
      explain: () => host.explain?.(),
      capture: () => host.capture?.(),
      testMe: () => host.testMe?.(),
      focusChat: () => host.focusChat?.(),
      review: () => void startReview(),
      copyCard: () => void copyCurrentCard(),
      help: toggleHelp,
    };
  }
  function toggleHelp() {
    s.showHelp = !s.showHelp;
    ctx.rerender();
  }

  // ---------------------------------------------------------------- capture hooks

  /**
   * Call at the top of sidepanel.ts capture(), after activeTab(). Returns false when the
   * capture should NOT go ahead (answer not revealed); a banner with "Capture anyway" is shown.
   */
  async function beforeCapture(tab: chrome.tabs.Tab): Promise<boolean> {
    s.pageWarning = null;
    s.checkWarnings = [];
    s.page = null;
    s.fromElsewhere = false;
    const wantsPage = s.prefs.pageCheck || s.prefs.textCapture;
    if (!wantsPage || tab.id === undefined || !isQuestionBankUrl(tab.url)) return true;
    const read = await readQuestionBankPage(tab.id);
    if (read) s.page = { ...read, at: Date.now(), tabId: tab.id };
    if (s.captureAnyway) { s.captureAnyway = false; return true; }
    // qbtext.ts only reads A to D answers, so a Math or grid-in page never looks revealed. Skip those.
    const p = read?.parsed;
    if (s.prefs.pageCheck && p?.qbId && !p.answerRevealed && hasChoices(p.choices) && !isMathTaxonomy(p.domain, p.skill)) {
      s.pageWarning = `The answer to ${p.qbId} isn't showing yet. Reveal it on the page, then capture. That way the card uses the official answer and you don't spend a capture.`;
      ctx.rerender();
      return false;
    }
    return true;
  }

  /**
   * Call in capture() right after beforeCapture(), BEFORE captureVisibleTab. If it returns an
   * image, pass it straight to processImage() and skip the screenshot entirely.
   */
  async function tryTextCapture(tab: chrome.tabs.Tab): Promise<string | null> {
    if (!s.prefs.textCapture || tab.id === undefined || !isQuestionBankUrl(tab.url)) return null;
    let read: PageRead | null = s.page && s.page.tabId === tab.id && Date.now() - s.page.at < 15_000 ? s.page : null;
    if (!read) read = await readQuestionBankPage(tab.id);
    // Math goes as a screenshot: the page text loses the equations and figures.
    if (!read || isMathTaxonomy(read.parsed.domain, read.parsed.skill) || !canTextCapture(read.parsed, read.media)) return null;
    try {
      const image = await renderQuestionImage(read.parsed);
      s.lastSent = { kind: "text", image };
      return image;
    } catch {
      return null;
    }
  }

  /** Call right after the downscale in capture()/consumePendingCapture(). Returns null if the user cancels. */
  async function transformImage(image: string): Promise<string | null> {
    s.lastSent = { kind: "screenshot", image };
    if (!s.prefs.cropBeforeSend) return image;
    return new Promise((resolve) => {
      s.cropping = { image, resolve };
      ctx.rerender();
    });
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
    s.checkWarnings = [];
    // No cross-check for a selection or a paste (they didn't come from the tab), or for Math, whose
    // page text (MathJax, figures) won't match the extracted LaTeX.
    const isMath = question.section === "math" || question.format === "spr" || isMathTaxonomy(question.domain, question.skill);
    if (s.prefs.pageCheck && s.lastSent?.kind !== "text" && !elsewhere && !isMath) {
      let page = s.page && Date.now() - s.page.at < 60_000 ? s.page.parsed : null;
      if (!page) {
        // keyboard-shortcut path: we didn't pre-read; read now
        try {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab?.id !== undefined && isQuestionBankUrl(tab.url)) page = (await readQuestionBankPage(tab.id))?.parsed ?? null;
        } catch { /* ignore */ }
      }
      if (page) s.checkWarnings = crossCheck(question, page).warnings;
    }
    s.page = null;
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
    // The card is written against the server's final answer, so capture-vs-page warnings are stale now.
    s.checkWarnings = [];
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

  async function startReview(ruleId?: string): Promise<void> {
    if (ruleId && !s.srs[ruleId]) {
      // Not scheduled yet (shouldn't happen, but older logs may predate the scheduler).
      const latest = s.log.find((e) => e.ruleId === ruleId);
      if (latest) { s.srs = applyAttempt(s.srs, latest, latest.at); await writeSrs(s.srs); }
    }
    s.review = { ...freshReview(), open: true, forced: ruleId ?? null };
    s.practice = null;
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
    s.review = freshReview();
    s.practice = p;
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
    ctx.rerender();
    try {
      const image = await renderQuestionImage(toParsedQB(q));
      s.quizSeconds = qi >= 0 ? st.answers[qi]?.seconds ?? null : null;
      await captureHost.processImage(image);
      host.pick?.(picked);
      host.explain?.();
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
          onclick: () => { s.quizPaused = false; setQuiz(done ? st : resumeQuiz(st, Date.now())); scrollTop(); },
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

  // ---------------------------------------------------------------- question + pick extras

  function renderQuestionExtras(q: Question): (Node | null)[] {
    const out: (Node | null)[] = [];
    // Leave out the attempt just explained, or the question would match itself.
    if (s.prefs.seenBefore) out.push(seen.render(s.log, q, { excludeAttemptIds: [host.getExplained()?.attemptId] }));
    const st = s.prefs.strategies ? strategyFor(q.skill) : null;
    if (!st) return out;
    out.push(h("details", { class: "rc-strategy", open: s.strategyOpen ? "" : null, ontoggle: (ev: Event) => { s.strategyOpen = (ev.target as HTMLDetailsElement).open; } },
      h("summary", { class: "small", text: `How to attack ${st.skill}` }),
      h("ol", { class: "steps small" }, ...st.steps.map((t) => h("li", { text: t }))),
      h("p", { class: "small muted" }, h("b", { text: "Traps: " }), st.traps.join(" · "))));
    return out;
  }

  function renderPickExtras(): (Node | null)[] {
    if (!s.prefs.askConfidence) return [];
    return [h("div", { class: "rc-confidence row rc-wrap", role: "radiogroup", "aria-label": "How sure were you?" },
      h("span", { class: "small muted", text: "How sure were you?" }),
      ...CONFIDENCE.map((c) => h("button", {
        class: `btn small ${s.confidence === c.key ? "on" : ""}`.trim(),
        role: "radio",
        "aria-checked": String(s.confidence === c.key),
        title: c.hint,
        text: c.label,
        onclick: () => { s.confidence = s.confidence === c.key ? null : c.key; ctx.rerender(); },
      })))];
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

  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  /** Text typed but not saved yet, so a re-render inside the debounce doesn't put the old note back. */
  let noteDraft: { attemptId: string; value: string } | null = null;
  function renderCardTools(): HTMLElement | null {
    const e = currentEntry();
    if (!e) return null;
    const note = h("textarea", { id: `rc-note-${e.attemptId}`, class: "input rc-note", rows: "2", placeholder: "Your own note on this mistake (saved on this device, goes into exports)" });
    note.value = noteDraft?.attemptId === e.attemptId ? noteDraft.value : e.note;
    note.addEventListener("input", () => {
      noteDraft = { attemptId: e.attemptId, value: note.value };
      if (noteTimer) clearTimeout(noteTimer);
      noteTimer = setTimeout(async () => {
        const value = note.value;
        await updateEntry(e.attemptId, { note: value }).catch(() => null);
        e.note = value;
        if (noteDraft?.attemptId === e.attemptId && noteDraft.value === value) noteDraft = null;
      }, 400);
    });
    const dueInfo = s.srs[e.ruleId];
    return h(
      "div",
      { class: "card rc-tools" },
      h(
        "div",
        { class: "row rc-wrap" },
        h("button", { class: "btn small", onclick: () => void copyCurrentCard(), title: "Y" }, "Copy card"),
        h("button", { class: "btn small", onclick: () => speak(`${e.ruleName ?? ""}. ${e.ruleStatement}. Takeaway: ${e.takeaway}`) }, "Read aloud"),
        h("button", {
          class: `btn small ${e.starred ? "on" : ""}`.trim(),
          "aria-pressed": String(e.starred),
          onclick: async () => {
            await updateEntry(e.attemptId, { starred: !e.starred });
            e.starred = !e.starred;
            ctx.rerender();
          },
        }, e.starred ? "★ Starred" : "☆ Star"),
        e.seconds !== null ? chip(`${e.seconds}s`, e.seconds > targetSecondsFor(e) ? "warn" : "good") : null,
        e.selfConfidence === "sure" && e.result === "missed" ? chip("sure but wrong", "danger") : null,
        dueInfo ? chip(`review ${describeDue(dueInfo.due, Date.now())}`) : null,
      ),
      note,
    );
  }

  // ---------------------------------------------------------------- capture-area extras

  function openImage(dataUrl: string) {
    void fetch(dataUrl).then((r) => r.blob()).then((b) => {
      const url = URL.createObjectURL(b);
      void chrome.tabs.create({ url });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  function renderCaptureExtras(): (Node | null)[] {
    const out: (Node | null)[] = [];
    if (s.cropping) {
      const c = s.cropping;
      out.push(renderCropper(c.image, (img) => { s.cropping = null; c.resolve(img); ctx.rerender(); }));
    }
    out.push(selection.render());
    if (s.prefs.pastePanel) out.push(paste.render());
    out.push(renderSetStrip());
    if (s.prefs.timer) out.push(renderTimer(s.timer, { reset: async () => { s.timer = emptyTimer(); await writeTimer(s.timer); ctx.rerender(); } }, targetSecondsFor(host.getQuestion())));
    if (s.lastSent?.kind === "text" && host.getQuestion())
      out.push(h("p", { class: "small muted row" }, chip("read from page text", "good"), "No screenshot needed. ", h("button", { class: "btn link small", text: "See what was sent", onclick: () => s.lastSent && openImage(s.lastSent.image) })));
    if (s.pageWarning)
      out.push(h("div", { class: "banner warn", role: "alert" }, h("p", { text: s.pageWarning }),
        h("button", { class: "btn small", style: "margin-top:6px", text: "Capture anyway", onclick: () => { s.captureAnyway = true; s.pageWarning = null; host.capture?.(); } })));
    for (const w of s.checkWarnings) out.push(h("div", { class: "banner warn", role: "alert", text: w }));
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
    try {
      const added = await importEntries(parseBackup(await file.text()));
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

    return h("details", { class: "card rc-settings", open: s.showSettings ? "" : null, ontoggle: (ev: Event) => { s.showSettings = (ev.target as HTMLDetailsElement).open; } },
      h("summary", null, h("h2", { text: "Export & settings" })),
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
      h("section", null, h("h2", { text: "Capture" }),
        toggle("textCapture", "Read the page text", "On the Question Bank, send a clean copy of the question instead of a screenshot. No icon click needed."),
        toggle("pageCheck", "Check the page first", "Catches a hidden answer before you spend a capture, and flags misreads."),
        toggle("cropBeforeSend", "Crop screenshots", "Box just the question before sending (screenshots only)."),
        toggle("pastePanel", "Paste box", "Shows Paste a question under Capture, for text or a screenshot from any site."),
      ),
      h("section", null, h("h2", { text: "Practice" }),
        toggle("askConfidence", "Ask how sure I was", "Tracks overconfidence. Misses you were sure about are misconceptions."),
        toggle("strategies", "Show attack strategies", "A short method for each question type."),
        toggle("seenBefore", "Flag repeats", "Says when a question is already in your log, with your old card."),
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
        h("p", { class: "muted small", text: "Alt+Shift+R captures the tab from anywhere in Chrome. On any site, select a question, right-click and choose Explain this question with Rulecard." })));
  }

  function renderBottom(): (Node | null)[] {
    const cd = s.summary ? countdown(s.prefs.testDate, s.summary) : null;
    return [
      s.summary ? renderProgress(s.summary, insights(s.summary, due().length), s.prefs.dailyGoal, (path) => void ctx.openWeb(path), { countdown: cd, onShare: () => void share() }) : null,
      s.prefs.activity && s.log.length ? renderCalendar(activityModel(s.log, { now: Date.now(), dailyGoal: s.prefs.dailyGoal })) : null,
      renderQuizEntryCard(),
      s.prefs.skillMap ? renderSkillMap(skillMap(s.log)) : null,
      s.prefs.wordBank ? renderWordBankCard() : null,
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
      renderSettings(),
      renderHelp(),
      s.toast ? h("div", { class: "rc-toast", role: "status", text: s.toast }) : null,
    ];
  }

  return {
    ready,
    state: s,
    // hooks
    beforeCapture,
    tryTextCapture,
    transformImage,
    afterExtract,
    afterExplain,
    afterDrillCheck,
    startReview,
    // render slots
    renderAboveCapture: (): (Node | null)[] =>
      s.wordQuiz ? [renderWordQuizSlot()] : s.practice ? [renderPractice()] : s.quiz ? [renderQuizSlot()] : [renderRecap(), renderPlanCard(), renderReview(), renderPractice()],
    renderInCapture: renderCaptureExtras,
    renderQuestionExtras,
    renderPickExtras,
    renderAfterRuleCard: (): (Node | null)[] => [renderCardTools()],
    renderBottom,
    /** While a review is open, the host can hide the capture/question flow if it wants a focused screen. */
    isReviewing: () => s.review.open,
    /** True while the cropper is waiting on the user (capture() is still "in flight"). */
    isCropping: () => Boolean(s.cropping),
    /** True while a flashcard deck, a redo session or a Question Bank export quiz is on screen. */
    isPracticing: () => Boolean(s.practice) || Boolean(s.wordQuiz) || (Boolean(s.quiz) && !s.quizPaused),
    destroy: () => { unhook?.(); selection.stop(); },
  };
}

export type Addons = ReturnType<typeof createAddons>;
