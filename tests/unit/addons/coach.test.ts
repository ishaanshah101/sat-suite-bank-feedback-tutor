// Coach: the official taxonomy (taxonomy.ts), the trap detector (traps.ts), badges
// (achievements.ts) and today's plan (plan.ts). Every question and explanation is made up.
// Run: node scripts/run-tests.mjs extension/test/coach.test.ts

import { test } from "vitest";
import assert from "node:assert/strict";
import { domainOfSkill, normalizeSkill, qbFilterSteps, sectionOfSkill, skillInfo, SKILLS, skillsFor } from "../../../extension/src/addons/taxonomy";
import { classifyMiss, trapInfo, trapReport, TRAPS } from "../../../extension/src/addons/traps";
import {
  awardBadges, BADGES, badgeMetrics, badgeProgress, badgeToast, evaluateBadges, longestStreak, readBadges, syncBadges, type BadgeInput,
} from "../../../extension/src/addons/achievements";
import { buildPlan, daysUntil, EXPLORE_SCORE, phaseFor, planText, rankSkills, splitGoal, type PlanInput } from "../../../extension/src/addons/plan";
import { DAY, MASTERED_BOX, type RuleSrs, type SrsState } from "../../../extension/src/addons/srs";
import { KEYS, memoryKV, setKV } from "../../../extension/src/addons/store";
import type { SetRecap } from "../../../extension/src/addons/sets";
import type { LogEntry } from "../../../extension/src/addons/log";
import { at, entry } from "./helpers";

// ---------- taxonomy ----------

test("taxonomy: 10 Reading and Writing skills and 19 Math skills, each with a domain", () => {
  assert.equal(skillsFor("rw").length, 10);
  assert.equal(skillsFor("math").length, 19);
  assert.equal(SKILLS.length, 29);
  for (const s of SKILLS) assert.ok(s.domain.length > 3, s.skill);
  assert.equal(new Set(SKILLS.map((s) => s.skill)).size, 29, "no duplicates");
});

test("taxonomy: tolerant matching of real-world spellings", () => {
  assert.equal(normalizeSkill("Form, Structure, and Sense"), "Form, Structure, and Sense");
  assert.equal(normalizeSkill("form structure and sense"), "Form, Structure, and Sense");
  assert.equal(normalizeSkill("F orm Structure & Sense".replace("F orm", "Form")), "Form, Structure, and Sense");
  assert.equal(normalizeSkill("Algebra: Linear functions"), "Linear functions");
  assert.equal(normalizeSkill("Craft and Structure: Words in Context"), "Words in Context");
  assert.equal(normalizeSkill("ratios, rates & units"), "Ratios, rates, proportional relationships, and units");
  assert.equal(normalizeSkill("percentage"), "Percentages");
  assert.equal(normalizeSkill("cross-text"), "Cross-Text Connections");
});

test("taxonomy: aliases, and ambiguous or unknown text resolves to null", () => {
  assert.equal(normalizeSkill("vocab"), "Words in Context");
  assert.equal(normalizeSkill("Trig"), "Right triangles and trigonometry");
  assert.equal(normalizeSkill("quadratics"), "Nonlinear equations in one variable and systems of equations in two variables");
  assert.equal(normalizeSkill("inference"), "Inferences");
  assert.equal(normalizeSkill("linear"), null, "five Algebra skills start with linear");
  assert.equal(normalizeSkill("data"), null);
  assert.equal(normalizeSkill("basket weaving"), null);
  assert.equal(normalizeSkill(""), null);
  assert.equal(normalizeSkill(null), null);
});

test("taxonomy: domain, section and Question Bank filter steps", () => {
  assert.equal(domainOfSkill("Boundaries"), "Standard English Conventions");
  assert.equal(domainOfSkill("Transitions"), "Expression of Ideas");
  assert.equal(domainOfSkill("Circles"), "Geometry and Trigonometry");
  assert.equal(sectionOfSkill("Circles"), "math");
  assert.equal(sectionOfSkill("Inferences"), "rw");
  const steps = qbFilterSteps(skillInfo("Boundaries")!, "Hard");
  assert.match(steps, /Test: Reading and Writing/);
  assert.match(steps, /Domain: Standard English Conventions/);
  assert.match(steps, /Skill: Boundaries/);
  assert.match(steps, /Difficulty: Hard\.$/);
  assert.match(qbFilterSteps(skillInfo("Percentages")!), /Test: Math, Domain: Problem-Solving and Data Analysis, Skill: Percentages\.$/);
});

