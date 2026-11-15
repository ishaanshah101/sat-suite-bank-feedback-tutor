/** The tests Rulecard covers: the Digital SAT and the ACT. */
export const EXAMS = ["sat", "act"] as const;
export type Exam = (typeof EXAMS)[number];
export const EXAM_LABEL: Record<Exam, string> = { sat: "SAT", act: "ACT" };

/** The two sections of the Digital SAT. */
export const SECTIONS = ["rw", "math"] as const;
export type SatSection = (typeof SECTIONS)[number];
/** ACT sections. ACT Math shares "math" with the SAT; English, Reading and Science are ACT only. */
export const ACT_SECTIONS = ["english", "math", "reading", "science"] as const;
export type ActSection = (typeof ACT_SECTIONS)[number];
/** Every section a question can belong to. */
export const ALL_SECTIONS = ["rw", "math", "english", "reading", "science"] as const;
export type Section = (typeof ALL_SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = { rw: "Reading and Writing", math: "Math", english: "English", reading: "Reading", science: "Science" };
export const SECTION_TEST_NAME: Record<Section, string> = { rw: "SAT Reading and Writing", math: "SAT Math", english: "ACT English", reading: "ACT Reading", science: "ACT Science" };
/** The sections of one test. */
export function sectionsForExam(exam: Exam): readonly Section[] {
  return exam === "act" ? ACT_SECTIONS : SECTIONS;
}
/** Which test a section belongs to when it can only be one ("math" is both, so the SAT by default). */
export function examOfSection(section: Section): Exam {
  return section === "english" || section === "reading" || section === "science" ? "act" : "sat";
}

export const RW_DOMAINS = ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"] as const;
/** Official Math domains, as the Question Bank labels them. */
export const MATH_DOMAINS = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"] as const;
export const DOMAINS = [...RW_DOMAINS, ...MATH_DOMAINS] as const;
export type RwDomain = (typeof RW_DOMAINS)[number];
export type MathDomain = (typeof MATH_DOMAINS)[number];
export type Domain = (typeof DOMAINS)[number];

export const RW_SKILLS = [
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

/** Official Math skills, as the Question Bank labels them (checked against the Question Bank in October 2026). */
export const MATH_SKILLS = [
  "Linear equations in one variable",
  "Linear functions",
  "Linear equations in two variables",
  "Systems of two linear equations in two variables",
  "Linear inequalities in one or two variables",
  "Equivalent expressions",
  "Nonlinear equations in one variable and systems of equations in two variables",
  "Nonlinear functions",
  "Ratios, rates, proportional relationships, and units",
  "Percentages",
  "One-variable data: Distributions and measures of center and spread",
  "Two-variable data: Models and scatterplots",
  "Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims: Observational studies and experiments",
  "Area and volume",
  "Lines, angles, and triangles",
  "Right triangles and trigonometry",
  "Circles",
] as const;
export const SAT_SKILLS = [...RW_SKILLS, ...MATH_SKILLS] as const;
export type RwSkill = (typeof RW_SKILLS)[number];
export type MathSkill = (typeof MATH_SKILLS)[number];
export type SatSkill = (typeof SAT_SKILLS)[number];

/**
 * ACT skills, by section. Named after ACT's reporting categories (the enhanced ACT, 2025 on), worded so no
 * name collides with an SAT skill. ACT questions are not labeled on screen, so the model picks one.
 */
export const ACT_ENGLISH_SKILLS = ["Punctuation", "Sentence Structure and Formation", "Usage", "Knowledge of Language", "Topic Development", "Organization, Unity, and Cohesion"] as const;
export const ACT_MATH_SKILLS = ["Number and Quantity", "Algebra and Expressions", "Functions", "Geometry", "Statistics and Probability", "Integrating Essential Skills"] as const;
export const ACT_READING_SKILLS = ["Key Ideas and Details", "Author's Craft and Structure", "Integration of Knowledge and Ideas"] as const;
export const ACT_SCIENCE_SKILLS = ["Interpretation of Data", "Scientific Investigation", "Evaluation of Models, Inferences, and Experimental Results"] as const;
export const ACT_SKILLS = [...ACT_ENGLISH_SKILLS, ...ACT_MATH_SKILLS, ...ACT_READING_SKILLS, ...ACT_SCIENCE_SKILLS] as const;
export type ActSkill = (typeof ACT_SKILLS)[number];
export const ACT_DOMAINS = ["ACT English", "ACT Math", "ACT Reading", "ACT Science"] as const;
export type ActDomain = (typeof ACT_DOMAINS)[number];
export const ACT_SECTION_DOMAIN: Record<ActSection, ActDomain> = { english: "ACT English", math: "ACT Math", reading: "ACT Reading", science: "ACT Science" };

export const SKILLS = [...SAT_SKILLS, ...ACT_SKILLS] as const;
export type Skill = (typeof SKILLS)[number];

const ACT_SKILL_SECTION: Record<ActSkill, ActSection> = Object.fromEntries([
  ...ACT_ENGLISH_SKILLS.map((s) => [s, "english"]),
  ...ACT_MATH_SKILLS.map((s) => [s, "math"]),
  ...ACT_READING_SKILLS.map((s) => [s, "reading"]),
  ...ACT_SCIENCE_SKILLS.map((s) => [s, "science"]),
]) as Record<ActSkill, ActSection>;
const ACT_SKILL_SET = new Set<string>(ACT_SKILLS);
export function isActSkill(skill: string | null | undefined): skill is ActSkill {
  return Boolean(skill && ACT_SKILL_SET.has(skill));
}
export function actSectionOfSkill(skill: ActSkill): ActSection {
  return ACT_SKILL_SECTION[skill];
}
export function actSkillsForSection(section: ActSection): readonly ActSkill[] {
  return section === "english" ? ACT_ENGLISH_SKILLS : section === "math" ? ACT_MATH_SKILLS : section === "reading" ? ACT_READING_SKILLS : ACT_SCIENCE_SKILLS;
}

export const SKILL_DOMAIN: Record<SatSkill, Domain> = {
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
  "Linear equations in one variable": "Algebra",
  "Linear functions": "Algebra",
  "Linear equations in two variables": "Algebra",
  "Systems of two linear equations in two variables": "Algebra",
  "Linear inequalities in one or two variables": "Algebra",
  "Equivalent expressions": "Advanced Math",
  "Nonlinear equations in one variable and systems of equations in two variables": "Advanced Math",
  "Nonlinear functions": "Advanced Math",
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

/** Three-letter rule-id prefix per skill. */
export const SKILL_CODES: Record<SatSkill, string> = {
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
  "Linear equations in one variable": "LE1",
  "Linear functions": "LFN",
  "Linear equations in two variables": "LE2",
  "Systems of two linear equations in two variables": "SYS",
  "Linear inequalities in one or two variables": "INQ",
  "Equivalent expressions": "EQX",
  "Nonlinear equations in one variable and systems of equations in two variables": "NLE",
  "Nonlinear functions": "NLF",
  "Ratios, rates, proportional relationships, and units": "RAT",
  Percentages: "PCT",
  "One-variable data: Distributions and measures of center and spread": "ONE",
  "Two-variable data: Models and scatterplots": "TWO",
  "Probability and conditional probability": "PRB",
  "Inference from sample statistics and margin of error": "SMP",
  "Evaluating statistical claims: Observational studies and experiments": "EVS",
  "Area and volume": "ARV",
  "Lines, angles, and triangles": "LAT",
  "Right triangles and trigonometry": "TRG",
  Circles: "CIR",
};

const MATH_DOMAIN_SET = new Set<string>(MATH_DOMAINS);
const MATH_SKILL_SET = new Set<string>(MATH_SKILLS);

export function sectionOfSkill(skill: Skill): Section {
  if (isActSkill(skill)) return actSectionOfSkill(skill);
  return MATH_SKILL_SET.has(skill) ? "math" : "rw";
}

export function sectionOfDomain(domain: Domain): Section {
  return MATH_DOMAIN_SET.has(domain) ? "math" : "rw";
}

/** SAT skills for an SAT section (ACT sections: actSkillsForSection). */
export function skillsForSection(section: SatSection): readonly Skill[] {
  return section === "math" ? MATH_SKILLS : RW_SKILLS;
}

export function domainsForSection(section: SatSection): readonly Domain[] {
  return section === "math" ? MATH_DOMAINS : RW_DOMAINS;
}

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
  // Longest first, so "Linear equations in two variables" wins over "Linear functions"-style prefixes.
  const contains = [...candidates].sort((a, b) => b.length - a.length).find((c) => key.includes(squash(c)));
  return contains ?? null;
}

export function normalizeDomain(value: string | null | undefined): Domain | null {
  return matchOne(DOMAINS, value);
}

/** An SAT skill label by default; pass "act" to match ACT skills instead. */
export function normalizeSkill(value: string | null | undefined, exam: Exam = "sat"): Skill | null {
  return exam === "act" ? matchOne(ACT_SKILLS, value) : matchOne(SAT_SKILLS, value);
}

export function normalizeDifficulty(value: string | null | undefined): Difficulty | null {
  return matchOne(DIFFICULTIES, value);
}

export function domainForSkill(skill: Skill | null): Domain | null {
  if (!skill || isActSkill(skill)) return null;
  return SKILL_DOMAIN[skill];
}

/** The domain label to store for an ACT question (ACT has no Question Bank domains). */
export function actDomainForSection(section: ActSection): ActDomain {
  return ACT_SECTION_DOMAIN[section];
}

/**
 * Best guess of the section. The official skill or domain label wins (it comes from the Question Bank),
 * then the test name, then a model's own guess; Reading and Writing when nothing says otherwise.
 */
export function inferSection(input: { section?: string | null; test?: string | null; skill?: string | null; domain?: string | null }): Section {
  const skill = normalizeSkill(input.skill);
  if (skill) return sectionOfSkill(skill);
  const domain = normalizeDomain(input.domain);
  if (domain) return sectionOfDomain(domain);
  if (input.test && /math/i.test(input.test)) return "math";
  if (input.test && /reading|writing/i.test(input.test)) return "rw";
  if (input.section === "math" || input.section === "rw") return input.section;
  return "rw";
}
