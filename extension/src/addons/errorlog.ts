// Error log: the spreadsheet SAT tutors ask students to keep (date, question, what you picked, the rule,
// why you missed it, how sure you were, your time), built from the local log. One row per explained
// question, oldest first so it reads like a journal. Two outputs:
//   toErrorLogCsv  RFC 4180 CSV for Excel or Numbers: UTF-8 BOM (so accents and curly quotes show
//                  correctly), CRLF line ends, every cell quoted, quotes doubled, newlines kept in the cell.
//   toErrorLogTsv  tab-separated text to paste straight into Google Sheets: no BOM, no quotes; tabs and
//                  newlines inside a cell become single spaces.
// Formula guard (both outputs, see guardCell): a cell that starts with = + - @ (or a tab or carriage
// return, per OWASP's CSV injection advice) gets a leading apostrophe, so a spreadsheet shows it as text
// instead of running it. Plain negative numbers ("-5", "-2.5", "-.5") are left alone so they stay numbers.
// Answers: multiple choice shows "B: had reflected" (letter, then the choice text with LaTeX turned into
// plain text). Picked "correct" means you got it right, so Your answer repeats the correct answer.
// Grid-in shows what you typed and every accepted answer joined with " or "; "I got it right" on a
// grid-in (nothing typed) shows the first accepted answer. A multiple-choice entry with a missing choice
// text shows the letter alone. Review box is the rule's box today (srs.ts), not at the time of the attempt.
// Pure functions: no DOM, no storage keys, no permissions.
// Hook-in: index.ts renderSettings(), Export section, next to "Anki deck (.csv)" (scope() is the Export
// scope select: "missed", "starred" or "all"):
//   h("button", { class: "btn small", text: "Error log (.csv)", onclick: () => downloadText(errorLogFilename(scope(), Date.now()), toErrorLogCsv(errorLogRows(s.log, { scope: scope(), srs: s.srs })), "text/csv") }),
//   h("button", { class: "btn small", text: "Copy for Google Sheets", onclick: () => void navigator.clipboard.writeText(toErrorLogTsv(errorLogRows(s.log, { scope: scope(), srs: s.srs }))).then(() => toast("Error log copied. Paste it into cell A1."), () => toast("Couldn't copy")) }),

import { filterScope, plainMath, type ExportScope } from "./export";
import { hasChoiceList, isGridIn, sectionOf, type LogEntry, type SelfConfidence } from "./log";
import { MAX_BOX, type SrsState } from "./srs";
import { dayKey, SECTION_LABEL, targetSecondsFor } from "./stats";
import type { Diagnosis, Letter } from "./types";

/** "missed" (the classic error log), "all", or "starred" (same values as the Export scope select). */
export type ErrorLogScope = ExportScope;

export const ERROR_LOG_COLUMNS = [
  "Date",
  "Question ID",
  "Section",
  "Domain",
  "Skill",
  "Difficulty",
  "Your answer",
  "Correct answer",
  "Result",
  "Rule",
  "Why your pick fails",
  "Why the answer is right",
  "Diagnosis",
  "How sure",
  "Seconds",
  "Over pace",
  "Review box",
  "Starred",
  "Note",
] as const;

const DIAGNOSIS_WORDS: Record<Diagnosis, string> = {
  misread: "Misread",
  rule_gap: "Didn't know the rule",
  careless: "Careless slip",
  got_it_right: "Got it right",
  unknown: "Unknown",
};

const SURE_WORDS: Record<SelfConfidence, string> = { sure: "Sure", unsure: "Unsure", guess: "Guessed" };

/** A timer at or past 30 minutes was left running; it says nothing about pace (same cut as stats.ts). */
const MAX_SECONDS = 1800;

const choiceText = (e: LogEntry, letter: Letter) => {
  const text = plainMath(e.choices?.[letter] ?? "").trim();
  return text ? `${letter}: ${text}` : letter;
};