// ---------- traps ----------

const miss = (p: Partial<LogEntry>) => entry({ result: "missed", ...p });

test("traps: Reading and Writing answer traps from the 'why your pick fails' text", () => {
  const info = { domain: "Information and Ideas", skill: "Inferences", ruleName: "Stay inside the text", ruleStatement: "The answer must follow from the text." };
  assert.equal(classifyMiss(miss({ ...info, whyPickFails: "This choice is too strong: the text only says the program may help some students." })).id, "extreme");
  assert.equal(classifyMiss(miss({ ...info, whyPickFails: "The passage never mentions what the program costs." })).id, "unsupported");
  assert.equal(classifyMiss(miss({ ...info, whyPickFails: "It captures only part of the claim and ignores the second finding." })).id, "half_right");
  assert.equal(classifyMiss(miss({ ...info, whyPickFails: "This says the opposite of what the researchers found." })).id, "reversed");
  assert.equal(classifyMiss(miss({ ...info, whyPickFails: "True, but it doesn't address the question about the method." })).id, "irrelevant");
});

test("traps: conventions traps are gated to Standard English Conventions", () => {
  const sec = { domain: "Standard English Conventions", ruleName: "Clause joining", ruleStatement: "Join clauses correctly." };
  assert.equal(classifyMiss(miss({ ...sec, skill: "Boundaries", whyPickFails: "Joining two independent clauses with only a comma creates a comma splice." })).id, "splice");
  assert.equal(classifyMiss(miss({ ...sec, skill: "Form, Structure, and Sense", whyPickFails: "The subject 'collection' is singular, so it needs a singular verb." })).id, "agreement");
  assert.equal(classifyMiss(miss({ ...sec, skill: "Form, Structure, and Sense", whyPickFails: "The surrounding verbs are in the past tense, so the present tense doesn't fit." })).id, "tense");
  assert.equal(classifyMiss(miss({ ...sec, skill: "Boundaries", whyPickFails: "A colon must follow a complete sentence, and this one doesn't." })).id, "punctuation");
  // Same words outside Conventions don't count as a splice.
  const hit = classifyMiss(miss({ domain: "Information and Ideas", skill: "Central Ideas and Details", ruleName: "Main idea", ruleStatement: "Pick the main idea.", whyPickFails: "Mentions a comma splice the author fixed, which is a detail." }));
  assert.notEqual(hit.id, "splice");
});

test("traps: Math traps and the diagnosis fallbacks", () => {
  const math = { section: "math" as const, domain: "Algebra", skill: "Linear equations in one variable", ruleName: "Answer the question asked", ruleStatement: "Report the requested quantity.", format: "mcq" as const };
  assert.equal(classifyMiss(miss({ ...math, whyPickFails: "This is the value of x, but the question asks for the value of 2x + 1." })).id, "wrong_quantity");
  assert.equal(classifyMiss(miss({ ...math, whyPickFails: "This comes from a sign error when distributing the negative." })).id, "calc_slip");
  assert.equal(classifyMiss(miss({ ...math, ruleName: "Mind the base", ruleStatement: "Percent change uses the original value.", whyPickFails: "This uses the new price as the percent base instead of the original value." })).id, "units_percent");
  assert.equal(classifyMiss(miss({ ...math, ruleName: "x", ruleStatement: "y", whyPickFails: "", diagnosis: "careless" })).id, "calc_slip");
  assert.equal(classifyMiss(miss({ ruleName: "x", ruleStatement: "y", whyPickFails: "", diagnosis: "misread" })).id, "misread");
  assert.equal(classifyMiss(miss({ ruleName: "x", ruleStatement: "y", whyPickFails: "", diagnosis: "rule_gap" })).id, "other");
});

