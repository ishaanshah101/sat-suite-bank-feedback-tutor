// Official Digital SAT taxonomy: every skill with its domain and section (10 Reading and Writing, 19 Math),
// plus tolerant matching, so "form structure and sense", "Algebra: Linear functions" and
// "ratios, rates & units" all resolve to the official names. Pure, no DOM.
// Hook-in: none. plan.ts and traps.ts import it; use normalizeSkill() wherever skills are compared.
import { RW_SKILLS } from "./qbtext";
import { MATH_SKILLS, type Section } from "./types";

export interface SkillInfo { skill: string; domain: string; section: Section }

const RW_DOMAIN_OF: Record<(typeof RW_SKILLS)[number], string> = {
  "Central Ideas and Details": "Information and Ideas",
  "Command of Evidence": "Information and Ideas",
  Inferences: "Information and Ideas",
  "Words in Context": "Craft and Structure",
  "Text Structure and Purpose": "Craft and Structure",
  "Cross-Text Connections": "Craft and Structure",
  "Rhetorical Synthesis": "Expression of Ideas",
  Transitions: "Expression of Ideas",
  Boundaries: "Standard English Conventions",
  "Form, Structure, and Sense": "Standard English Conventions",
};

const MATH_DOMAIN_OF: Record<string, string> = {
  "Linear equations in one variable": "Algebra",
  "Linear functions": "Algebra",
  "Linear equations in two variables": "Algebra",
  "Systems of two linear equations in two variables": "Algebra",
  "Linear inequalities in one or two variables": "Algebra",
  "Nonlinear functions": "Advanced Math",
  "Nonlinear equations in one variable and systems of equations in two variables": "Advanced Math",
  "Equivalent expressions": "Advanced Math",
  "Ratios, rates, proportional relationships, and units": "Problem-Solving and Data Analysis",
  Percentages: "Problem-Solving and Data Analysis",
  "One-variable data: Distributions and measures of center and spread": "Problem-Solving and Data Analysis",
  "Two-variable data: Models and scatterplots": "Problem-Solving and Data Analysis",
  "Probability and conditional probability": "Problem-Solving and Data Analysis",
  "Inference from sample statistics and margin of error": "Problem-Solving and Data Analysis",
  "Evaluating statistical claims: Observational studies and experiments": "Problem-Solving and Data Analysis",
  "Area and volume": "Geometry and Trigonometry",
  "Lines, angles, and triangles": "Geometry and Trigonometry",
  "Right triangles and trigonometry": "Geometry and Trigonometry",
  Circles: "Geometry and Trigonometry",
};

export const SKILLS: SkillInfo[] = [
  ...Object.entries(RW_DOMAIN_OF).map(([skill, domain]) => ({ skill, domain, section: "rw" as const })),
  // Keep upstream's MATH_SKILLS order; fall back to the map if a name ever drifts.
  ...(MATH_SKILLS as readonly string[]).filter((s) => s in MATH_DOMAIN_OF).map((skill) => ({ skill, domain: MATH_DOMAIN_OF[skill]!, section: "math" as const })),
];

const fold = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();

const BY_FOLD = new Map(SKILLS.map((s) => [fold(s.skill), s]));
const DOMAIN_FOLDS = new Set(SKILLS.map((s) => fold(s.domain)));

const ALIASES: Record<string, string> = {
  "central ideas": "Central Ideas and Details",
  "main idea": "Central Ideas and Details",
  evidence: "Command of Evidence",
  inference: "Inferences",
  "words in context": "Words in Context",
  vocab: "Words in Context",
  vocabulary: "Words in Context",
  "text structure": "Text Structure and Purpose",
  purpose: "Text Structure and Purpose",
  "cross text": "Cross-Text Connections",
  synthesis: "Rhetorical Synthesis",
  "rhetorical synthesis": "Rhetorical Synthesis",
  punctuation: "Boundaries",
  grammar: "Form, Structure, and Sense",
  fss: "Form, Structure, and Sense",
  "systems of equations": "Systems of two linear equations in two variables",
  systems: "Systems of two linear equations in two variables",
  ratios: "Ratios, rates, proportional relationships, and units",
  percent: "Percentages",
  percents: "Percentages",
  probability: "Probability and conditional probability",
  trig: "Right triangles and trigonometry",
  trigonometry: "Right triangles and trigonometry",
  scatterplots: "Two-variable data: Models and scatterplots",
  "margin of error": "Inference from sample statistics and margin of error",
  quadratics: "Nonlinear equations in one variable and systems of equations in two variables",
};

/** Resolve any reasonable spelling of a skill to its official entry, or null if unknown or ambiguous. */
export function skillInfo(text: string | null | undefined): SkillInfo | null {
  if (!text) return null;
  const f = fold(text);
  if (!f) return null;
  const direct = BY_FOLD.get(f);
  if (direct) return direct;
  const colon = text.indexOf(":");
  if (colon > 0 && DOMAIN_FOLDS.has(fold(text.slice(0, colon)))) {
    const hit = skillInfo(text.slice(colon + 1));
    if (hit) return hit;
  }
  const alias = ALIASES[f];
  if (alias) return BY_FOLD.get(fold(alias)) ?? null;
  const hits = SKILLS.filter((s) => {
    const k = fold(s.skill);
    return k.startsWith(f) || (f.length >= 6 && k.includes(f));
  });
  if (hits.length) return hits.length === 1 ? hits[0]! : null;
  // Every word appears in exactly one skill name: "ratios, rates & units", "systems linear equations".
  const words = f.split(" ");
  if (words.length < 2) return null;
  const byWords = SKILLS.filter((s) => {
    const k = new Set(fold(s.skill).split(" "));
    return words.every((w) => k.has(w));
  });
  return byWords.length === 1 ? byWords[0]! : null;
}

export const normalizeSkill = (text: string | null | undefined): string | null => skillInfo(text)?.skill ?? null;
export const sectionOfSkill = (text: string | null | undefined): Section | null => skillInfo(text)?.section ?? null;
export const domainOfSkill = (text: string | null | undefined): string | null => skillInfo(text)?.domain ?? null;
export const skillsFor = (section: Section): SkillInfo[] => SKILLS.filter((s) => s.section === section);

/** Plain-words Question Bank filter instructions for one skill. */
export function qbFilterSteps(info: SkillInfo, difficulty?: string | null): string {
  const test = info.section === "math" ? "Math" : "Reading and Writing";
  return `In the Question Bank pick Assessment: SAT, Test: ${test}, Domain: ${info.domain}, Skill: ${info.skill}${difficulty ? `, Difficulty: ${difficulty}` : ""}.`;
}
