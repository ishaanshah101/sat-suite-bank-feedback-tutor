// Test fixtures. Every question here is made up for the tests (no College Board text).
import type { LogEntry } from "../../../extension/src/addons/log";

let n = 0;
export function entry(p: Partial<LogEntry> = {}): LogEntry {
  n++;
  return {
    attemptId: `att-${n}`,
    at: Date.now(),
    ruleId: "B1",
    ruleName: "Comma splice",
    ruleStatement: "Two independent clauses can't be joined by a comma alone.",
    takeaway: "Period, semicolon, or comma + FANBOYS.",
    whyCorrect: "A semicolon joins two complete thoughts.",
    whyPickFails: "A comma alone splices the clauses.",
    diagnosis: "rule_gap",
    confidence: 0.9,
    picked: "A",
    correct: "C",
    result: "missed",
    qbId: "b1a2c3d4",
    domain: "Standard English Conventions",
    skill: "Boundaries",
    difficulty: "Medium",
    stem: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    passage: "Volunteers at the Riverside tool library repair every donated item before lending it out. Last spring they restored more than two hundred ______ mowers and hedge trimmers were the most requested.",
    choices: { A: "tools, lawn", B: "tools lawn", C: "tools; lawn", D: "tools: and lawn" },
    solvedByModel: false,
    seconds: 60,
    note: "",
    starred: false,
    drills: [],
    ...p,
  };
}

export const at = (y: number, m: number, d: number, hh = 12) => new Date(y, m - 1, d, hh).getTime();