test("traps: report counts misses only, ranks traps, and the top trap is never 'other'", () => {
  const sec = { domain: "Standard English Conventions", skill: "Boundaries", ruleName: "Clauses", ruleStatement: "Join clauses correctly." };
  const log = [
    miss({ ...sec, whyPickFails: "A comma alone between independent clauses is a comma splice." }),
    miss({ ...sec, whyPickFails: "This is a run-on sentence." }),
    miss({ ...sec, whyPickFails: "Comma splice again." }),
    miss({ ...sec, whyPickFails: "", diagnosis: "rule_gap", ruleName: "x", ruleStatement: "y", skill: "Transitions", domain: "Expression of Ideas" }),
    miss({ ...sec, whyPickFails: "", diagnosis: "rule_gap", ruleName: "x", ruleStatement: "y", skill: "Transitions", domain: "Expression of Ideas" }),
    miss({ ...sec, whyPickFails: "", diagnosis: "rule_gap", ruleName: "x", ruleStatement: "y", skill: "Transitions", domain: "Expression of Ideas" }),
    miss({ ...sec, whyPickFails: "", diagnosis: "rule_gap", ruleName: "x", ruleStatement: "y", skill: "Transitions", domain: "Expression of Ideas" }),
    entry({ ...sec, result: "right", whyPickFails: null }),
  ];
  const r = trapReport(log);
  assert.equal(r.total, 7);
  assert.equal(r.counts[0]!.id, "other");
  assert.equal(r.counts[0]!.count, 4);
  assert.equal(r.top?.id, "splice");
  assert.equal(r.top?.count, 3);
  assert.equal(r.top?.attemptIds.length, 3);
  assert.ok(Math.abs((r.top?.share ?? 0) - 3 / 7) < 1e-9);
  assert.ok(TRAPS.every((t) => trapInfo(t.id).tip.length > 20));
  assert.equal(trapReport([]).top, null);
});

// ---------- badges ----------

const NOW = at(2026, 10, 20, 15);
const days = (n: number) => n * DAY;

const rule = (ruleId: string, box: number, extra: Partial<RuleSrs> = {}): RuleSrs => ({
  ruleId, ruleName: ruleId, box, due: NOW + DAY, attemptId: `a-${ruleId}`, reps: 0, lapses: 0, lastReviewed: null, ...extra,
});

test("badges: longest streak counts consecutive local days, even across the DST change", () => {
  assert.equal(longestStreak([]), 0);
  const log = [1, 2, 3, 5, 6].map((d) => ({ at: at(2026, 10, d, 9) }));
  assert.equal(longestStreak(log), 3);
  // US clocks fall back on 2026-11-01.
  const dst = [31, 32, 33, 34].map((d) => ({ at: new Date(2026, 9, d, 23, 30).getTime() }));
  assert.equal(longestStreak(dst), 4);
  assert.equal(longestStreak([{ at: at(2026, 10, 1, 1) }, { at: at(2026, 10, 1, 23) }]), 1);
});

test("badges: volume, streak and section badges", () => {
  assert.deepEqual(evaluateBadges({ log: [], srs: {} }), []);
  const one = evaluateBadges({ log: [entry({ at: NOW })], srs: {} });
  assert.deepEqual(one, ["first-card"]);
  const ten = Array.from({ length: 10 }, (_, i) => entry({ at: NOW - days(i % 3), result: i % 2 ? "right" : "missed" }));
  const ids = evaluateBadges({ log: ten, srs: {} });
  assert.ok(ids.includes("questions-10"));
  assert.ok(ids.includes("streak-3"));
  assert.ok(!ids.includes("streak-7"));
  assert.ok(!ids.includes("both-sections"));
  const both = evaluateBadges({ log: [...ten, entry({ at: NOW, section: "math", domain: "Algebra", skill: "Linear functions" })], srs: {} });
  assert.ok(both.includes("both-sections"));
});

