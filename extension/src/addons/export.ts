// Turn the local log into things a student can actually use elsewhere:
// Anki deck (CSV), Markdown notes, a printable one-page-per-rule study sheet, and a JSON backup.
// Math (upstream 0.3.0): a grid-in entry shows the accepted answers and what the student typed,
// with no choice list; Math entries also carry the figure, worked steps and shortcut. Anki renders
// \( \) LaTeX itself, so the Anki export keeps it; Markdown, the printable sheet and the copied card
// get plain text from plainMath().
// Hook-in: index.ts calls these from the export buttons and the "Copy card" button (renderCardTools,
// in the renderAfterRuleCard slot).

import { answerText, hasChoiceList, isGridIn, otherAnswers, responseText, sectionOf, type LogEntry } from "./log";
import { LETTERS } from "./types";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

const MATH_SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈",
  pi: "π", theta: "θ", alpha: "α", beta: "β", infty: "∞", circ: "°", degree: "°", angle: "∠", triangle: "△",
  parallel: "∥", perp: "⊥", left: "", right: "", quad: " ", qquad: " ",
};

/** Keep a single token as is (3, x, 2.5, √2); put parentheses around anything longer. */
const wrapMath = (s: string) => (/^√?[\w.]+$/.test(s.trim()) ? s.trim() : `(${s.trim()})`);

