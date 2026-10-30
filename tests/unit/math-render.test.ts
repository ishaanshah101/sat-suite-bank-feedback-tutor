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
});