test("badges: mastery, comeback and review drills", () => {
  const log = [
    entry({ ruleId: "B1", at: NOW - days(40) }),
    entry({ ruleId: "B1", at: NOW - days(30) }),
    entry({ ruleId: "T2", at: NOW - days(20), result: "right", drills: Array.from({ length: 5 }, (_, i) => ({ at: NOW - days(i), correct: true, review: true })) }),
  ];
  const srs: SrsState = { B1: rule("B1", MASTERED_BOX), T2: rule("T2", 3) };
  const ids = evaluateBadges({ log, srs });
  assert.ok(ids.includes("mastered-1"));
  assert.ok(ids.includes("comeback"), "B1 was missed twice and is now mastered");
  assert.ok(ids.includes("reviews-5"));
  assert.ok(!ids.includes("mastered-5"));
  // Drills that weren't launched from the Review queue don't count toward review badges.
  const plain = [entry({ at: NOW, drills: Array.from({ length: 6 }, () => ({ at: NOW, correct: true })) })];
  assert.equal(badgeMetrics({ log: plain, srs: {} }).reviewRight, 0);
});

test("badges: perfect set, calibration, pace, hard questions and the daily goal", () => {
  const recap = (count: number, right: number): SetRecap => ({ count, right, accuracy: right / count, avgSeconds: 60, slow: 0, minutes: 8, missedRules: [], attemptIds: [], startedAt: NOW - 600_000, endedAt: NOW });
  assert.ok(evaluateBadges({ log: [], srs: {}, recaps: [recap(5, 5)] }).includes("perfect-set"));
  assert.ok(!evaluateBadges({ log: [], srs: {}, recaps: [recap(4, 4)] }).includes("perfect-set"), "needs 5 or more");
  assert.ok(!evaluateBadges({ log: [], srs: {}, recaps: [recap(6, 5)] }).includes("perfect-set"));

  const sure = (right: number) => Array.from({ length: 10 }, (_, i) => entry({ at: NOW, selfConfidence: "sure", result: i < right ? "right" : "missed" }));
  assert.ok(evaluateBadges({ log: sure(8), srs: {} }).includes("calibrated"));
  assert.ok(!evaluateBadges({ log: sure(7), srs: {} }).includes("calibrated"));
  const calib = badgeProgress({ log: sure(7), srs: {} }, {}).find((v) => v.id === "calibrated")!;
  assert.equal(calib.hint, "70% right when sure, need 80%");

  const m = badgeMetrics({
    log: [
      entry({ at: NOW, seconds: 71 }), entry({ at: NOW, seconds: 72 }),
      entry({ at: NOW, seconds: 95, section: "math", domain: "Algebra", skill: "Linear functions" }),
      entry({ at: NOW, seconds: null }), entry({ at: NOW, seconds: null, difficulty: "Hard", result: "right" }), entry({ at: NOW, seconds: null, difficulty: "Hard", result: "missed" }),
    ],
    srs: {}, dailyGoal: 6,
  });
  assert.equal(m.onPace, 2, "71 s R&W and 95 s Math are on pace; 72 s R&W isn't; untimed ignored");
  assert.equal(m.hardRight, 1);
  assert.equal(m.bestDay, 6);
  assert.ok(evaluateBadges({ log: Array.from({ length: 6 }, () => entry({ at: NOW })), srs: {}, dailyGoal: 6 }).includes("goal-day"));
});

test("badges: award keeps first earned dates; toast text", () => {
  const first = awardBadges({}, ["first-card", "questions-10"], 1000);
  assert.deepEqual(first.fresh, ["first-card", "questions-10"]);
  const again = awardBadges(first.badges, ["first-card", "questions-10", "streak-3", "not-a-badge"], 2000);
  assert.deepEqual(again.fresh, ["streak-3"]);
  assert.equal(again.badges["first-card"], 1000);
  assert.equal(again.badges["streak-3"], 2000);
  assert.equal(again.badges["not-a-badge"], undefined);
  assert.equal(badgeToast(["streak-3"]), "Badge earned: 3-day streak");
  assert.equal(badgeToast(["first-card", "questions-10"]), "2 badges earned: First rule card, 10 questions");
  assert.equal(badgeToast(["first-card", "questions-10", "streak-3", "both-sections"]), "4 badges earned: First rule card, 10 questions, 3-day streak, and more");
  assert.equal(badgeToast([]), "");
});

