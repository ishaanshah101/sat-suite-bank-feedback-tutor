import { describe, expect, it } from "vitest";
import { GENERAL_RULES, RULES, RULE_BY_ID, formatRulesForPrompt, generalRules, getRule, rulesForSkill } from "@/content/rules";
import { MATH_SKILLS, SKILLS, SKILL_DOMAIN, sectionOfSkill } from "@/lib/questions/taxonomy";

describe("rule library", () => {
  it("has unique, well-formed ids", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Z][A-Z0-9]{2}-\d{2}$/);
  });

  it("fills every field and keeps statements to one sentence without em dashes", () => {
    for (const r of RULES) {
      expect(r.name.split(/\s+/).length).toBeGreaterThanOrEqual(2);
      expect(r.name.split(/\s+/).length).toBeLessThanOrEqual(6);
      for (const field of [r.statement, r.spot_it, r.test, r.trap, r.example.wrong, r.example.right]) {
        expect(field.trim().length).toBeGreaterThan(10);
        expect(field).not.toContain("—");
        expect(field).not.toContain("\n");
      }
    }
  });

  it("maps every skill to its official domain", () => {
    for (const r of RULES) {
      if (r.skill === "General") {
        expect(r.domain).toBe("General");
        continue;
      }
      expect(SKILL_DOMAIN[r.skill]).toBe(r.domain);
    }
  });

  it("covers every official skill, with at least two rules per Math skill", () => {
    for (const skill of SKILLS) expect(rulesForSkill(skill).length).toBeGreaterThan(0);
    for (const skill of MATH_SKILLS) expect(rulesForSkill(skill).length).toBeGreaterThanOrEqual(2);
  });

  it("tags every rule with the section of its skill, and Math rules use balanced \\( \\) math", () => {
    for (const r of RULES) {
      if (r.skill !== "General") expect(r.section).toBe(sectionOfSkill(r.skill));
      if (r.section !== "math") continue;
      for (const field of [r.statement, r.spot_it, r.test, r.trap, r.example.wrong, r.example.right, r.shortcut ?? ""]) {
        expect(field.split("\\(").length).toBe(field.split("\\)").length);
      }
    }
  });

  it("looks up rules case-insensitively and exposes general rules", () => {
    expect(getRule("bnd-01")?.id).toBe("BND-01");
    expect(getRule("NOPE-99")).toBeNull();
    expect(GENERAL_RULES.map((r) => r.id)).toEqual(["GEN-01", "GEN-02", "GEN-03"]);
    expect(generalRules("math").map((r) => r.id)).toEqual(["MTH-01", "MTH-02", "MTH-03", "MTH-04"]);
    expect(RULE_BY_ID.size).toBe(RULES.length);
  });

  it("formats rules for prompts with their ids", () => {
    const text = formatRulesForPrompt(rulesForSkill("Transitions"));
    expect(text).toContain("TRN-01");
    expect(text).toContain("Trap:");
  });
});
