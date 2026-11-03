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

const INLINE_OPEN = "\\(";
const INLINE_CLOSE = "\\)";
const DISPLAY_OPEN = "\\[";
const DISPLAY_CLOSE = "\\]";

/**
 * One left-to-right scan: each opener is looked up once and every closer search moves the cursor
 * forward, so the cost stays linear. An opener with no closer ends the math; the rest is plain text.
 */
export function splitMath(text: string): MathSegment[] {
  const out: MathSegment[] = [];
  let last = 0;
  let inline = text.indexOf(INLINE_OPEN);
  let display = text.indexOf(DISPLAY_OPEN);
  while (inline >= 0 || display >= 0) {
    const isDisplay = inline < 0 || (display >= 0 && display < inline);
    const open = isDisplay ? display : inline;
    // At least one character between the delimiters.
    const close = text.indexOf(isDisplay ? DISPLAY_CLOSE : INLINE_CLOSE, open + 3);
    if (close < 0) break;
    if (open > last) out.push({ kind: "text", value: text.slice(last, open), display: false });
    out.push({ kind: "math", value: text.slice(open + 2, close).trim(), display: isDisplay });
    last = close + 2;
    if (inline >= 0 && inline < last) inline = text.indexOf(INLINE_OPEN, last);
    if (display >= 0 && display < last) display = text.indexOf(DISPLAY_OPEN, last);
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
    const html = katex.renderToString(tex, {
      output: "mathml",
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      // Bound macro expansion and glue sizes so pasted LaTeX cannot blow up rendering.
      maxExpand: 100,
      maxSize: 50,
    });
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
  return splitMath(text)
    .map((s) => s.value)
    .join("");
}