test("badges: sync backfills quietly on first run, then reports new badges; saved under rc.addons.badges.v1", async () => {
  const store = memoryKV();
  setKV(store);
  const history: BadgeInput = { log: Array.from({ length: 12 }, () => entry({ at: NOW })), srs: {} };
  const first = await syncBadges(history, 1000);
  assert.deepEqual(first.fresh, [], "existing history earns quietly");
  assert.ok(first.badges["questions-10"]);
  assert.equal(KEYS.badges, "rc.addons.badges.v1");
  assert.ok((store.dump()[KEYS.badges] as Record<string, number>)["first-card"]);
  const more = await syncBadges({ ...history, recaps: [{ count: 5, right: 5, accuracy: 1, avgSeconds: 50, slow: 0, minutes: 5, missedRules: [], attemptIds: [], startedAt: 0, endedAt: 1 }] }, 2000);
  assert.deepEqual(more.fresh, ["perfect-set"]);
  assert.equal((await readBadges())?.["perfect-set"], 2000);
  // A brand-new user (nothing saved, nothing earned) gets the first-card toast later.
  setKV(memoryKV());
  assert.deepEqual((await syncBadges({ log: [], srs: {} }, 1)).fresh, []);
  assert.deepEqual((await syncBadges({ log: [entry({ at: NOW })], srs: {} }, 2)).fresh, ["first-card"]);
});

test("badges: progress view lists earned first, then locked ones closest to done, with hints", () => {
  const input: BadgeInput = { log: Array.from({ length: 37 }, () => entry({ at: NOW })), srs: {} };
  const views = badgeProgress(input, { "first-card": 5, "questions-10": 6 });
  assert.equal(views.length, BADGES.length);
  assert.deepEqual(views.slice(0, 2).map((v) => v.id), ["first-card", "questions-10"]);
  const fifty = views.find((v) => v.id === "questions-50")!;
  assert.equal(fifty.hint, "37/50");
  assert.equal(fifty.earnedAt, null);
  const locked = views.filter((v) => v.earnedAt === null);
  for (let i = 1; i < locked.length; i++) assert.ok(locked[i - 1]!.value / locked[i - 1]!.goal >= locked[i]!.value / locked[i]!.goal);
  assert.ok(BADGES.every((b) => !/[\u2014]/.test(b.detail + b.label)), "no em dashes in copy");
});

// ---------- plan ----------

const YESTERDAY = at(2026, 10, 19, 12);
const base = (p: Partial<PlanInput> = {}): PlanInput => ({ log: [], srs: {}, now: NOW, dailyGoal: 10, testDate: null, ...p });
const rw = (skill: string, result: "right" | "missed", p: Partial<LogEntry> = {}) =>
  entry({ skill, domain: domainOfSkill(skill), section: "rw", result, at: YESTERDAY, ...p });
const ymd = (offsetDays: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("plan: phases by days to the test, and the goal split keeps its total", () => {
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil("not a date", NOW), null);
  assert.equal(daysUntil(ymd(0), NOW), 0);
  assert.equal(daysUntil(ymd(9), NOW), 9);
  assert.equal(daysUntil(ymd(-2), NOW), -2);
  assert.deepEqual([null, -1, 0, 1, 2, 7, 8, 14, 15, 30, 31].map(phaseFor),
    ["steady", "past", "test", "eve", "final", "final", "sharpen", "sharpen", "strengthen", "strengthen", "build"]);
  assert.deepEqual(splitGoal(10, [0.6, 0.4, 0]), [6, 4, 0]);
  assert.deepEqual(splitGoal(10, [0.4, 0.2, 0.4]), [4, 2, 4]);
  assert.deepEqual(splitGoal(7, [0.5, 0.3, 0.2]), [4, 2, 1]);
  assert.deepEqual(splitGoal(0, [1, 1]), [0, 0]);
  for (const n of [1, 3, 7, 13, 25]) assert.equal(splitGoal(n, [0.4, 0.2, 0.4]).reduce((a, b) => a + b, 0), n);
});

test("plan: a new student gets a sampler from two different domains (and both sections)", () => {
  const plan = buildPlan(base());
  assert.equal(plan.fresh, true);
  assert.equal(plan.phase, "steady");
  assert.match(plan.headline, /different skills/);
  const focus = plan.items.filter((i) => i.kind === "focus");
  assert.equal(focus.length, 2);
  assert.notEqual(domainOfSkill(focus[0]!.skill), domainOfSkill(focus[1]!.skill));
  assert.deepEqual(focus.map((i) => i.section), ["rw", "math"], "one skill from each section");
  assert.deepEqual(buildPlan(base({ sections: ["rw"] })).items.map((i) => i.section), ["rw", "rw"]);
  assert.equal(plan.goal, 10);
  assert.ok(plan.skills.every((s) => s.score === EXPLORE_SCORE));
  assert.equal(plan.skills.length, 29, "both sections when there's no history");
});

