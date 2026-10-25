export const DOMAINS = [
  "Information and Ideas",
  "Craft and Structure",
  "Expression of Ideas",
  "Standard English Conventions",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const SKILLS = [
  "Central Ideas and Details",
  "Inferences",
  "Command of Evidence",
  "Words in Context",
  "Text Structure and Purpose",
  "Cross-Text Connections",
  "Rhetorical Synthesis",
  "Transitions",
  "Boundaries",
  "Form, Structure, and Sense",
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_DOMAIN: Record<Skill, Domain> = {
  "Central Ideas and Details": "Information and Ideas",
  Inferences: "Information and Ideas",
  "Command of Evidence": "Information and Ideas",
  "Words in Context": "Craft and Structure",
  "Text Structure and Purpose": "Craft and Structure",
  "Cross-Text Connections": "Craft and Structure",
  "Rhetorical Synthesis": "Expression of Ideas",
  Transitions: "Expression of Ideas",
  Boundaries: "Standard English Conventions",
  "Form, Structure, and Sense": "Standard English Conventions",
};

export const SKILL_CODES: Record<Skill, string> = {
  "Central Ideas and Details": "CID",
  Inferences: "INF",
  "Command of Evidence": "COE",
  "Words in Context": "WIC",
  "Text Structure and Purpose": "TSP",
  "Cross-Text Connections": "CTC",
  "Rhetorical Synthesis": "RHS",
  Transitions: "TRN",
  Boundaries: "BND",
  "Form, Structure, and Sense": "FSS",
};

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Whitespace-insensitive, case-insensitive key (the PDF text layer has stray intra-word spaces). */
export function squash(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function matchOne<T extends string>(candidates: readonly T[], value: string | null | undefined): T | null {
  if (!value) return null;
  const key = squash(value);
  if (!key) return null;
  const exact = candidates.find((c) => squash(c) === key);
  if (exact) return exact;
  const contains = candidates.find((c) => key.includes(squash(c)));
  return contains ?? null;
}

export function normalizeDomain(value: string | null | undefined): Domain | null {
  return matchOne(DOMAINS, value);
}

export function normalizeSkill(value: string | null | undefined): Skill | null {
  return matchOne(SKILLS, value);
}

export function normalizeDifficulty(value: string | null | undefined): Difficulty | null {
  return matchOne(DIFFICULTIES, value);
}

export function domainForSkill(skill: Skill | null): Domain | null {
  return skill ? SKILL_DOMAIN[skill] : null;
}
