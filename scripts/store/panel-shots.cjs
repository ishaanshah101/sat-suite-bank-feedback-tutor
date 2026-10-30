// Drives the real Rulecard 0.3.0 side panel with mocked API responses (RW + Math) and saves crisp 2x panel shots.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const OUT = path.join(REPO, "store", ".panels");
fs.mkdirSync(OUT, { recursive: true });

const rwQuestion = {
  id: "q1", qbId: "0badf00d", section: "rw", format: "mcq", source: "capture", test: "SAT", domain: "Standard English Conventions", skill: "Boundaries", difficulty: "Medium",
  stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  passage: "The study ended in 2019 ______ the results were published a year later.",
  choices: { A: "2019, the", B: "2019; the", C: "2019 the", D: "2019, and the" },
  correct: "B", answers: null, figure: null, answerSource: "official", rationale: null,
};
const rwCard = {
  rule_id: "BND-01",
  rule_statement: "Two complete sentences can be joined only by a period, a semicolon, a comma plus a FANBOYS word, a colon, or a dash.",
  correct_letter: "B", correct_answer: null,
  why_correct: "Both halves are complete sentences, and a semicolon is one of the legal joins.",
  why_pick_fails: "A comma alone between two complete sentences is a comma splice.",
  eliminations: [
    { letter: "C", reason: "Nothing between two sentences makes a run-on." },
    { letter: "D", reason: "A comma plus 'and' is legal, but 'and the' leaves the second clause without a subject here." },
  ],
  steps: [], shortcut: null,
  takeaway: "Two sentences, one comma: never.",
  diagnosis: "rule_gap", confidence: 0.95, solved_by_model: false, suggested_rule: null,
};
const rwDrill = {
  drillId: "d1", ruleId: "BND-01", ruleName: "Joining two complete sentences", format: "mcq",
  question: {
    passage: "The bridge reopened in March ______ commuters returned within a week.", figure: null,
    stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    choices: { A: "March, commuters", B: "March commuters", C: "March, and commuters", D: "March, so, commuters" },
  },
};
const rwCheck = { correct: true, format: "mcq", correctLetter: "C", correctAnswer: null, whyCorrect: "A comma plus 'and' is a legal way to join two complete sentences.", fix: null };

// Math multiple choice with a table: the classic "table steps by 2" trap.
const mathQuestion = {
  id: "q2", qbId: "7ab1e5ee", section: "math", format: "mcq", source: "capture", test: "SAT", domain: "Algebra", skill: "Linear functions", difficulty: "Hard",
  passage: null,
  figure: "\\(x\\): 2, 4, 6  ·  \\(f(x)\\): 13, 19, 25",
  stem: "The table shows three values of \\(x\\) and their corresponding values of \\(f(x)\\) for the linear function \\(f\\). What is the value of \\(f(10)\\)?",
  choices: { A: "31", B: "37", C: "67", D: "43" },
  correct: "B", answers: null, answerSource: "official", rationale: null,
};
const mathCard = {
  rule_id: "LFN-03",
  rule_statement: "In a table, the slope is the change in \\(f(x)\\) divided by the change in \\(x\\), not the change from one row to the next.",
  correct_letter: "B", correct_answer: null,
  why_correct: "Each row adds 2 to \\(x\\) and 6 to \\(f(x)\\), so the slope is \\(\\frac{6}{2} = 3\\) and \\(f(x) = 3x + 7\\), giving \\(f(10) = 37\\).",
  why_pick_fails: "67 comes from treating 6 as the slope, which ignores that \\(x\\) jumps by 2 each row.",
  eliminations: [],
  steps: ["Slope: \\(\\frac{19 - 13}{4 - 2} = 3\\).", "Intercept: \\(13 = 3(2) + b\\), so \\(b = 7\\).", "\\(f(10) = 3(10) + 7 = 37\\)."],
  shortcut: "In Desmos, enter the table and type \\(y_1 \\sim mx_1 + b\\) to fit the line, then evaluate at \\(x = 10\\).",
  takeaway: "Divide by the step in \\(x\\), not by 1.",
  diagnosis: "rule_gap", confidence: 0.94, solved_by_model: false, suggested_rule: null,
};

// Math grid-in (student-produced response), entered wrong.
const sprQuestion = {
  id: "q3", qbId: "5eedf00d", section: "math", format: "spr", source: "capture", test: "SAT", domain: "Algebra", skill: "Linear equations in one variable", difficulty: "Medium",
  passage: "\\(17x - 2 = 1\\)", figure: null,
  stem: "What value of \\(x\\) is the solution to the given equation?",
  choices: null, correct: null, answers: [".1764", ".1765", "3/17"], answerSource: "official", rationale: null,
};
const sprCard = {
  rule_id: "LE1-01",
  rule_statement: "Undo the operations in reverse order: add 2 to both sides, then divide by 17.",
  correct_letter: null, correct_answer: "3/17",
  why_correct: "Adding 2 to both sides gives \\(17x = 3\\), and dividing by 17 gives \\(x = \\frac{3}{17}\\).",
  why_pick_fails: "Subtracting 2 instead of adding it gives \\(17x = -1\\), a sign slip.",
  eliminations: [],
  steps: ["Add 2 to both sides: \\(17x = 3\\).", "Divide both sides by 17: \\(x = \\frac{3}{17}\\).", "Enter 3/17 (or .1764 or .1765)."],
  shortcut: "Graph \\(y = 17x - 2\\) and \\(y = 1\\) in Desmos and read the x-value where they cross.",
  takeaway: "Undo the subtraction before you divide.",
  diagnosis: "careless", confidence: 0.9, solved_by_model: false, suggested_rule: null,
};

