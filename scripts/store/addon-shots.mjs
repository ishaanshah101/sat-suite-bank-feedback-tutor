// Loads the built extension in Chromium with a made-up local study history (no College Board text) and a
// mocked server, then screenshots the add-on screens into store/.panels/addons-*.png for review and the store.
// Run: node scripts/build-extension.mjs && node scripts/store/addon-shots.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const OUT = path.join(REPO, "store", ".panels");
fs.mkdirSync(OUT, { recursive: true });

const DAY = 86_400_000;
const now = Date.now();
let n = 0;
const base = (p) => ({
  attemptId: `seed-${++n}`, at: now, ruleId: "BND-01", ruleName: "Joining two complete sentences",
  ruleStatement: "Two complete sentences can be joined only by a period, a semicolon, a comma plus a FANBOYS word, a colon, or a dash.",
  takeaway: "Two sentences, one comma: never.", whyCorrect: "A semicolon joins two complete sentences.", whyPickFails: "A comma alone is a comma splice.",
  diagnosis: "rule_gap", confidence: 0.9, picked: "A", correct: "C", result: "missed", qbId: null,
  domain: "Standard English Conventions", skill: "Boundaries", difficulty: "Medium",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  passage: "The library repaired every donated bike last spring ______ the most requested were the cargo bikes.",
  choices: { A: "spring, the", B: "spring the", C: "spring; the", D: "spring, and, the" },
  solvedByModel: false, seconds: 64, note: "", starred: false, drills: [], section: "rw", format: "mcq", ...p,
});
const words = [
  ["tempered", "inflamed", "The critic's praise was tempered by concern about the film's pacing.", "Tempered means moderated or softened, which fits a review that mixes praise with concern."],
  ["meticulous", "careless", "The restorer was meticulous, cleaning each tile by hand.", "Meticulous means extremely careful about details, which matches cleaning each tile by hand."],
  ["ephemeral", "enduring", "The ice sculptures were ephemeral, gone by the afternoon.", "Ephemeral means lasting a very short time, which matches sculptures gone by the afternoon."],
  ["corroborate", "dispute", "New measurements corroborate the earlier estimate of the lake's depth.", "Corroborate means to confirm, which fits new data agreeing with an earlier estimate."],
  ["novel", "familiar", "The team proposed a novel method that no lab had tried before.", "Novel means new and original, which fits a method no lab had tried."],
  ["pragmatic", "idealistic", "The mayor took a pragmatic approach, funding repairs before new projects.", "Pragmatic means practical, which fits putting repairs ahead of new projects."],
];
const log = [];
words.forEach(([word, wrong, sentence, why], i) => {
  const choices = { A: wrong, B: "unrelated", C: word, D: "partial" };
  log.push(base({ ruleId: "WIC-01", ruleName: "Context decides the meaning", skill: "Words in Context", domain: "Craft and Structure", at: now - i * DAY - 3600_000,
    passage: sentence.replace(word, "______"), choices, correct: "C", picked: i % 2 ? "C" : "A", result: i % 2 ? "right" : "missed", whyCorrect: why, whyPickFails: `${wrong} doesn't fit the sentence.` }));
});
const skills = [["Boundaries", "BND-01", "Joining two complete sentences"], ["Form, Structure, and Sense", "FSS-01", "Subject-verb agreement"], ["Transitions", "TRN-01", "Contrast transitions"], ["Linear functions", "LFN-03", "Equal steps in tables"], ["Linear equations in one variable", "LE1-01", "Undo operations in order"], ["Central Ideas and Details", "CID-01", "The main idea covers the whole text"]];
for (let d = 0; d < 70; d++) {
  if (d % 7 === 3 || d % 11 === 5) continue;
  const count = (d * 7) % 13;
  for (let k = 0; k < count; k++) {
    const [skill, ruleId, ruleName] = skills[(d + k) % skills.length];
    const math = ruleId.startsWith("L");
    log.push(base({ at: now - d * DAY - k * 600_000 - 7200_000, skill, ruleId, ruleName, section: math ? "math" : "rw", domain: math ? "Algebra" : "Standard English Conventions",
      result: (d + k) % 3 ? "right" : "missed", picked: (d + k) % 3 ? "C" : "A", seconds: 50 + ((d * k) % 60), drills: k % 4 === 0 ? [{ at: now - d * DAY, correct: true }] : [] }));
  }
}

const ext = fs.mkdtempSync(path.join(os.tmpdir(), "rc-ext-"));
fs.cpSync(path.join(REPO, "extension"), ext, { recursive: true });
const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "rc-prof-")), {
  headless: true, channel: "chromium", args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 400, height: 1000 }, deviceScaleFactor: 2, colorScheme: "light",
});
const errors = [];
try {
  await context.route("https://rulecard.vercel.app/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/health") return route.fulfill({ json: { ok: true, version: "0.4.0", db: { ok: true }, ai: { live: "anthropic", configured: ["anthropic"], stub: false } } });
    if (p === "/api/attempts") return route.fulfill({ json: { attempts: [] } });
    return route.fulfill({ json: {} });
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(worker.url()).host;
  for (const page of context.pages()) if (page.url().endsWith("welcome.html")) await page.screenshot({ path: path.join(OUT, "addons-welcome.png") });
  await worker.evaluate(async (seed) => {
    await chrome.storage.local.set({ settings: { server: "https://rulecard.vercel.app", token: "t", email: "alex@example.com" }, "rc.addons.log.v1": seed, "rc.addons.prefs.v1": { testDate: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10) } });
  }, log);
  const panel = await context.newPage();
  panel.on("pageerror", (e) => errors.push(String(e)));
  panel.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.waitForTimeout(1500);
  const shot = async (name) => { await panel.waitForTimeout(300); await panel.screenshot({ path: path.join(OUT, name), fullPage: true }); };
  await shot("addons-home.png");
  for (const label of ["Activity", "Word bank", "Skill map"]) {
    const s = panel.locator("summary", { hasText: label }).first();
    if (await s.count()) await s.click();
  }
  await shot("addons-open.png");
  const start = panel.getByRole("button", { name: /^5 words$/ });
  if (await start.count()) {
    await start.click();
    await panel.waitForTimeout(300);
    await shot("addons-wordquiz.png");
    await panel.keyboard.press("1");
    await shot("addons-wordquiz-answered.png");
  } else errors.push("word quiz start button not found");
  await panel.keyboard.press("Escape");
  await panel.waitForTimeout(300);
  console.log(JSON.stringify({ entries: log.length, errors }, null, 1));
} finally {
  await context.close();
}
