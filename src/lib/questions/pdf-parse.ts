import { DIFFICULTIES, DOMAINS, SKILLS, domainForSkill, inferSection, squash, type Difficulty, type Domain, type Skill } from "./taxonomy";
import { splitAcceptedAnswers } from "./spr";
import type { Letter, ParsedQuestion } from "@/lib/ai/schemas";

/** One positioned text run from pdf.js getTextContent (y grows upward, PDF user space). */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageItems {
  page: number;
  items: TextItem[];
}

export interface Line {
  text: string;
  x: number;
  y: number;
  page: number;
}

export interface ParsedPdfQuestion extends ParsedQuestion {
  pages: number[];
  issues: string[];
  ok: boolean;
  /** Math questions: the PDF text layer mangles fractions and exponents, so the page is read with vision on open. */
  needsVision: boolean;
}

export interface PdfParseResult {
  questions: ParsedPdfQuestion[];
  warnings: string[];
}

const LINE_TOLERANCE_PT = 2;
const NOISE = [/^page\s*\d+\s*of\s*\d+$/i, /collegeboard\.org/i, /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}/];

export function linesFromItems(page: PageItems): Line[] {
  const items = page.items
    .map((it) => ({ ...it, str: it.str.replace(/\s+/g, " ") }))
    .filter((it) => it.str.trim().length > 0 || it.str === " ")
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Array<{ y: number; x: number; parts: TextItem[] }> = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < LINE_TOLERANCE_PT);
    if (line) {
      line.parts.push(it);
      line.x = Math.min(line.x, it.x);
    } else {
      lines.push({ y: it.y, x: it.x, parts: [it] });
    }
  }
  lines.sort((a, b) => b.y - a.y);
  // A one- or two-character run sitting just above or below a line (superscript, subscript, footnote
  // marker) belongs to that line, not on a line of its own.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const text = l.parts.map((p) => p.str).join("").trim();
    if (l.parts.length !== 1 || text.length === 0 || text.length > 2) continue;
    const height = l.parts[0].height || 6;
    const neighbours = [lines[i - 1], lines[i + 1]].filter((n): n is typeof l => Boolean(n));
    const host = neighbours
      .map((n) => ({ n, dy: Math.abs(n.y - l.y), h: Math.max(...n.parts.map((p) => p.height || 9)) }))
      .filter(({ dy, h }) => dy <= Math.max(h, height) && dy > 0)
      .sort((a, b) => a.dy - b.dy)[0];
    if (!host) continue;
    host.n.parts.push(...l.parts);
    host.n.x = Math.min(host.n.x, l.x);
    lines.splice(i, 1);
  }
  return lines
    .map((l) => {
      const parts = [...l.parts].sort((a, b) => a.x - b.x);
      let text = "";
      let cursor: number | null = null;
      for (const p of parts) {
        const gapThreshold = Math.max(1, (p.height || 9) * 0.2);
        if (cursor !== null && p.x - cursor > gapThreshold && !text.endsWith(" ") && !p.str.startsWith(" ")) text += " ";
        text += p.str;
        cursor = p.x + (p.width || 0);
      }
      return { text: text.replace(/\s+/g, " ").trim(), x: l.x, y: l.y, page: page.page };
    })
    .filter((l) => l.text.length > 0 && !NOISE.some((re) => re.test(l.text)));
}

const QUESTION_ID = /^question\s*id:?\s*([0-9a-f]{8})\b/i;
const OLD_ID = /^id:\s*([0-9a-f]{8})\b/i;
const CHOICE = /^([A-D])\s*\.\s*(.*)$/;
const STEM_TRIGGER = /^(which|what|according to|based on|how|why|the student wants|as used in|in the (text|passage)|it can (most )?reasonably|the author|the passage|the text)/i;

const LABEL_WORDS = new Set(["assessment", "test", "domain", "skill", "difficulty"]);
/** Sentences that open a two-sentence stem ("The student wants to ... Which choice ..."). */
const STEM_LEAD = /^(the student (wants|is|has)|while researching|a student)/i;

/** An "A." line opens the choices only when "B." follows within three lines with no other "A." between. */
function startsChoices(texts: string[], i: number): boolean {
  for (let j = i + 1; j < Math.min(texts.length, i + 4); j++) {
    if (/^B\s*\.\s*/.test(texts[j])) return true;
    if (/^A\s*\.\s*/.test(texts[j])) return false;
  }
  return false;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !LABEL_WORDS.has(w));
}

