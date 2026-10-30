import katex from "katex";

/**
 * Math in Rulecard text is LaTeX inside \( \) (inline) or \[ \] (display). Never $, which is money.
 * renderMathHtml turns such text into safe HTML: plain parts are escaped, math parts become MathML,
 * which Chrome, Safari and Firefox draw natively (no KaTeX fonts or CSS needed). Shared by the web
 * app and the browser extension.
 */

export interface MathSegment {
  kind: "text" | "math";
  value: string;
  display: boolean;
}

const DELIMITERS = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;

export function splitMath(text: string): MathSegment[] {
  const out: MathSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(DELIMITERS)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ kind: "text", value: text.slice(last, index), display: false });
    out.push({ kind: "math", value: (m[1] ?? m[2] ?? "").trim(), display: m[2] !== undefined });
    last = index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last), display: false });
  return out;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function hasMath(text: string | null | undefined): boolean {
  return Boolean(text && /\\\(|\\\[/.test(text));
}

/** One LaTeX expression as MathML. Bad LaTeX falls back to the escaped source instead of throwing. */
export function renderTex(tex: string, display = false): string {
  try {
    const html = katex.renderToString(tex, { output: "mathml", displayMode: display, throwOnError: false, strict: "ignore", trust: false });
    return markUnaryMinus(html);
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

/**
 * A minus or plus right after another operator, an opening bracket or a separator is a sign, not a
 * subtraction. MathML Core spaces every <mo> in the middle of a row as an infix operator unless told
 * otherwise, which draws "= − 24"; marking it form="prefix" draws "= −24".
 */
function markUnaryMinus(html: string): string {
  return html.replace(/(<mo[^>]*>[^<]*<\/mo>)<mo>([−+])<\/mo>/g, '$1<mo form="prefix">$2</mo>');
}

export function renderMathHtml(text: string): string {
  return splitMath(text)
    .map((s) => (s.kind === "math" ? renderTex(s.value, s.display) : escapeHtml(s.value)))
    .join("");
}

/** Plain-text version for places that cannot show MathML (titles, aria labels): drops the delimiters. */
export function mathToPlain(text: string): string {
  return text.replace(DELIMITERS, (_, inline: string | undefined, display: string | undefined) => (inline ?? display ?? "").trim());
}
