// Accuracy check for the Mac Practice Test Helper's answer engine (POST /api/solve, text mode).
// 22 hard SAT and ACT questions written for this check (no College Board text), with answers verified by hand
// and, for Math, by code. Creates a throwaway account, solves every question, prints accuracy and timing,
// then deletes the account. Usage: BASE=https://rulecard.vercel.app node scripts/check-helper-accuracy.mjs
const BASE = process.env.BASE ?? "https://rulecard.vercel.app";
const EXTRA_HEADERS = process.env.BYPASS ? { "x-vercel-protection-bypass": process.env.BYPASS } : {};
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

const mc = (stem, choices, answer, exam = "SAT Math") => ({ text: `${exam}\n${stem}\n${choices.map((c, i) => `${"ABCDE"[i]}) ${c}`).join("\n")}`, answer });
const actFGHJ = (stem, choices, answer, exam) => ({ text: `${exam}\n${stem}\n${choices.map((c, i) => `${"FGHJK"[i]}) ${c}`).join("\n")}`, answer });
const spr = (stem, answer) => ({ text: `SAT Math (student-produced response: enter your answer)\n${stem}`, answer });

const QUESTIONS = [
  spr("3x + 5 = 2(x + 6). What is the value of x?", "7"),
  mc("For the linear function f, f(2) = 13, f(4) = 19 and f(6) = 25. What is the value of f(10)?", ["31", "37", "67", "43"], "B"),
  spr("In the equation x^2 - 10x + c = 0, c is a constant. If the equation has exactly one real solution, what is the value of c?", "25"),
  spr("The system 2x + 3y = 12 and 4x + ky = 7 has no solution. If k is a constant, what is the value of k?", "6"),
  mc("A store raises the price of a jacket by 20%, then lowers the new price by 25%. Compared with the original price, the final price is:", ["5% lower", "10% lower", "5% higher", "the same"], "B"),
  spr("The circle in the xy-plane has equation x^2 + y^2 - 6x + 8y = 11. What is the radius of the circle?", "6"),
  spr("A colony of 500 bacteria doubles every 3 hours. How many bacteria are in the colony after 12 hours?", "8000"),
  spr("The mean of five numbers is 12. When one of the numbers is removed, the mean of the remaining four numbers is 10. What number was removed?", "20"),
  spr("In a right triangle, sin(x°) = cos(40°), where 0 < x < 90. What is the value of x?", "50"),
  mc("What are all the solutions to the equation sqrt(x + 7) = x - 5?", ["2 only", "9 only", "2 and 9", "There are no solutions."], "B"),
  spr("Line k is perpendicular to the line 3x - 4y = 8 and passes through the point (3, 1). What is the y-intercept of line k?", "5"),
  actFGHJ("Which of the following is the solution set of |2x - 3| < 7?", ["x < 5", "-2 < x < 5", "-5 < x < 2", "x > -2", "x < -2 or x > 5"], "B", "ACT Mathematics, question 24"),
  spr("Two fair six-sided dice are rolled. What is the probability that the sum of the two numbers rolled is 8?", "5/36"),
  mc("The museum reopened in May ______ visitors lined up for hours to see the new exhibit.\nWhich choice completes the text so that it conforms to the conventions of Standard English?", ["May, visitors", "May visitors", "May; visitors", "May, and, visitors"], "C", "SAT Reading and Writing"),
  mc("The collection of rare maps, donated by a retired sea captain, ______ now on display in the library's east wing.\nWhich choice completes the text so that it conforms to the conventions of Standard English?", ["are", "were", "is", "have been"], "C", "SAT Reading and Writing"),
  mc("In early trials, the drug sharply reduced symptoms in mice. ______ it had no measurable effect in the first human trial.\nWhich choice completes the text with the most logical transition?", ["Therefore,", "However,", "Similarly,", "For example,"], "B", "SAT Reading and Writing"),
  mc("All three ______ findings surprised the review committee, which had expected the opposite result.\nWhich choice completes the text so that it conforms to the conventions of Standard English?", ["researcher's", "researchers", "researchers'", "researcher"], "C", "SAT Reading and Writing"),
  mc("Having finished the final experiment late at night, ______\nWhich choice completes the text so that it conforms to the conventions of Standard English?", ["the data were recorded by Lena in her notebook.", "Lena recorded the data in her notebook.", "the recording of the data was done by Lena.", "Lena's notebook was where the data were recorded."], "B", "SAT Reading and Writing"),
  mc("After months of negotiation, the company finally updated ______ privacy policy to meet the new law.\nWhich choice completes the text so that it conforms to the conventions of Standard English?", ["it's", "its", "its'", "their"], "B", "SAT Reading and Writing"),
  mc("The team practiced every afternoon for six weeks, [1] they won the regional championship in March.\nQuestion 1: Which choice is correct at underlined portion [1]?", ["NO CHANGE", "weeks, so they", "weeks they", "weeks; and they"], "B", "ACT English"),
  actFGHJ("Table 1 shows the dissolved oxygen in a lake at four water temperatures: 10 °C, 11.3 mg/L; 20 °C, 9.1 mg/L; 30 °C, 7.6 mg/L; 40 °C, 6.4 mg/L. According to Table 1, as water temperature increased from 10 °C to 40 °C, the dissolved oxygen:", ["increased only.", "decreased only.", "increased and then decreased.", "remained constant."], "B", "ACT Science, Passage II, question 8"),
  mc("Maria checked the forecast, packed a folding umbrella and pulled on her rain boots, even though the morning sky was completely clear.\nBased on the text, Maria most likely:", ["expected it to rain later in the day.", "disliked wearing sneakers.", "had forgotten what the weather was like.", "wanted to protect her shoes from mud that was already there."], "A", "SAT Reading and Writing"),
];

