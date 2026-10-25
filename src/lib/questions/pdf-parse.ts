import { DIFFICULTIES, DOMAINS, SKILLS, squash, type Difficulty, type Domain, type Skill } from "./taxonomy";
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
  return lines
    .sort((a, b) => b.y - a.y)
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
      if (this.key.includes(ck)) {
        this.key = this.key.replace(ck, "");
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

function parseHeader(lines: string[]): { test: string | null; domain: Domain | null; skill: Skill | null; difficulty: Difficulty | null } {
  const matcher = new HeaderMatcher(lines.join(" "));
  const testName = matcher.take(["SAT Reading and Writing", "SAT Math"] as const);
  const skill = matcher.take(SKILLS);
  const domain = matcher.take(DOMAINS);
  const difficulty = matcher.take(DIFFICULTIES);
  return { test: testName, domain, skill, difficulty };
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
    // Fall back: header is whatever follows the id line until the first long line.
    let i = 1;
    while (i < texts.length && texts[i].length < 60 && !CHOICE.test(texts[i])) headerLines.push(texts[i++]);
    bodyStart = i;
  }
  const header = parseHeader(headerLines);

  // Body: passage + stem until choice A.
  const bodyLines: string[] = [];
  let i = bodyStart;
  for (; i < texts.length; i++) {
    let t = texts[i];
    if (OLD_ID.test(t)) t = t.replace(OLD_ID, "").trim();
    if (/^A\s*\.\s*/.test(t) && i > bodyStart) break;
    if (squash(t) === "answer") break;
    if (t) bodyLines.push(t);
  }

  // Choices: A to D, each possibly wrapping onto following lines.
  const choices: Partial<Record<Letter, string>> = {};
  let current: Letter | null = null;
  for (; i < texts.length; i++) {
    let t = texts[i];
    const key = squash(t);
    if (key === "answer" || key.startsWith("correctanswer:") || key === "rationale" || OLD_ID.test(t) || key.startsWith("questiondifficulty")) break;
    const m = CHOICE.exec(t);
    if (m) {
      const letter = m[1] as Letter;
      if (choices[letter] !== undefined) break;
      current = letter;
      t = m[2];
      choices[letter] = t.trim();
      continue;
    }
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
    if (STEM_TRIGGER.test(bodyLines[k])) {
      stemStart = k;
      break;
    }
  }
  if (stemStart < 0) stemStart = Math.max(0, bodyLines.length - 1);
  const passage = bodyLines.slice(0, stemStart).join("\n").trim() || null;
  const stem = bodyLines.slice(stemStart).join(" ").replace(/\s+/g, " ").trim();

  const letters: Letter[] = ["A", "B", "C", "D"];
  const missing = letters.filter((l) => !choices[l]);
  if (missing.length) issues.push(`Missing choices: ${missing.join(", ")}`);
  if (!stem) issues.push("No question stem found");
  if (!correct) issues.push("No correct answer found");
  if (!rationale) issues.push("No rationale found");

  return {
    qb_id: id,
    test: header.test,
    domain: header.domain,
    skill: header.skill,
    difficulty,
    passage,
    stem,
    choices: { A: choices.A ?? "", B: choices.B ?? "", C: choices.C ?? "", D: choices.D ?? "" },
    correct,
    rationale,
    pages,
    issues,
    ok: missing.length === 0 && Boolean(stem) && Boolean(correct),
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
    if (id && !blocks.some((b) => b.id === id && b.lines.length < 3)) {
      blocks.push({ id, lines: [line] });
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