test("plan: the weakest skill leads, from history before today only", () => {
  const log = [
    ...Array.from({ length: 5 }, (_, i) => rw("Boundaries", i < 4 ? "missed" : "right")),
    ...Array.from({ length: 5 }, () => rw("Transitions", "right")),
    ...Array.from({ length: 5 }, (_, i) => rw("Words in Context", i < 2 ? "missed" : "right")),
  ];
  const plan = buildPlan(base({ log }));
  assert.equal(plan.fresh, false);
  assert.deepEqual(plan.items.map((i) => i.id), ["focus-1", "focus-2"]);
  assert.equal(plan.items[0]!.skill, "Boundaries");
  assert.match(plan.items[0]!.detail, /Missed 4 of 5, last practiced yesterday/);
  assert.match(plan.items[0]!.steps ?? "", /Skill: Boundaries, Difficulty: Easy, Medium\./);
  assert.equal(plan.items[0]!.target, 6);
  assert.equal(plan.items[1]!.target, 4);
  assert.equal(plan.skills.length, 10, "only Reading and Writing in the log, so only R&W skills");
  // Unpracticed skills rank above a strong, recent one.
  const transitions = plan.skills.findIndex((s) => s.skill === "Transitions");
  const unpracticed = plan.skills.findIndex((s) => s.attempts === 0);
  assert.ok(unpracticed < transitions);
});

test("plan: focus 2 comes from a different domain than focus 1", () => {
  const log = [
    ...Array.from({ length: 4 }, () => rw("Boundaries", "missed")),
    ...Array.from({ length: 4 }, () => rw("Form, Structure, and Sense", "missed")),
    ...Array.from({ length: 4 }, (_, i) => rw("Inferences", i ? "right" : "missed")),
  ];
  const plan = buildPlan(base({ log, sections: ["rw"] }));
  const [a, b] = plan.items.filter((i) => i.kind === "focus");
  assert.equal(domainOfSkill(a!.skill), "Standard English Conventions");
  assert.notEqual(domainOfSkill(b!.skill), "Standard English Conventions");
});

test("plan: difficulty steps up after strong Medium work and down when under 50%", () => {
  const strong = Array.from({ length: 4 }, () => rw("Transitions", "right", { difficulty: "Medium" }));
  const weak = Array.from({ length: 4 }, (_, i) => rw("Inferences", i ? "missed" : "right", { difficulty: "Medium" }));
  const ranked = rankSkills([...strong, ...weak], ["rw"], new Date(NOW).setHours(0, 0, 0, 0));
  const t = ranked.find((s) => s.skill === "Transitions")!;
  const inf = ranked.find((s) => s.skill === "Inferences")!;
  assert.equal(t.difficulty, "Hard");
  assert.match(t.difficultyReason, /100% of Medium/);
  assert.equal(inf.difficulty, "Easy, Medium");
  assert.equal(ranked.find((s) => s.attempts === 0)!.difficulty, "Medium");
});

test("plan: deterministic, and today's questions tick boxes without reshuffling", () => {
  const history = [
    ...Array.from({ length: 5 }, () => rw("Boundaries", "missed")),
    ...Array.from({ length: 5 }, (_, i) => rw("Transitions", i ? "right" : "missed")),
  ];
  const testDate = ymd(20); // strengthen: focus, focus, mixed
  const a = buildPlan(base({ log: history, testDate }));
  assert.deepEqual(buildPlan(base({ log: history, testDate })), a);
  assert.equal(a.phase, "strengthen");
  assert.deepEqual(a.items.map((i) => [i.id, i.target]), [["focus-1", 5], ["focus-2", 3], ["mixed", 2]]);
  const today = [
    rw("Boundaries", "right", { at: NOW - 3_600_000 }), rw("Boundaries", "right", { at: NOW - 3_000_000 }),
    rw("Inferences", "missed", { at: NOW - 2_000_000 }),
  ];
  const b = buildPlan(base({ log: [...history, ...today], testDate }));
  assert.deepEqual(b.items.map((i) => [i.id, i.skill, i.target]), a.items.map((i) => [i.id, i.skill, i.target]));
  assert.equal(b.items[0]!.done, 2);
  assert.equal(b.items[2]!.done, 1, "Inferences isn't a focus skill, so it counts toward the mixed set");
  assert.equal(b.doneToday, 3);
  assert.equal(b.complete, false);
});