/** Header values wrap unpredictably ("Standard English Boundaries Medium" / "Conventions"), so match
 * each taxonomy name first as a whitespace-free substring, then as a bag of words, consuming matches. */
class HeaderMatcher {
  private key: string;
  private bag: string[];
  constructor(text: string) {
    this.key = squash(text).replace(/assessmenttestdomainskilldifficulty/g, "");
    this.bag = words(text);
  }
  take<T extends string>(candidates: readonly T[]): T | null {
    const ordered = [...candidates].sort((a, b) => b.length - a.length);
    for (const candidate of ordered) {
      const ck = squash(candidate);
      const at = this.find(ck);
      if (at >= 0) {
        this.key = this.key.slice(0, at) + this.key.slice(at + ck.length);
        this.consume(words(candidate));
        return candidate;
      }
    }
    for (const candidate of ordered) {
      const cw = words(candidate);
      if (cw.length > 0 && this.canConsume(cw)) {
        this.consume(cw);
        return candidate;
      }
    }
    return null;
  }
  /** Index of the candidate in the squashed header, skipping hits that are the tail of "non..." (Linear inside Nonlinear). */
  private find(ck: string): number {
    let from = 0;
    for (;;) {
      const at = this.key.indexOf(ck, from);
      if (at < 0) return -1;
      if (!(ck.startsWith("linear") && this.key.slice(Math.max(0, at - 3), at) === "non")) return at;
      from = at + 1;
    }
  }
  private canConsume(cw: string[]): boolean {
    const pool = [...this.bag];
    for (const w of cw) {
      const i = pool.indexOf(w);
      if (i < 0) return false;
      pool.splice(i, 1);
    }
    return true;
  }
  private consume(cw: string[]): void {
    for (const w of cw) {
      const i = this.bag.indexOf(w);
      if (i >= 0) this.bag.splice(i, 1);
    }
  }
}

const HEADER_VOCAB = new Set(
  ["sat", "reading", "writing", "math", ...SKILLS, ...DOMAINS, ...DIFFICULTIES].flatMap((t) => t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)).filter(Boolean),
);

/** Header lines are short label rows or taxonomy values; anything else starts the question body. */
function looksLikeHeader(text: string): boolean {
  const lower = text.toLowerCase();
  if (text.length > 100) return false;
  if (/^(assessment|test|domain|skill|difficulty)\b/.test(lower)) return true;
  const ws = lower.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (ws.length === 0) return false;
  const known = ws.filter((w) => HEADER_VOCAB.has(w) || LABEL_WORDS.has(w)).length;
  return known / ws.length >= 0.6;
}

function parseHeader(lines: string[]): { test: string | null; domain: Domain | null; skill: Skill | null; difficulty: Difficulty | null } {
  const matcher = new HeaderMatcher(lines.join(" "));
  const testName = matcher.take(["SAT Reading and Writing", "SAT Math"] as const);
  const skill = matcher.take(SKILLS);
  const domain = matcher.take(DOMAINS);
  const difficulty = matcher.take(DIFFICULTIES);
  return { test: testName, domain, skill, difficulty };
}

/** Grid-in answers from the "Correct Answer:" line, which may wrap onto the following lines. */
function answersFromAnswerBlock(rest: string[]): string[] {
  const start = rest.findIndex((t) => /correct\s*answ\s*er/i.test(t));
  if (start < 0) return [];
  const parts: string[] = [rest[start].replace(/^.*?correct\s*answ\s*er\s*:?/i, "")];
  for (const t of rest.slice(start + 1)) {
    if (/^\s*(rationale|question\s*difficulty|id:|question\s*id)/i.test(t) || squash(t) === "rationale") break;
    parts.push(t);
  }
  const text = parts.join(" ").replace(/\s+/g, " ").replace(/\s*([./])\s*/g, "$1").trim();
  return splitAcceptedAnswers(text);
}

/** "The correct answer is 403." in a grid-in rationale. */
function answerFromRationale(text: string): string[] {
  const m = /the correct answer is\s+(-?[\d./\u2212]+)/i.exec(text);
  return m ? splitAcceptedAnswers(m[1].replace(/\.$/, "")) : [];
}

function correctFromRationale(text: string): Letter | null {
  const m = /choice([a-d])is(?:the)?(?:best|correct)/i.exec(squash(text));
  return m ? (m[1].toUpperCase() as Letter) : null;
}

