import { createElement } from "react";
import { renderMathHtml } from "@/lib/math/render";

/** Text that may contain LaTeX in \( \) or \[ \]. Plain parts are escaped and math becomes MathML, so the HTML is safe. */
export function MathText({ text, as = "span", className }: { text: string; as?: "span" | "p" | "div" | "li" | "dd"; className?: string }) {
  return createElement(as, { className, dangerouslySetInnerHTML: { __html: renderMathHtml(text) } });
}