test("plan: reviews count rules due now plus rules already reviewed today", () => {
  const today0 = new Date(NOW).setHours(0, 0, 0, 0);
  const srs: SrsState = {
    A: rule("A", 1, { due: NOW - DAY }),
    B: rule("B", 2, { due: NOW - 1000 }),
    C: rule("C", 3, { due: NOW + 2 * DAY, lastReviewed: today0 + 3_600_000 }),
    D: rule("D", 4, { due: NOW + 5 * DAY, lastReviewed: today0 - DAY }),
  };
  const plan = buildPlan(base({ log: [rw("Boundaries", "missed")], srs }));
  const review = plan.items.find((i) => i.kind === "review")!;
  assert.equal(review.title, "Review 3 due rules");
  assert.equal(review.target, 3);
  assert.equal(review.done, 1);
  assert.equal(plan.items[0]!.kind, "review", "reviews come first");
});

test("plan: final week, day before and test day", () => {
  const log = Array.from({ length: 6 }, (_, i) => rw(i % 2 ? "Boundaries" : "Transitions", i % 3 ? "missed" : "right"));
  const srs: SrsState = { B1: rule("B1", 2) };
  const final = buildPlan(base({ log, srs, testDate: ymd(5) }));
  assert.equal(final.phase, "final");
  assert.deepEqual(final.items.filter((i) => i.target !== null).map((i) => [i.id, i.target]), [["focus-1", 4], ["mixed", 6]]);
  assert.ok(final.items.some((i) => i.kind === "flashcards"));
  assert.match(final.items.find((i) => i.id === "mixed")!.detail, /71 s per question/);

  const eve = buildPlan(base({ log, srs, testDate: ymd(1), dailyGoal: 20 }));
  assert.equal(eve.phase, "eve");
  assert.equal(eve.goal, 5, "the day before is capped at 5 warm-up questions");
  assert.equal(eve.items.find((i) => i.id === "mixed")!.difficulty, "Easy, Medium");
  assert.ok(eve.items.some((i) => i.id === "rest"));

  const test0 = buildPlan(base({ log, srs: { B1: rule("B1", 1, { due: NOW - 1 }) }, testDate: ymd(0) }));
  assert.equal(test0.phase, "test");
  assert.equal(test0.goal, 0);
  assert.ok(!test0.items.some((i) => i.kind === "focus" || i.kind === "mixed" || i.kind === "review"), "no new questions or drills on test day");
  assert.deepEqual(test0.items.map((i) => i.id), ["flashcards", "device", "bag"]);
  assert.equal(test0.complete, false);

  const past = buildPlan(base({ log, testDate: ymd(-3) }));
  assert.equal(past.phase, "past");
  assert.match(past.headline, /passed/);
});

test("plan: completion and the plain-text copy", () => {
  const history = Array.from({ length: 4 }, () => rw("Boundaries", "missed"));
  const todayAll = Array.from({ length: 3 }, (_, i) => rw("Boundaries", "right", { at: NOW - 1000 * (i + 1) }));
  const plan = buildPlan(base({ log: [...history, ...todayAll], dailyGoal: 3, sections: ["rw"] }));
  const f1 = plan.items.find((i) => i.id === "focus-1")!;
  assert.equal(f1.skill, "Boundaries");
  assert.equal(f1.target, 2);
  assert.equal(f1.complete, true);
  const text = planText(plan);
  assert.match(text, /^Rulecard plan for 2026-10-20 \(Daily practice\)/);
  assert.match(text, /\[x\] 2 Boundaries questions \(Easy, Medium\) 2\/2/);
  assert.match(text, /\[ \] 1 .+ question .+ 0\/1/);
  assert.ok(!/\u2014/.test(text), "no em dashes");
});