function parseBlock(lines: Line[], id: string): ParsedPdfQuestion {
  const issues: string[] = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  const texts = lines.map((l) => l.text);

  // Header block: from an "Assessment Test ..." label row up to the body start.
  let bodyStart = 0;
  const headerLines: string[] = [];
  const bodyLabel = texts.findIndex((t, i) => i > 0 && (squash(t) === "question" || OLD_ID.test(t)));
  if (bodyLabel > 0) {
    headerLines.push(...texts.slice(1, bodyLabel));
    bodyStart = squash(texts[bodyLabel]) === "question" ? bodyLabel + 1 : bodyLabel;
  } else {
    // Fall back: the header is the run of label or taxonomy lines after the id, at most four of them.
    let i = 1;
    while (i < texts.length && headerLines.length < 4 && !CHOICE.test(texts[i]) && !STEM_TRIGGER.test(texts[i]) && looksLikeHeader(texts[i])) {
      headerLines.push(texts[i++]);
    }
    bodyStart = i;
  }
  const header = parseHeader(headerLines);

  // Body: passage + stem until choice A.
  const bodyLines: string[] = [];
  let i = bodyStart;
  for (; i < texts.length; i++) {
    let t = texts[i];
    if (OLD_ID.test(t)) t = t.replace(OLD_ID, "").trim();
    if (/^A\s*\.\s*/.test(t) && i > bodyStart && startsChoices(texts, i)) break;
    if (squash(t) === "answer") break;
    if (t) bodyLines.push(t);
  }

  // Choices: A to D, each possibly wrapping onto following lines.
  const choices: Partial<Record<Letter, string>> = {};
  const order: Letter[] = ["A", "B", "C", "D"];
  let expected = 0;
  let current: Letter | null = null;
  for (; i < texts.length; i++) {
    const t = texts[i];
    const key = squash(t);
    if (key === "answer" || key.startsWith("correctanswer:") || key === "rationale" || OLD_ID.test(t) || key.startsWith("questiondifficulty")) break;
    const m = CHOICE.exec(t);
    if (m && expected < 4 && m[1] === order[expected]) {
      current = m[1] as Letter;
      expected++;
      choices[current] = m[2].trim();
      continue;
    }
    if (m && expected >= 4) break;
    if (current) choices[current] = `${choices[current]} ${t}`.trim();
  }

  // Answer block.
  const rest = texts.slice(i);
  const restText = rest.join("\n");
  const correctMatch = /correctanswer:([a-d])/i.exec(squash(restText.split(/rationale/i)[0] ?? ""));
  let correct: Letter | null = correctMatch ? (correctMatch[1].toUpperCase() as Letter) : null;
  const rationaleIndex = rest.findIndex((t) => squash(t) === "rationale" || /^rationale\b/i.test(t));
  let rationale: string | null = null;
  if (rationaleIndex >= 0) {
    const rationaleLines: string[] = [];
    const first = rest[rationaleIndex].replace(/^rationale\s*/i, "").trim();
    if (first) rationaleLines.push(first);
    for (const t of rest.slice(rationaleIndex + 1)) {
      if (/^question\s*difficulty/i.test(t)) break;
      rationaleLines.push(t);
    }
    rationale = rationaleLines.join(" ").replace(/\s+/g, " ").trim() || null;
  }
  if (!correct && rationale) correct = correctFromRationale(rationale);
  if (!correct) {
    const fallback = correctFromRationale(restText);
    if (fallback) correct = fallback;
  }
  let difficulty = header.difficulty;
  if (!difficulty) {
    const qd = /question\s*difficulty\s*:?\s*(easy|medium|hard)/i.exec(restText);
    if (qd) difficulty = (qd[1][0].toUpperCase() + qd[1].slice(1).toLowerCase()) as Difficulty;
  }

  // Stem versus passage.
  let stemStart = -1;
  for (let k = bodyLines.length - 1; k >= 0; k--) {
    // A trigger word on a line that starts lowercase is the tail of a wrapped stem, keep looking.
    if (STEM_TRIGGER.test(bodyLines[k]) && !/^[a-z]/.test(bodyLines[k])) {
      stemStart = k;
      break;
    }
  }
  if (stemStart < 0) {
    for (let k = bodyLines.length - 1; k >= 0; k--) {
      if (STEM_TRIGGER.test(bodyLines[k])) {
        stemStart = k;
        break;
      }
    }
  }
  if (stemStart < 0) stemStart = Math.max(0, bodyLines.length - 1);
  // Pull in a preceding sentence that is part of the stem ("The student wants to ... Which choice ...")
  // or a preceding fragment the stem's first line continues.
  for (let guard = 0; stemStart > 0 && guard < 3; guard++) {
    const prev = bodyLines[stemStart - 1];
    const startsLower = /^[a-z]/.test(bodyLines[stemStart]);
    const prevOpen = !/[.!?:;"”)\]_]$/.test(prev);
    if (STEM_LEAD.test(prev) || (startsLower && prevOpen)) stemStart--;
    else break;
  }
  const passage = bodyLines.slice(0, stemStart).join("\n").trim() || null;
  const stem = bodyLines.slice(stemStart).join(" ").replace(/\s+/g, " ").trim();

  const letters: Letter[] = ["A", "B", "C", "D"];
  const missing = letters.filter((l) => !choices[l]);
  const section = inferSection({ test: header.test, skill: header.skill, domain: header.domain });

  if (section === "math") {
    // Math: the text layer is only a preview (vision reads the page on open), so a found id is enough.
    const found = letters.length - missing.length;
    const answers = correct ? [] : answersFromAnswerBlock(rest);
    if (!correct && answers.length === 0 && rationale) answers.push(...answerFromRationale(rationale));
    const format = correct || (answers.length === 0 && found >= 2) ? "mcq" : "spr";
    if (format === "mcq" && !correct) issues.push("No correct answer found");
    if (format === "spr" && answers.length === 0) issues.push("No correct answer found");
    if (!rationale) issues.push("No rationale found");
    return {
      qb_id: id,
      section,
      format,
      test: header.test ?? "SAT Math",
      domain: header.domain ?? domainForSkill(header.skill),
      skill: header.skill,
      difficulty,
      passage,
      stem,
      choices: format === "mcq" ? { A: choices.A ?? "", B: choices.B ?? "", C: choices.C ?? "", D: choices.D ?? "" } : null,
      correct: format === "mcq" ? correct : null,
      answers: format === "spr" && answers.length ? answers : null,
      figure: null,
      rationale,
      pages,
      issues,
      ok: true,
      needsVision: true,
    };
  }

  if (missing.length) issues.push(`Missing choices: ${missing.join(", ")}`);
  if (!stem) issues.push("No question stem found");
  if (!correct) issues.push("No correct answer found");
  if (!rationale) issues.push("No rationale found");

  return {
    qb_id: id,
    section: "rw",
    format: "mcq",
    test: header.test,
    domain: header.domain,
    skill: header.skill,
    difficulty,
    passage,
    stem,
    choices: { A: choices.A ?? "", B: choices.B ?? "", C: choices.C ?? "", D: choices.D ?? "" },
    correct,
    answers: null,
    figure: null,
    rationale,
    pages,
    issues,
    ok: missing.length === 0 && Boolean(stem) && Boolean(correct),
    needsVision: false,
  };
}

export function parsePdfLines(allLines: Line[]): PdfParseResult {
  const warnings: string[] = [];
  const blocks: Array<{ id: string; lines: Line[] }> = [];
  for (const line of allLines) {
    const m = QUESTION_ID.exec(line.text) ?? QUESTION_ID.exec(line.text.replace(/\s+/g, ""));
    const squashed = squash(line.text);
    const sm = /^questionid:?([0-9a-f]{8})/.exec(squashed);
    const id = (sm?.[1] ?? m?.[1])?.toLowerCase();
    if (id) {
      if (blocks[blocks.length - 1]?.id !== id) blocks.push({ id, lines: [line] });
      continue;
    }
    if (blocks.length === 0) continue;
    blocks[blocks.length - 1].lines.push(line);
  }
  if (blocks.length === 0) warnings.push("No 'Question ID' markers found. Export the Question Bank PDF with correct answers and explanations.");
  const questions = blocks.map((b) => parseBlock(b.lines, b.id));
  return { questions, warnings };
}

export function parsePdfPages(pages: PageItems[]): PdfParseResult {
  const lines = pages.flatMap((p) => linesFromItems(p));
  return parsePdfLines(lines);
}

/** Convenience for tests and plain-text fixtures: one line per array entry. */
export function parsePdfText(text: string): PdfParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((t, i) => ({ text: t.replace(/\s+/g, " ").trim(), x: 0, y: -i, page: 1 }))
    .filter((l) => l.text.length > 0 && !NOISE.some((re) => re.test(l.text)));
  return parsePdfLines(lines);
}