/** The "Your answer" and "Correct answer" cells for one entry. */
export function answerCells(e: LogEntry): { yours: string; correct: string } {
  const gridIn = isGridIn(e) || (!hasChoiceList(e) && (e.accepted !== undefined || e.typed !== undefined));
  if (!gridIn) {
    const correct = choiceText(e, e.correct);
    return { yours: e.picked === "correct" ? correct : choiceText(e, e.picked), correct };
  }
  const accepted = (e.accepted ?? []).map((a) => a.trim()).filter(Boolean);
  const typed = e.typed?.trim() ?? "";
  const yours = typed || (e.picked === "correct" && e.result === "right" ? accepted[0] ?? "" : "");
  return { yours, correct: accepted.join(" or ") };
}

function rowFor(e: LogEntry, srs: SrsState | null | undefined): string[] {
  const { yours, correct } = answerCells(e);
  const missed = e.result === "missed";
  const secs = typeof e.seconds === "number" && Number.isFinite(e.seconds) && e.seconds > 0 ? e.seconds : null;
  const box = srs?.[e.ruleId]?.box;
  return [
    dayKey(e.at),
    e.qbId ?? "",
    SECTION_LABEL[sectionOf(e)],
    e.domain ?? "",
    e.skill ?? "",
    e.difficulty ?? "",
    yours,
    correct,
    missed ? "Missed" : "Right",
    e.ruleName ? `${e.ruleId} · ${e.ruleName}` : e.ruleId,
    missed ? plainMath(e.whyPickFails ?? "") : "",
    plainMath(e.whyCorrect ?? ""),
    DIAGNOSIS_WORDS[e.diagnosis] ?? "Unknown",
    e.selfConfidence ? SURE_WORDS[e.selfConfidence] ?? "" : "",
    secs === null ? "" : String(Math.round(secs)),
    secs === null || secs >= MAX_SECONDS ? "" : secs > targetSecondsFor(e) ? "Yes" : "No",
    typeof box === "number" ? `${box} of ${MAX_BOX}` : "",
    e.starred ? "Yes" : "",
    e.note ?? "",
  ];
}

/** Header row, then one row per entry in scope, oldest first. */
export function errorLogRows(log: readonly LogEntry[], opts: { scope: ErrorLogScope; srs?: SrsState | null }): string[][] {
  const entries = filterScope([...log], opts.scope).sort((a, b) => a.at - b.at);
  return [[...ERROR_LOG_COLUMNS], ...entries.map((e) => rowFor(e, opts.srs))];
}

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NEGATIVE = /^-(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Spreadsheet formula guard: a cell starting with = + - @ (or a tab or carriage return) gets a leading
 * apostrophe so Excel and Google Sheets treat it as text. Plain negative numbers ("-5", "-2.5", "-.5") are
 * left alone; anything else after a minus ("-5/2", "-x", "- note") is guarded.
 */
export function guardCell(cell: string): string {
  return FORMULA_START.test(cell) && !PLAIN_NEGATIVE.test(cell) ? `'${cell}` : cell;
}

const BOM = "\uFEFF";

/** RFC 4180 CSV with a UTF-8 BOM: CRLF after every row, every cell quoted, quotes doubled, newlines kept. */
export function toErrorLogCsv(rows: readonly (readonly string[])[]): string {
  const line = (row: readonly string[]) => row.map((cell) => `"${guardCell(String(cell ?? "")).replace(/"/g, '""')}"`).join(",");
  return BOM + rows.map((row) => `${line(row)}\r\n`).join("");
}

/** Tab-separated text for pasting into Google Sheets: no BOM, no quotes, tabs and newlines in a cell become one space. */
export function toErrorLogTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map((cell) => guardCell(String(cell ?? "").replace(/[\t\r\n]+/g, " "))).join("\t")).join("\n");
}

/** "rulecard-error-log-missed-2026-10-30.csv", using the local date. */
export function errorLogFilename(scope: ErrorLogScope, now: number): string {
  return `rulecard-error-log-${scope}-${dayKey(now)}.csv`;
}