const recent = [
  { id: "a1", createdAt: "2026-10-29T18:00:00Z", result: "missed", section: "math", format: "mcq", ruleId: "LFN-03", ruleName: "Equal steps in tables", skill: "Linear functions", stem: "The table shows three values of x and their corresponding values of f(x) for the linear function f. What is f(10)?" },
  { id: "a2", createdAt: "2026-10-29T17:40:00Z", result: "missed", section: "math", format: "spr", response: "-1/17", ruleId: "LE1-01", ruleName: "Undo operations in order", skill: "Linear equations in one variable", stem: "17x − 2 = 1. What value of x is the solution to the given equation?" },
  { id: "a3", createdAt: "2026-10-29T17:20:00Z", result: "missed", section: "rw", format: "mcq", ruleId: "BND-01", ruleName: "Joining two complete sentences", skill: "Boundaries", stem: "The study ended in 2019 ______ the results were published a year later." },
  { id: "a4", createdAt: "2026-10-28T20:10:00Z", result: "right", section: "rw", format: "mcq", ruleId: "FSS-01", ruleName: "Subject-verb agreement", skill: "Form, Structure, and Sense", stem: "The collection of letters, now housed in the city archive, ______ rarely shown to the public." },
  { id: "a5", createdAt: "2026-10-28T19:50:00Z", result: "missed", section: "rw", format: "mcq", ruleId: "FSS-04", ruleName: "Modifier next to its noun", skill: "Form, Structure, and Sense", stem: "Trained in both botany and chemistry, ______ the new compound in under a year." },
];

(async () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "rc-ext-"));
  fs.cpSync(path.join(REPO, "extension"), ext, { recursive: true });
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "rc-prof-")), {
    headless: true, channel: "chromium",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    viewport: { width: 400, height: 1400 }, deviceScaleFactor: 2, colorScheme: "light",
  });
  let mode = "rw";
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await context.route("https://rulecard.vercel.app/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/health") return json(route, { ok: true, version: "0.3.0", db: { ok: true }, ai: { live: "anthropic", configured: ["anthropic"], stub: false } });
    if (p === "/api/attempts") return json(route, { attempts: recent });
    const q = mode === "math" ? mathQuestion : mode === "spr" ? sprQuestion : rwQuestion;
    if (p === "/api/extract") return json(route, { question: q, provider: "anthropic", model: "x" });
    if (p === "/api/explain") {
      if (mode === "math") return json(route, { attemptId: "att2", card: mathCard, question: q, rule: { id: "LFN-03", name: "Equal steps in tables" }, isCorrect: false });
      if (mode === "spr") return json(route, { attemptId: "att3", card: sprCard, question: q, rule: { id: "LE1-01", name: "Undo operations in order" }, isCorrect: false });
      return json(route, { attemptId: "att1", card: rwCard, question: q, rule: { id: "BND-01", name: "Joining two complete sentences" }, isCorrect: false });
    }
    if (p === "/api/drill") return json(route, rwDrill);
    if (p === "/api/drill/check") return json(route, rwCheck);
    return json(route, {});
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(worker.url()).host;
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { server: "https://rulecard.vercel.app", token: "t", email: "alex@example.com" } }));
  const panel = await context.newPage();
  const shot = async (name, top = 0) => {
    await panel.waitForTimeout(500);
    await panel.screenshot({ path: path.join(OUT, name), fullPage: true, clip: { x: 0, y: Math.max(0, top), width: 400, height: 900 } });
  };
  const topOf = (sel) => panel.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY, sel);
  const capture = async () => {
    await worker.evaluate(async () => chrome.storage.session.set({ pendingCapture: { image: "data:image/png;base64,iVBORw0KGgo=", at: Date.now() } }));
  };

  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.getByText("All history").waitFor();
  await shot("home.png");

  // RW
  mode = "rw";
  await capture();
  await panel.getByText("Which did you pick?").waitFor();
  await panel.locator(".pick", { hasText: /^A$/ }).click();
  await panel.locator("#reasoning").fill("I thought a comma was enough");
  await shot("question.png");
  await panel.getByRole("button", { name: "Explain", exact: true }).click();
  await panel.locator(".rule-id").waitFor();
  await shot("rule.png", (await topOf(".rule-id")) - 300);
  await panel.getByRole("button", { name: "Test me" }).click();
  await panel.getByText("Test me · BND-01").waitFor();
  await panel.locator(".choice.selectable", { hasText: "March, and commuters" }).click();
  await panel.getByText("Another one").waitFor();
  const drillTop = await panel.evaluate(() => [...document.querySelectorAll("h2")].find((e) => e.textContent.startsWith("Test me")).getBoundingClientRect().top + window.scrollY);
  await shot("drill.png", drillTop - 330);

  // Math MCQ with table
  mode = "math";
  await capture();
  await panel.getByText("What is the value of").first().waitFor();
  await panel.locator(".pick", { hasText: /^C$/ }).click();
  await panel.locator("#reasoning").fill("Each row goes up by 6, so the slope is 6");
  await shot("math-question.png", (await topOf(".card:nth-of-type(2)")) - 12);
  await panel.getByRole("button", { name: "Explain", exact: true }).click();
  await panel.locator(".rule-id").waitFor();
  await shot("math-rule.png", (await topOf(".rule-id")) - 120);

  // Math grid-in
  mode = "spr";
  await capture();
  await panel.getByText("What did you enter?").waitFor();
  await panel.locator("#spr-input").fill("-1/17");
  await panel.locator("#spr-input").dispatchEvent("input");
  await panel.getByRole("button", { name: "Explain", exact: true }).click();
  await panel.locator(".rule-id").waitFor();
  await shot("spr-rule.png", (await topOf(".rule-id")) - 330);
  await context.close();
})();
