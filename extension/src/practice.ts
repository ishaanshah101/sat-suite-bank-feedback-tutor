// Practice-test review questions from My Practice (mypractice.collegeboard.org), the page Bluebook
// practice tests send you to after scoring: question, your answer, the correct answer and the rationale.
// The panel reads that page's text on that one site only (host permission + chrome.scripting); math is
// turned back into LaTeX from the page's MathML so the explanation sees real equations.

export const PRACTICE_HOST = "mypractice.collegeboard.org";

export function isPracticeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === PRACTICE_HOST;
  } catch {
    return false;
  }
}

/** What the student picked, from "You selected answer D." (or a typed grid-in answer), if the page says. */
export function parsePracticePick(text: string): { letter: "A" | "B" | "C" | "D" } | { typed: string } | null {
  const letter = /you\s+selected\s+(?:answer\s+)?(?:choice\s+)?([A-D])\b/i.exec(text);
  if (letter) return { letter: letter[1].toUpperCase() as "A" | "B" | "C" | "D" };
  const typed = /you\s+(?:entered|answered|selected|typed)\s+(?:answer\s+)?:?\s*(-?[\d./]+)/i.exec(text);
  if (typed) return { typed: typed[1].replace(/\.$/, "") };
  return null;
}

/** Whether the page text includes the answer panel (the "Show correct answer and explanation" box is ticked). */
export function showsAnswer(text: string): boolean {
  return /correct answer/i.test(text) && /rationale|is correct|best answer/i.test(text);
}

/** Tidy the page text before it is sent: no blank-line runs, no site chrome, at most 18,000 characters. */
export function cleanPracticeText(text: string): string {
  return text
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => !/^(previous|next|close|show correct answer and explanation)$/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 18_000);
}

export interface PracticeRead {
  text: string;
  /** A graph, diagram or picture inside the question (text alone would miss it). */
  hasFigure: boolean;
}

/**
 * Runs inside the My Practice page (serialized by chrome.scripting), so it must not use anything from
 * this module. Reads the open question dialog, with each math element replaced by its LaTeX.
 */
export function readPracticePageInPage(): PracticeRead {
  const tex = (n: Element): string => {
    const t = n.localName;
    const c = Array.from(n.children);
    const all = () => c.map(tex).join("");
    switch (t) {
      case "annotation":
      case "annotation-xml":
        return "";
      case "semantics":
        return c[0] ? tex(c[0]) : "";
      case "mi":
      case "mn":
      case "mtext":
      case "ms":
        return (n.textContent ?? "").trim();
      case "mo": {
        const s = (n.textContent ?? "").trim();
        return s === "−" ? "-" : s === "≤" ? "\\le " : s === "≥" ? "\\ge " : s === "×" ? "\\times " : s;
      }
      case "mspace":
        return " ";
      case "msup":
        return `{${c[0] ? tex(c[0]) : ""}}^{${c[1] ? tex(c[1]) : ""}}`;
      case "msub":
        return `{${c[0] ? tex(c[0]) : ""}}_{${c[1] ? tex(c[1]) : ""}}`;
      case "msubsup":
        return `{${c[0] ? tex(c[0]) : ""}}_{${c[1] ? tex(c[1]) : ""}}^{${c[2] ? tex(c[2]) : ""}}`;
      case "mfrac":
        return `\\frac{${c[0] ? tex(c[0]) : ""}}{${c[1] ? tex(c[1]) : ""}}`;
      case "msqrt":
        return `\\sqrt{${all()}}`;
      case "mroot":
        return `\\sqrt[${c[1] ? tex(c[1]) : ""}]{${c[0] ? tex(c[0]) : ""}}`;
      case "mfenced":
        return `${n.getAttribute("open") ?? "("}${c.map(tex).join(n.getAttribute("separators") ?? ",")}${n.getAttribute("close") ?? ")"}`;
      case "mover":
      case "munder":
      case "munderover":
        return c[0] ? tex(c[0]) : "";
      default:
        return all();
    }
  };
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog'));
  const root =
    dialogs.find((d) => /rationale|correct answer/i.test(d.textContent ?? "")) ?? dialogs[0] ?? document.querySelector("main") ?? document.body;
  const hasFigure = Array.from(root.querySelectorAll("img, svg, canvas")).some((el) => {
    if (el.closest("button, header, nav, math, .katex, mjx-container")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 80 && r.height > 60;
  });
  const clone = root.cloneNode(true) as Element;
  const swap = (el: Element, latex: string) => el.replaceWith(document.createTextNode(` \\(${latex.trim()}\\) `));
  clone.querySelectorAll(".katex").forEach((k) => {
    const ann = k.querySelector('annotation[encoding="application/x-tex"]');
    const m = k.querySelector("math");
    if (ann?.textContent) swap(k, ann.textContent);
    else if (m) swap(k, tex(m));
  });
  clone.querySelectorAll('script[type^="math/tex"]').forEach((s) => {
    let prev = s.previousElementSibling;
    while (prev && /MathJax/.test(prev.className.toString())) {
      const p = prev.previousElementSibling;
      prev.remove();
      prev = p;
    }
    swap(s, s.textContent ?? "");
  });
  clone.querySelectorAll("mjx-container").forEach((m) => {
    const ml = m.querySelector("math");
    if (ml) swap(m, tex(ml));
  });
  clone.querySelectorAll("math").forEach((m) => swap(m, tex(m)));
  clone.querySelectorAll('script, style, noscript, button, svg, img, canvas, [aria-hidden="true"]').forEach((e) => e.remove());
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-100000px;top:0;width:900px;white-space:normal;";
  holder.append(clone);
  document.body.append(holder);
  const text = holder.innerText;
  holder.remove();
  return { text: text.slice(0, 40_000), hasFigure };
}

/** Read the practice question on a tab. Null when the page could not be read (not My Practice, or no permission). */
export async function readPracticeTab(tabId: number): Promise<PracticeRead | null> {
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: readPracticePageInPage });
    const reads = results
      .map((r) => r.result as PracticeRead | undefined)
      .filter((r): r is PracticeRead => Boolean(r && typeof r.text === "string" && r.text.trim()));
    const best = reads.sort((a, b) => Number(showsAnswer(b.text)) - Number(showsAnswer(a.text)) || b.text.length - a.text.length)[0];
    return best ? { text: cleanPracticeText(best.text), hasFigure: Boolean(best.hasFigure) } : null;
  } catch {
    return null;
  }
}
