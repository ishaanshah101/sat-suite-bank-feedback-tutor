// Read the Question Bank page as TEXT (no AI, no screenshot) to:
//  1. pre-check that the answer is revealed BEFORE spending an /api/extract call,
//  2. cross-check what the vision model extracted (answer letter, question ID, choices).
// The host permissions for both Question Bank domains are already in manifest.json; this
// only adds the "scripting" permission.
//
// The parser is tolerant of the broken spacing pdf text extraction produces
// ("Corr ect A nswer: B"), so the same code also parses Question Bank PDF exports.

import { LETTERS, type Letter, type Question } from "./types";

export interface ParsedQB {
  qbId: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: "Easy" | "Medium" | "Hard" | null;
  passage: string | null;
  stem: string | null;
  choices: Partial<Record<Letter, string>>;
  correct: Letter | null;
  rationale: string | null;
  answerRevealed: boolean;
}

export const RW_DOMAINS = ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"] as const;
export const RW_SKILLS = [
  "Central Ideas and Details",
  "Command of Evidence",
  "Inferences",
  "Words in Context",
  "Text Structure and Purpose",
  "Cross-Text Connections",
  "Rhetorical Synthesis",
  "Transitions",
  "Boundaries",
  "Form, Structure, and Sense",
] as const;

/** Regex for a phrase where any letters may be split by stray whitespace. */
function loose(phrase: string): string {
  return phrase
    .split("")
    .map((c) => (c === " " ? "\\s*" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*"))
    .join("");
}

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const tidy = (s: string) => s.replace(/[ \t\u00a0]+/g, " ").trim();

// Hex IDs may come back with stray spaces from PDFs ("6f ece68e"); fall back to any token.
const RE_QID = new RegExp(`${loose("Question ID")}\\s*:?\\s*((?:[0-9a-fA-F] ?){7}[0-9a-fA-F])(?![0-9A-Za-z])`, "i");
const RE_QID_ANY = new RegExp(`${loose("Question ID")}\\s*:?\\s*([A-Za-z0-9-]{6,})`, "i");
const RE_CORRECT = new RegExp(`${loose("Correct Answer")}\\s*:?\\s*\\(?([A-D])\\)?(?![A-Za-z])`, "i");
const RE_RATIONALE = new RegExp(`^\\s*${loose("Rationale")}\\s*$`, "im");
const RE_CHOICE_INLINE = /^\(?([A-D])\s*[.)]\s*(.*)$/;
const RE_CHOICE_ALONE = /^\(?([A-D])\)?\s*\.?$/;
const RE_STOP = new RegExp(`^(${loose("Correct Answer")}|${loose("Rationale")}|${loose("Question Difficulty")})`, "i");
const RE_ANSWER_LABEL = new RegExp(`^${loose("Answer")}$`, "i");
const RE_QUESTION_LABEL = new RegExp(`^${loose("Question")}$`, "i");

export function parseQuestionBankText(text: string): ParsedQB {
  const out: ParsedQB = {
    qbId: null, domain: null, skill: null, difficulty: null, passage: null, stem: null,
    choices: {}, correct: null, rationale: null, answerRevealed: false,
  };
  if (!text) return out;

  out.qbId = (text.match(RE_QID)?.[1] ?? text.match(RE_QID_ANY)?.[1])?.replace(/\s+/g, "").toLowerCase() ?? null;
  const correct = text.match(RE_CORRECT)?.[1]?.toUpperCase();
  out.correct = correct && (LETTERS as readonly string[]).includes(correct) ? (correct as Letter) : null;
  out.answerRevealed = out.correct !== null;

  const ratIdx = text.search(RE_RATIONALE);
  if (ratIdx >= 0) {
    const after = text.slice(ratIdx).replace(RE_RATIONALE, "");
    const rationale = after.split(/\n\s*Question\s*ID/i)[0]?.trim();
    out.rationale = rationale ? tidy(rationale.replace(/\s*\n\s*/g, " ")) : null;
  }

  // Metadata: compare whitespace-free so "F orm, Structur e, and Sense" still matches.
  const headEnd = (() => {
    const m = text.search(/\n\s*Q\s*u\s*e\s*s\s*t\s*i\s*o\s*n\s*\n/i);
    return m > 0 ? m : Math.min(text.length, 600);
  })();
  const head = squash(text.slice(0, headEnd));
  out.domain = RW_DOMAINS.find((d) => head.includes(squash(d))) ?? null;
  // longest first so "Inferences" doesn't shadow anything longer
  out.skill = [...RW_SKILLS].sort((a, b) => b.length - a.length).find((s) => head.includes(squash(s))) ?? null;
  const rawHead = text.slice(0, headEnd);
  out.difficulty = (["Easy", "Medium", "Hard"] as const).find((d) => new RegExp(`(^|[^A-Za-z])${loose(d)}(?![a-z])`, "i").test(rawHead)) ?? null;

  // Choices: the last run of A, B, C, D starters before the answer/rationale.
  const body = ratIdx >= 0 ? text.slice(0, ratIdx) : text;
  const lines = body.split(/\r?\n/).map(tidy).filter(Boolean);
  const starters: { idx: number; letter: Letter; rest: string }[] = [];
  lines.forEach((line, idx) => {
    if (RE_STOP.test(line)) return;
    const alone = line.match(RE_CHOICE_ALONE);
    const inline = line.match(RE_CHOICE_INLINE);
    const m = alone ?? inline;
    if (m?.[1]) starters.push({ idx, letter: m[1] as Letter, rest: alone ? "" : (m[2] ?? "").trim() });
  });
  let run: typeof starters | null = null;
  for (let i = starters.length - 4; i >= 0; i--) {
    const seq = starters.slice(i, i + 4);
    if (seq.map((s) => s.letter).join("") === "ABCD" && seq.every((s, k) => k === 0 || s.idx > seq[k - 1]!.idx)) {
      run = seq;
      break;
    }
  }
  if (run) {
    const endIdx = (() => {
      for (let j = run[3]!.idx + 1; j < lines.length; j++) if (RE_STOP.test(lines[j]!)) return j;
      return lines.length;
    })();
    run.forEach((s, k) => {
      const until = k < 3 ? run![k + 1]!.idx : Math.min(endIdx, s.idx + (s.rest ? 1 : 2));
      const parts = [s.rest, ...lines.slice(s.idx + 1, until)].filter(Boolean);
      out.choices[s.letter] = tidy(parts.join(" "));
    });

    // Stem = last line before the choices that looks like a question prompt.
    const before = lines.slice(0, run[0]!.idx).filter((l) => !RE_ANSWER_LABEL.test(l));
    let stemIdx = -1;
    for (let j = before.length - 1; j >= 0; j--) {
      if (/\?\s*$/.test(before[j]!) || /^Which\s*choice/i.test(before[j]!)) { stemIdx = j; break; }
    }
    if (stemIdx >= 0) {
      out.stem = before[stemIdx]!;
      const qLabel = before.findIndex((l) => RE_QUESTION_LABEL.test(l));
      const passageLines = before.slice(qLabel >= 0 ? qLabel + 1 : 0, stemIdx);
      out.passage = passageLines.length ? tidy(passageLines.join(" ")) : null;
    }
  }
  return out;
}

/** Split a multi-question PDF/text export into blocks, one per Question ID. */
export function splitExport(text: string): string[] {
  const re = new RegExp(loose("Question ID"), "gi");
  const starts: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) starts.push(m.index);
  return starts.map((s, i) => text.slice(s, starts[i + 1] ?? text.length));
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Fraction of shared word tokens (Dice coefficient). */
export function similarity(a: string, b: string): number {
  const ta = norm(a).split(" ").filter(Boolean);
  const tb = norm(b).split(" ").filter(Boolean);
  if (!ta.length && !tb.length) return 1;
  if (!ta.length || !tb.length) return 0;
  const counts = new Map<string, number>();
  for (const t of ta) counts.set(t, (counts.get(t) ?? 0) + 1);
  let shared = 0;
  for (const t of tb) {
    const c = counts.get(t) ?? 0;
    if (c > 0) { shared++; counts.set(t, c - 1); }
  }
  return (2 * shared) / (ta.length + tb.length);
}

export interface CrossCheck {
  ok: boolean;
  warnings: string[];
  /** The page's answer when the model didn't read one. Useful to show, or to send if the server accepts it. */
  pageCorrect: Letter | null;
}

export function crossCheck(model: Question, page: ParsedQB): CrossCheck {
  const warnings: string[] = [];
  if (page.qbId && model.qbId && page.qbId.toLowerCase() !== model.qbId.toLowerCase())
    warnings.push(`The page shows question ${page.qbId}, but the capture read ${model.qbId}. You may have captured a different question.`);
  if (page.correct && model.correct && page.correct !== model.correct)
    warnings.push(`The page says the answer is ${page.correct}, but the capture read ${model.correct}. Capture again before you trust this card.`);
  if (page.correct && !model.correct)
    warnings.push(`The page shows the answer is ${page.correct}. The capture missed it, so try capturing again with the answer in view.`);
  const mismatched = LETTERS.filter((l) => page.choices[l] && model.choices[l] && similarity(page.choices[l]!, model.choices[l]) < 0.6);
  if (mismatched.length >= 2) warnings.push(`Choices ${mismatched.join(", ")} don't match the page text. The capture may have misread them.`);
  return { ok: warnings.length === 0, warnings, pageCorrect: page.correct };
}

export const QB_HOSTS = ["satsuitequestionbank.collegeboard.org", "satsuiteeducatorquestionbank.collegeboard.org"];
export const isQuestionBankUrl = (url: string | undefined | null) => {
  try { return !!url && QB_HOSTS.includes(new URL(url).hostname); } catch { return false; }
};

export interface PageRead {
  parsed: ParsedQB;
  /** Images, SVGs, tables, canvases or math in the question area. >0 means text alone isn't enough. */
  media: number;
}

/** Read innerText from every frame of the tab and parse the frame that looks like a question. */
export async function readQuestionBankPage(tabId: number): Promise<PageRead | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        // Prefer an open question dialog/modal if there is one.
        const root = document.querySelector<HTMLElement>("[role=dialog], .modal, .cb-modal") ?? document.body;
        if (!root) return { text: "", media: 0 };
        // Ignore the site's chrome (logos, icons) — only count media inside the question content.
        const media = [...root.querySelectorAll("img, svg, table, canvas, math, mjx-container, .MathJax, figure")].filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 60 && r.height > 40;
        }).length;
        return { text: (root.innerText || "").slice(0, 60_000), media };
      },
    });
    const reads = results
      .map((r) => r.result as { text?: unknown; media?: unknown } | undefined)
      .filter((r): r is { text: string; media: number } => !!r && typeof r.text === "string" && r.text.length > 0);
    const best = reads
      .map((r) => ({ r, score: (RE_QID_ANY.test(r.text) ? 2 : 0) + (/\bA[.)]/.test(r.text) ? 1 : 0) + r.text.length / 1e6 }))
      .sort((a, b) => b.score - a.score)[0];
    return best ? { parsed: parseQuestionBankText(best.r.text), media: best.r.media } : null;
  } catch {
    return null; // no permission, or a page we can't script; silently skip
  }
}

/** Back-compat wrapper: just the parsed question. */
export async function readQuestionBankTab(tabId: number): Promise<ParsedQB | null> {
  return (await readQuestionBankPage(tabId))?.parsed ?? null;
}
