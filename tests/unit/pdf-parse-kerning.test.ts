// Real College Board exports: pdf.js splits "rt" kerning pairs inside a run ("Ear th"), and a superscript
// (km²) arrives with a zero-height space run beside it. Both came from the owner's own exports.
import { test } from "vitest";
import assert from "node:assert/strict";
import { linesFromItems, repairKerningSplits, type PageItems, type TextItem } from "@/lib/questions/pdf-parse";

const run = (str: string, x: number, y = 700, width = str.length * 4, height = 9.3): TextItem => ({ str, x, y, width, height });
const space = (x: number, y = 700): TextItem => ({ str: " ", x, y, width: 2.2, height: 0 });

/** A page laid out like a Question Bank export: every word its own run, a space run between words. */
function cbPage(words: string[], y = 700): TextItem[] {
  const items: TextItem[] = [];
  let x = 18;
  for (const w of words) {
    items.push(run(w, x, y));
    x += w.length * 4;
    items.push(space(x, y));
    x += 2.2;
  }
  return items;
}

test("kerning splits inside a run are joined in Question Bank exports", () => {
  const filler = Array.from({ length: 300 }, (_, i) => `word${i}`);
  const pages: PageItems[] = [{ page: 1, items: [...cbPage(filler, 720), ...cbPage(["biologist", "Mar tha", "studied", "the", "deser t", "of", "Ear th", "they’ ll", "go", "after", "the", "rain"], 700)] }];
  const fixed = repairKerningSplits(pages);
  const text = linesFromItems(fixed[0]).map((l) => l.text).join("\n");
  assert.match(text, /biologist Martha studied the desert of Earth they’ll go after the rain/);
});

test("a PDF that writes whole phrases per run keeps its spaces", () => {
  const items = Array.from({ length: 300 }, (_, i) => run(`after the rain number ${i}`, 18, 700 - i * 12));
  const pages: PageItems[] = [{ page: 1, items }];
  assert.deepEqual(repairKerningSplits(pages), pages);
});

test("a superscript with a space run beside it joins its own line, not a line of its own", () => {
  const items: TextItem[] = [
    run("Answer", 18, 520),
    run("A. 200,000 km", 18, 500),
    run("2", 70, 504, 3, 5.5),
    space(73, 504),
    run("Puntland Desert,", 82, 500),
    run("B. 200,000 km2, Puntland Desert", 18, 480),
  ];
  const lines = linesFromItems({ page: 1, items }).map((l) => l.text);
  assert.deepEqual(lines, ["Answer", "A. 200,000 km2 Puntland Desert,", "B. 200,000 km2, Puntland Desert"]);
});
