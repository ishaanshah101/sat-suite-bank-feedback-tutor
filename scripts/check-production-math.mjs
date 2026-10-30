// Production check for SAT Math (and a Reading and Writing regression) against a deployed Rulecard.
// Creates a throwaway account, runs real model calls, then deletes the account.
// Usage: node scripts/check-production-math.mjs  (BASE=https://... to target another deployment)
import fs from "node:fs";
const BASE = process.env.BASE ?? "https://rulecard.vercel.app";
const IMG = `data:image/png;base64,${fs.readFileSync(new URL("../tests/fixtures/math-table-question.png", import.meta.url)).toString("base64")}`;
const email = `mathcheck-${Date.now()}@example.com`;
const password = "math-check-pass-1";
let pass = 0, fail = 0;
const out = [];
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; const line = `${cond ? "PASS" : "FAIL"} | ${name}${extra ? " | " + String(extra).replace(/\s+/g, " ").slice(0, 300) : ""}`; console.log(line); out.push(line); };
let token = null;
const j = async (path, init = {}) => {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, ms: Date.now() - t0 };
};
try {
  const ping = await j("/api/ping"); ok("ping", ping.data?.db && ping.data?.ai, ping.text);
  const up = await j("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) }); token = up.data?.token; ok("signup", Boolean(token), up.status);

  // 1. Grid-in from pasted text.
  const gridText = "SAT Math. Question ID: 1a2b3c4d. Algebra. Linear equations in one variable. Medium. 3x + 5 = 2(x + 6). What is the value of x? Correct Answer: 7";
  const ex1 = await j("/api/extract", { method: "POST", body: JSON.stringify({ text: gridText, source: "paste" }) });
  const q1 = ex1.data?.question;
  ok("grid-in extracted as Math / spr with answer 7", q1?.section === "math" && q1?.format === "spr" && q1?.answers?.includes("7") && q1?.choices === null, `${ex1.ms}ms ${JSON.stringify({ s: q1?.section, f: q1?.format, a: q1?.answers, skill: q1?.skill, stem: q1?.stem, passage: q1?.passage })}`);
  const bad = await j("/api/explain", { method: "POST", body: JSON.stringify({ questionId: q1?.id, picked: "spr", response: "3 1/2" }) });
  ok("mixed number rejected before any AI call", bad.status === 400 && bad.data?.code === "invalid_response", bad.text);
  const wrong = await j("/api/explain", { method: "POST", body: JSON.stringify({ questionId: q1?.id, picked: "spr", response: "17/5", reasoning: "I divided 17 by 5" }) });
  const c1 = wrong.data?.card;
  ok("wrong grid-in: graded wrong, Math rule, steps, answer 7", wrong.status === 200 && wrong.data?.isCorrect === false && /^(LE1|MTH)-/.test(c1?.rule_id ?? "") && c1?.steps?.length >= 2 && c1?.correct_answer === "7" && c1?.correct_letter === null, `${wrong.ms}ms ${wrong.data?.provider}/${wrong.data?.model} rule=${c1?.rule_id} steps=${JSON.stringify(c1?.steps)} shortcut=${c1?.shortcut} fails=${c1?.why_pick_fails} ${wrong.status !== 200 ? wrong.text : ""}`);
  const right = await j("/api/explain", { method: "POST", body: JSON.stringify({ questionId: q1?.id, picked: "spr", response: "7" }) });
  ok("right grid-in: graded right, got_it_right", right.data?.isCorrect === true && right.data?.card?.diagnosis === "got_it_right", `${right.ms}ms`);

  // 2. Math multiple choice from pasted text.
  const mcqText = "SAT Math. Question ID: 2b3c4d5e. Advanced Math. Nonlinear functions. Hard. The function f is defined by f(x) = x^2 - 6x + 5. What is the minimum value of f(x)? A. -4 B. 3 C. 5 D. 9 Correct Answer: A";
  const ex2 = await j("/api/extract", { method: "POST", body: JSON.stringify({ text: mcqText, source: "paste" }) });
  const q2 = ex2.data?.question;
  ok("Math multiple choice extracted with correct A", q2?.section === "math" && q2?.format === "mcq" && q2?.correct === "A", `${ex2.ms}ms skill=${q2?.skill} choices=${JSON.stringify(q2?.choices)}`);
  const e2 = await j("/api/explain", { method: "POST", body: JSON.stringify({ questionId: q2?.id, picked: "B", reasoning: "I thought the vertex x value was the minimum" }) });
  ok("Math MCQ card: correct A, Nonlinear-function rule, steps, eliminations for C and D", e2.data?.isCorrect === false && e2.data?.card?.correct_letter === "A" && /^(NLF|MTH)-/.test(e2.data?.card?.rule_id ?? "") && e2.data?.card?.steps?.length >= 2 && e2.data?.card?.eliminations?.map((x) => x.letter).sort().join("") === "CD", `${e2.ms}ms rule=${e2.data?.card?.rule_id} steps=${JSON.stringify(e2.data?.card?.steps)} ${e2.status !== 200 ? e2.text : ""}`);

  // 3. Screenshot with a table (vision).
  const ex3 = await j("/api/extract", { method: "POST", body: JSON.stringify({ image: IMG, source: "capture" }) });
  const q3 = ex3.data?.question;
  ok("screenshot: Math MCQ with the table read into the figure, answer B", q3?.section === "math" && q3?.format === "mcq" && q3?.correct === "B" && /19/.test(q3?.figure ?? "") && q3?.qbId === "7c3e9a21", `${ex3.ms}ms figure=${q3?.figure} stem=${q3?.stem} choices=${JSON.stringify(q3?.choices)} ${ex3.status !== 200 ? ex3.text : ""}`);
  const e3 = await j("/api/explain", { method: "POST", body: JSON.stringify({ questionId: q3?.id, picked: "C", reasoning: "slope is 6 because it goes up 6 each row" }) });
  ok("screenshot card names the row-step trap (LFN rule), correct B", e3.data?.card?.correct_letter === "B" && /^(LFN|MTH)-/.test(e3.data?.card?.rule_id ?? ""), `${e3.ms}ms rule=${e3.data?.card?.rule_id} why=${e3.data?.card?.why_pick_fails}`);

  // 4. Drill on the grid-in attempt, verified by an independent solve.
  const d = await j("/api/drill", { method: "POST", body: JSON.stringify({ attemptId: wrong.data?.attemptId }) });
  ok("Math drill written and verified", d.status === 200 && ["spr", "mcq"].includes(d.data?.format), `${d.ms}ms ${d.status} format=${d.data?.format} stem=${d.data?.question?.stem} ${d.status !== 200 ? d.text : ""}`);
  if (d.status === 200) {
    const body = d.data.format === "spr" ? { drillId: d.data.drillId, response: "0" } : { drillId: d.data.drillId, picked: "A" };
    const chk = await j("/api/drill/check", { method: "POST", body: JSON.stringify(body) });
    ok("drill check returns the answer and solution steps", chk.status === 200 && (chk.data?.correctAnswer || chk.data?.correctLetter) && chk.data?.solution?.length >= 1, JSON.stringify(chk.data).slice(0, 250));
  }

  // 5. Chat about the Math question.
  const chat = await fetch(BASE + "/api/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ attemptId: wrong.data?.attemptId, messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Why can't I just divide 17 by 5?" }] }] }) });
  const chatText = await chat.text();
  ok("Math chat streams a reply", chat.status === 200 && chatText.includes("text-delta"), chatText.match(/"delta":"([^"]{0,120})/)?.[1]);

  // 6. Reading and Writing still works.
  const rw = await j("/api/extract", { method: "POST", body: JSON.stringify({ text: "Question ID: 0badf00d. The study ended in 2019 _____ the results were published a year later. Which choice completes the text so that it conforms to the conventions of Standard English? A. 2019, the B. 2019; the C. 2019 the D. 2019, and the Correct Answer: B", source: "paste" }) });
  ok("R&W still extracts as rw/mcq", rw.data?.question?.section === "rw" && rw.data?.question?.format === "mcq" && rw.data?.question?.correct === "B", rw.ms);
  const rwe = await j("/api/explain", { method: "POST", body: JSON.stringify({ questionId: rw.data?.question?.id, picked: "A" }) });
  ok("R&W card unchanged (BND rule, no steps)", rwe.data?.card?.rule_id?.startsWith("BND") && rwe.data?.card?.steps?.length === 0 && rwe.data?.isCorrect === false, `${rwe.ms}ms ${rwe.data?.card?.rule_id}`);

  // 7. History and stats.
  const at = await j("/api/attempts?limit=10");
  ok("history lists both sections with results", at.data?.attempts?.some((a) => a.section === "math" && a.response === "17/5" && a.result === "missed") && at.data?.attempts?.some((a) => a.section === "rw"), JSON.stringify(at.data?.attempts?.map((a) => [a.section, a.format, a.response ?? a.picked, a.result])));
  const rules = await fetch(BASE + "/rules?section=math", { headers: { authorization: `Bearer ${token}` } });
  ok("rules page for Math responds", rules.status === 200 || rules.status === 307, rules.status);
} catch (e) { ok("script completed", false, e.stack); }
finally {
  const del = await j("/api/account", { method: "DELETE", body: JSON.stringify({ password }) });
  ok("test account deleted", del.status === 200, del.text);
}
console.log(`SUMMARY: ${pass}/${pass + fail} passed`);
process.exitCode = fail ? 1 : 0;
