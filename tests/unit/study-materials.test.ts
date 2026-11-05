// The study-material additions: tips attach to real rules, new rules are well formed, and every official
// skill has a playbook entry that reaches the explain prompt.
import { describe, expect, it } from "vitest";
import { getRule, RULES, RULE_BY_ID, formatRulesForPrompt } from "@/content/rules";
import { RULE_TIPS } from "@/content/rule-tips";
import { EXTRA_MATH_RULES, EXTRA_RW_RULES } from "@/content/rules-extra";
import { GENERAL_PLAYBOOK, SKILL_PLAYBOOK, playbookForPrompt } from "@/content/playbook";
import { SKILLS, SKILL_DOMAIN } from "@/lib/questions/taxonomy";
import { explainInstructions } from "@/lib/ai/prompts";
import type { QuestionRow } from "@/db/schema";

describe("study-material additions", () => {
  it("every tip belongs to an existing rule and reaches the prompt text", () => {
    for (const [id, tips] of Object.entries(RULE_TIPS)) {
      const rule = getRule(id);
      expect(rule, id).not.toBeNull();
      expect(tips.length).toBeGreaterThan(0);
      for (const t of tips) expect(rule!.tips).toContain(t);
    }
    expect(formatRulesForPrompt([getRule("BND-01")!])).toContain("Tips: ");
  });

  it("new rules are complete, unique, and filed under a real skill and domain", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RULE_BY_ID.size).toBe(RULES.length);
    for (const r of [...EXTRA_RW_RULES, ...EXTRA_MATH_RULES]) {
      for (const field of [r.name, r.statement, r.spot_it, r.test, r.trap, r.example.wrong, r.example.right]) expect(field.trim().length, r.id).toBeGreaterThan(5);
      if (r.skill !== "General") {
        expect(SKILLS).toContain(r.skill);
        expect(SKILL_DOMAIN[r.skill]).toBe(r.domain);
      }
    }
    expect(getRule("BND-12")?.example.wrong).toMatch(/; despite,/);
  });

  it("every official skill has a playbook entry, and the explain prompt carries it", () => {
    for (const skill of SKILLS) {
      const e = SKILL_PLAYBOOK[skill];
      expect(e, skill).toBeTruthy();
      expect(e!.route.length).toBeGreaterThan(0);
      expect(e!.traps.length).toBeGreaterThan(0);
    }
    expect(GENERAL_PLAYBOOK.math.lists?.join(" ")).toMatch(/6 if negative/);
    expect(playbookForPrompt("rw", "Boundaries")).toMatch(/Common mix-up to correct: "Despite"/);
    const q = { section: "rw", format: "mcq", skill: "Transitions", rationale: null, correct: "B", answers: null, answerSource: "official" } as unknown as QuestionRow;
    const prompt = explainInstructions([getRule("TRN-01")!], false, q);
    expect(prompt).toContain("Playbook for Transitions");
    expect(prompt).toContain("Playbook for all Reading and Writing questions");
    expect(prompt).toMatch(/Concession: nonetheless/);
  });
});