const sameAnswer = (got, want) => {
  if (!got) return false;
  if (/^[A-E]$/.test(want)) return got.letter === want;
  const clean = (s) => String(s ?? "").replace(/\s+/g, "").replace(/^\+/, "");
  const v = (s) => { const t = clean(s); if (t.includes("/")) { const [a, b] = t.split("/").map(Number); return a / b; } return Number(t); };
  return clean(got.value) === want || Math.abs(v(got.value) - v(want)) < 5e-4 * Math.max(1, Math.abs(v(want)));
};

let token = null;
const call = async (path, init = {}) => {
  const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...EXTRA_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  return res;
};

async function solve(q) {
  const started = Date.now();
  const res = await call("/api/solve", { method: "POST", body: JSON.stringify({ text: q.text }) });
  let first = null, done = null, error = null, firstMs = null, buf = "";
  const handle = (line) => {
    if (!line.trim()) return;
    const e = JSON.parse(line);
    if (e.type === "first") { first = e.result; firstMs = Date.now() - started; }
    if (e.type === "done") { done = e; if (firstMs === null) firstMs = Date.now() - started; }
    if (e.type === "error") error = e.error;
  };
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    lines.forEach(handle);
  }
  handle(buf);
  return { first, done, error, ms: Date.now() - started, firstMs, status: res.status };
}

const email = `helper-check-${Date.now()}@example.com`;
const password = `Chk-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const up = await call("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
token = (await up.json().catch(() => ({})))?.token;
if (!token) { console.error("signup failed", up.status); process.exit(1); }

const results = new Array(QUESTIONS.length);
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < QUESTIONS.length) {
    const i = next++;
    results[i] = await solve(QUESTIONS[i]).catch((e) => ({ error: String(e) }));
  }
}));

let right = 0, quickRight = 0;
const times = [];
results.forEach((r, i) => {
  const q = QUESTIONS[i];
  const ok = sameAnswer(r.done?.result, q.answer);
  const quickOk = sameAnswer(r.first, q.answer);
  right += ok; quickRight += quickOk;
  if (r.done) times.push(r.done.ms);
  const got = r.done ? (r.done.result.letter ?? r.done.result.value) : `ERR ${r.error}`;
  console.log(`${ok ? "PASS" : "FAIL"} | #${i + 1} want ${q.answer} got ${got} (${r.done?.result.answer ?? ""}) | quick ${r.first ? (r.first.letter ?? r.first.value) : "-"} @${r.firstMs ?? "-"}ms | final ${r.done?.agreement ?? "-"} @${r.done?.ms ?? r.ms}ms`);
});
times.sort((a, b) => a - b);
const firsts = results.map((r) => r.firstMs).filter((n) => n != null).sort((a, b) => a - b);
console.log(`FIRST ANSWER: median ${firsts[Math.floor(firsts.length / 2)] ?? "-"} ms`);
console.log(`SUMMARY: final ${right}/${QUESTIONS.length} right, quick ${quickRight}/${QUESTIONS.length} right, median final ${times[Math.floor(times.length / 2)] ?? "-"} ms, slowest ${times.at(-1) ?? "-"} ms`);

const del = await call("/api/account", { method: "DELETE", body: JSON.stringify({ password }) });
console.log(`test account deleted: ${del.status === 200}`);
