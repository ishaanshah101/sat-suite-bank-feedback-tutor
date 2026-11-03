import { describe, expect, it } from "vitest";
import { hasMath, mathToPlain, renderMathHtml, splitMath } from "@/lib/math/render";

describe("math rendering", () => {
  it("splits inline and display math and leaves money alone", () => {
    expect(splitMath("Pay $12 if \\(x = 3\\) and \\[y^2\\]")).toEqual([
      { kind: "text", value: "Pay $12 if ", display: false },
      { kind: "math", value: "x = 3", display: false },
      { kind: "text", value: " and ", display: false },
      { kind: "math", value: "y^2", display: true },
    ]);
    expect(hasMath("costs $5")).toBe(false);
    expect(hasMath("\\(\\frac{2}{3}\\)")).toBe(true);
  });

  it("renders MathML and escapes plain text", () => {
    const html = renderMathHtml("<b>If</b> \\(\\frac{2}{3}\\) and $4");
    expect(html).toContain("&lt;b&gt;If&lt;/b&gt;");
    expect(html).toContain("<math");
    expect(html).toContain("<mfrac>");
    expect(html).toContain("$4");
    expect(html).not.toContain("<b>");
  });

  it("draws a sign after an operator or bracket as a prefix, not as subtraction", () => {
    const html = renderMathHtml("\\(4x - 28 = -24, (-3, 2)\\)");
    expect(html.match(/form="prefix"/g)).toHaveLength(2);
    expect(html).toContain("<mn>4</mn><mi>x</mi><mo>−</mo>");
  });

  it("does not throw on bad LaTeX and gives a plain fallback", () => {
    expect(() => renderMathHtml("\\(\\frac{1}{\\)")).not.toThrow();
    expect(mathToPlain("so \\(x = 5\\).")).toBe("so x = 5.");
  });

  it("does not let LaTeX inject links or scripts", () => {
    const html = renderMathHtml("\\(\\href{javascript:alert(1)}{x}\\)");
    expect(html).not.toMatch(/href=/i);
    expect(html).not.toMatch(/<script/i);
  });

  it("escapes markup inside \\text and refuses untrusted commands", () => {
    const text = renderMathHtml("\\(\\text{<img src=x onerror=alert(1)>}\\)");
    expect(text).not.toMatch(/<img/i);
    expect(text).toContain("&lt;img");
    for (const tex of ["\\url{x}", "\\includegraphics{x}", "\\htmlData{a=b}{x}"]) {
      const html = renderMathHtml(`\\(${tex}\\)`);
      expect(html).not.toMatch(/href=/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/\sdata-/i);
    }
  });

  it("stays linear on unclosed delimiters", () => {
    const text = "\\(".repeat(50_000);
    const start = performance.now();
    const segments = splitMath(text);
    expect(performance.now() - start).toBeLessThan(100);
    expect(segments).toEqual([{ kind: "text", value: text, display: false }]);
    expect(mathToPlain(text)).toBe(text);
  });

  it("keeps the old split for mixed, nested and empty delimiters", () => {
    expect(splitMath("a \\( \\[ b \\) c \\[ d \\] e")).toEqual([
      { kind: "text", value: "a ", display: false },
      { kind: "math", value: "\\[ b", display: false },
      { kind: "text", value: " c ", display: false },
      { kind: "math", value: "d", display: true },
      { kind: "text", value: " e", display: false },
    ]);
    expect(splitMath("\\(\\) x \\(y\\)")).toEqual([
      { kind: "math", value: "\\) x \\(y", display: false },
    ]);
    expect(splitMath("no math here")).toEqual([{ kind: "text", value: "no math here", display: false }]);
  });
});