function latexToText(src: string): string {
  let t = src;
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => `${wrapMath(a)}/${wrapMath(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√${wrapMath(a)}`)
      .replace(/\\(?:text|textbf|mathrm|mathbf|mathit|operatorname|overline)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ/g, "°")
      .replace(/([\^_])\s*\{([^{}]*)\}/g, (_m, op: string, a: string) => `${op}${wrapMath(a)}`);
    if (t === before) break;
  }
  return t
    .replace(/\\([a-zA-Z]+)/g, (_m, name: string) => MATH_SYMBOLS[name] ?? name)
    .replace(/\\([%$#&_,;:! ])/g, (_m, c: string) => (",;:! ".includes(c) ? " " : c))
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Readable plain text for LaTeX inside \( \) or \[ \], for places that can't render math:
 * \(\frac{3}{4}\) becomes 3/4, \(x^{2} \le 9\) becomes x^2 ≤ 9. Text without math comes back unchanged.
 */
export function plainMath(s: string): string {
  if (!s.includes("\\")) return s;
  return s.replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, (_m, a: string | undefined, b: string | undefined) => latexToText(a ?? b ?? ""));
}

type AnswerFields = Pick<LogEntry, "format" | "correct" | "accepted" | "picked" | "typed" | "result">;

/**
 * The answer and, for a miss, what the student gave: "Answer C, you picked A." or, for grid-in,
 * "Answer 3/17 (also accepted: .1764), you entered 5." `mark` wraps the answers (Markdown bold).
 */
export function answerLine(e: AnswerFields, mark: (s: string) => string = (s) => s): string {
  const others = otherAnswers(e);
  const answer = `Answer ${mark(answerText(e))}${others.length ? ` (also accepted: ${others.join(", ")})` : ""}`;
  const said = responseText(e);
  if (e.result !== "missed" || !said) return `${answer}.`;
  return `${answer}, you ${isGridIn(e) ? "entered" : "picked"} ${mark(said)}.`;
}

/** "Why A fails" or, for grid-in, "Why 5 fails" (null when there is nothing to say). */
function whyFailsLabel(e: Pick<LogEntry, "format" | "picked" | "typed" | "result" | "whyPickFails">): string | null {
  if (e.result !== "missed" || !e.whyPickFails) return null;
  const said = responseText(e);
  return said ? `Why ${said} fails` : "Why your answer fails";
}

export type ExportScope = "all" | "missed" | "starred";

export function filterScope(entries: LogEntry[], scope: ExportScope): LogEntry[] {
  if (scope === "missed") return entries.filter((e) => e.result === "missed");
  if (scope === "starred") return entries.filter((e) => e.starred);
  return entries;
}

/**
 * Anki "Basic" note CSV. Import with File > Import, field separator comma, "Allow HTML".
 * Front: the question with choices (grid-in: a "type your answer" line). Back: answer, rule, why,
 * Math steps and shortcut, takeaway. Tags: rule + skill, plus section::math and grid_in for Math.
 * LaTeX stays as \( \), which Anki renders with MathJax.
 */
export function toAnkiCsv(entries: LogEntry[]): string {
  const rows = ["#separator:comma", "#html:true", "#columns:Front,Back,Tags"];
  for (const e of entries) {
    const gridIn = isGridIn(e);
    const choices = hasChoiceList(e) ? LETTERS.map((l) => `${l}. ${esc(e.choices[l])}`).join("<br>") : gridIn ? "<i>Grid-in: type your answer.</i>" : "";
    const front = [
      e.passage ? `<div>${esc(e.passage)}</div><br>` : "",
      e.figure ? `<div><i>Figure:</i> ${esc(e.figure)}</div><br>` : "",
      `<b>${esc(e.stem)}</b><br><br>`,
      choices,
    ].join("");
    const others = otherAnswers(e);
    const fails = whyFailsLabel(e);
    const back = [
      `<b>Answer: ${esc(answerText(e))}</b>`,
      others.length ? `<br>Also accepted: ${esc(others.join(", "))}` : "",
      `<br><br><i>Rule ${esc(e.ruleId)}${e.ruleName ? ` · ${esc(e.ruleName)}` : ""}</i><br>${esc(e.ruleStatement)}`,
      `<br><br>${esc(e.whyCorrect)}`,
      e.steps?.length ? `<br><br><b>Steps:</b><ol>${e.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol>` : "",
      e.shortcut ? `<br><b>Shortcut:</b> ${esc(e.shortcut)}` : "",
      fails ? `<br><br><b>${esc(fails)}:</b> ${esc(e.whyPickFails)}` : "",
      gridIn && !fails && e.result === "missed" && e.typed ? `<br><br><b>You entered:</b> ${esc(e.typed)}` : "",
      `<br><br><b>Takeaway:</b> ${esc(e.takeaway)}`,
      e.note ? `<br><br><b>My note:</b> ${esc(e.note)}` : "",
    ].join("");
    const tag = (s: string | null) => (s ? s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") : "");
    const tags = [
      "rulecard",
      `rule::${tag(e.ruleId)}`,
      e.skill ? `skill::${tag(e.skill)}` : "",
      sectionOf(e) === "math" ? "section::math" : "",
      gridIn ? "grid_in" : "",
      e.result === "missed" ? "missed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    rows.push([csvCell(front), csvCell(back), csvCell(tags)].join(","));
  }
  return rows.join("\n") + "\n";
}

/** Rule-first cheat sheet: one rule card per rule, with the questions you missed on it. */
export function groupByRule(entries: LogEntry[]): { ruleId: string; ruleName: string | null; statement: string; takeaways: string[]; items: LogEntry[] }[] {
  const map = new Map<string, { ruleId: string; ruleName: string | null; statement: string; takeaways: string[]; items: LogEntry[] }>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const g = map.get(e.ruleId) ?? { ruleId: e.ruleId, ruleName: e.ruleName, statement: e.ruleStatement, takeaways: [], items: [] };
    g.ruleName = e.ruleName ?? g.ruleName;
    g.statement = e.ruleStatement || g.statement;
    if (e.takeaway && !g.takeaways.includes(e.takeaway)) g.takeaways.push(e.takeaway);
    g.items.push(e);
    map.set(e.ruleId, g);
  }
  return [...map.values()].sort((a, b) => b.items.filter((i) => i.result === "missed").length - a.items.filter((i) => i.result === "missed").length);
}

export function toMarkdown(entries: LogEntry[], title = "Rulecard study notes"): string {
  const lines = [`# ${title}`, "", `_${entries.length} questions · exported ${new Date().toLocaleDateString()}_`, ""];
  for (const g of groupByRule(entries)) {
    const missed = g.items.filter((i) => i.result === "missed").length;
    lines.push(`## ${g.ruleId}${g.ruleName ? ` · ${g.ruleName}` : ""}  (${missed} missed / ${g.items.length})`, "", `> ${g.statement}`, "");
    if (g.takeaways.length) {
      lines.push("**Takeaways**", "", ...g.takeaways.map((t) => `- ${t}`), "");
    }
    for (const e of g.items) {
      lines.push(`- ${e.result === "missed" ? "❌" : "✅"} ${e.qbId ? `\`${e.qbId}\` ` : ""}${plainMath(e.stem)}`);
      lines.push(`  - ${answerLine(e, (s) => `**${s}**`)} ${plainMath(e.whyCorrect)}`);
      if (e.steps?.length) lines.push("  - Steps:", ...e.steps.map((st, i) => `    ${i + 1}. ${plainMath(st)}`));
      if (e.shortcut) lines.push(`  - Shortcut: ${plainMath(e.shortcut)}`);
      if (e.note) lines.push(`  - Note: ${e.note}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function toPrintableHtml(entries: LogEntry[], title = "Rulecard study sheet"): string {
  const groups = groupByRule(entries);
  const body = groups
    .map((g) => {
      const missed = g.items.filter((i) => i.result === "missed");
      return `<section>
  <h2>${esc(g.ruleId)}${g.ruleName ? ` · ${esc(g.ruleName)}` : ""}</h2>
  <p class="rule">${esc(g.statement)}</p>
  ${g.takeaways.length ? `<ul class="take">${g.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
  ${missed.length ? `<h3>Questions you missed</h3><ol>${missed
        .map((e) => `<li><p>${esc(plainMath(e.stem))}</p><p class="ans">${esc(answerLine(e))} ${esc(plainMath(e.whyPickFails ?? e.whyCorrect))}</p>${e.steps?.length ? `<ol class="steps">${e.steps.map((st) => `<li>${esc(plainMath(st))}</li>`).join("")}</ol>` : ""}${e.shortcut ? `<p class="small">Shortcut: ${esc(plainMath(e.shortcut))}</p>` : ""}${e.note ? `<p class="note">Note: ${esc(e.note)}</p>` : ""}</li>`)
        .join("")}</ol>` : ""}
</section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#16161a}
  h1{font-size:20px;margin:0 0 4px} .meta{color:#6b6b70;margin:0 0 20px}
  section{border:1px solid #e4e4e0;border-radius:10px;padding:12px 14px;margin:0 0 12px;break-inside:avoid}
  h2{font-size:14px;margin:0 0 6px;color:#2f5bea} h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b6b70;margin:10px 0 4px}
  .rule{font-weight:600;margin:0 0 6px} .take{margin:0;padding-left:18px} .ans{color:#15803d;margin:2px 0} .note{color:#b45309;margin:2px 0}
  ol{padding-left:18px;margin:0} li p{margin:0} .steps{color:#3f3f46;font-size:12px;margin:2px 0} .small{font-size:12px;color:#3f3f46}
  .hint{background:#e8eefc;color:#2f5bea;border-radius:8px;padding:8px 12px;margin:0 0 16px}
  @media print{body{margin:0} section{border-color:#bbb} .hint{display:none}}
</style></head><body>
<p class="hint">To save as PDF: press ⌘P (Mac) or Ctrl+P, then choose "Save as PDF".</p>
<h1>${esc(title)}</h1><p class="meta">${groups.length} rules · ${entries.length} questions · ${esc(new Date().toLocaleDateString())}</p>
${body || "<p>No questions yet.</p>"}
</body></html>`;
}

export interface Backup {
  kind: "rulecard-addons-backup";
  version: 1;
  exportedAt: string;
  entries: LogEntry[];
}

export function toBackup(entries: LogEntry[]): string {
  const b: Backup = { kind: "rulecard-addons-backup", version: 1, exportedAt: new Date().toISOString(), entries };
  return JSON.stringify(b, null, 2);
}

export function parseBackup(text: string): LogEntry[] {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.kind !== "rulecard-addons-backup" || !Array.isArray(data.entries)) throw new Error("That file is not a Rulecard backup.");
  return data.entries;
}

/** Plain-text version of one card, for the clipboard. Grid-in: the accepted answers instead of a letter. */
export function cardAsText(
  e: Pick<LogEntry, "ruleId" | "ruleName" | "ruleStatement" | "correct" | "whyCorrect" | "picked" | "whyPickFails" | "takeaway" | "result" | "format" | "typed" | "accepted" | "steps" | "shortcut">,
): string {
  const others = otherAnswers(e);
  const fails = whyFailsLabel(e);
  return [
    `Rule ${e.ruleId}${e.ruleName ? ` · ${e.ruleName}` : ""}`,
    plainMath(e.ruleStatement),
    "",
    `Why ${answerText(e)} is right: ${plainMath(e.whyCorrect)}`,
    others.length ? `Also accepted: ${others.join(", ")}` : "",
    ...(e.steps?.length ? ["Steps:", ...e.steps.map((st, i) => `${i + 1}. ${plainMath(st)}`)] : []),
    e.shortcut ? `Shortcut: ${plainMath(e.shortcut)}` : "",
    fails ? `${fails}: ${plainMath(e.whyPickFails ?? "")}` : "",
    !fails && isGridIn(e) && e.result === "missed" && e.typed ? `You entered ${e.typed}.` : "",
    `Takeaway: ${plainMath(e.takeaway)}`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
    .trim();
}

/** Save a file from the side panel without the "downloads" permission. */
export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/**
 * Open the printable sheet in a new tab. (Extension CSP blocks inline scripts in blob pages,
 * so we can't auto-open the print dialog; the page shows a "press ⌘P" hint instead.)
 */
export function openPrintable(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  void chrome.tabs.create({ url });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const stamp = (d = new Date()) => d.toISOString().slice(0, 10);
