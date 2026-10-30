/**
 * Student-produced response (grid-in) answers for SAT Math, following College Board's entry rules:
 * a positive answer fits in 5 characters and a negative one in 6 (the sign counts); fractions and
 * decimals are fine; a decimal that does not fit must fill every space, truncated or rounded
 * (2/3 as .6666, .6667, 0.666 or 0.667, never .66 or .67); no mixed numbers (3 1/2 is 7/2 or 3.5);
 * no symbols such as %, $ or commas.
 */

export interface Rational {
  num: bigint;
  den: bigint;
}

export type SprEntry = { ok: true; text: string; value: Rational; kind: "integer" | "decimal" | "fraction" } | { ok: false; error: string };

const MAX_POSITIVE = 5;
const MAX_NEGATIVE = 6;

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function rational(num: bigint, den: bigint): Rational {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}

/** Parse a number written as an integer, a decimal or a fraction, with no length limit. */
export function parseNumber(raw: string): { value: Rational; kind: "integer" | "decimal" | "fraction" } | null {
  const text = raw.trim().replace(/−/g, "-");
  let m = /^(-?)(\d+)$/.exec(text);
  if (m) return { value: rational(BigInt(m[1] + m[2]), 1n), kind: "integer" };
  m = /^(-?)(\d*)\.(\d+)$/.exec(text);
  if (m) {
    const digits = m[3];
    const whole = m[2] || "0";
    return { value: rational(BigInt(`${m[1]}${whole}${digits}`), 10n ** BigInt(digits.length)), kind: "decimal" };
  }
  m = /^(-?)(\d+)\s*\/\s*(-?\d+)$/.exec(text);
  if (m) {
    const den = BigInt(m[3]);
    if (den === 0n) return null;
    return { value: rational(BigInt(m[1] + m[2]), den), kind: "fraction" };
  }
  return null;
}

/** Validate what a student would type into the grid-in box. */
export function parseSprEntry(raw: string): SprEntry {
  const text = raw.trim().replace(/−/g, "-").replace(/\s*\/\s*/g, "/");
  if (!text) return { ok: false, error: "Type your answer." };
  if (/\d\s+\d+\/\d/.test(text)) return { ok: false, error: "Mixed numbers are not allowed: enter 3 1/2 as 7/2 or 3.5." };
  if (/[%$,]/.test(text)) return { ok: false, error: "Leave out symbols such as %, $ and commas." };
  const parsed = parseNumber(text);
  if (!parsed) return { ok: false, error: "Enter a number, a decimal or a fraction such as 7/2." };
  const limit = text.startsWith("-") ? MAX_NEGATIVE : MAX_POSITIVE;
  if (text.length > limit) {
    return {
      ok: false,
      error: text.startsWith("-") ? "A negative answer fits in 6 characters, including the minus sign." : "An answer fits in 5 characters. Round or shorten the decimal, or use a fraction.",
    };
  }
  return { ok: true, text, value: parsed.value, kind: parsed.kind };
}

function equal(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den;
}

/** floor(x * 10^k) and round-half-up(x * 10^k) for a rational x, keeping the sign symmetric. */
function scaled(x: Rational, k: number): { truncated: bigint; rounded: bigint } {
  const negative = x.num < 0n;
  const n = (negative ? -x.num : x.num) * 10n ** BigInt(k);
  const truncated = n / x.den;
  const rounded = (n * 2n + x.den) / (2n * x.den);
  return negative ? { truncated: -truncated, rounded: -rounded } : { truncated, rounded };
}

/**
 * Is the student's entry correct, given the accepted answers (as the Question Bank lists them, for
 * example [".1764", ".1765", "3/17"])? An exact match of value counts, and so does a decimal that
 * fills the whole box and equals the true value truncated or rounded at its last digit.
 */
export function isSprCorrect(entry: string, accepted: readonly string[]): boolean {
  const student = parseSprEntry(entry);
  if (!student.ok) return false;
  const targets = accepted.map(parseNumber).filter((t): t is NonNullable<typeof t> => t !== null);
  if (targets.some((t) => equal(t.value, student.value))) return true;
  if (student.kind !== "decimal") return false;
  const limit = student.text.startsWith("-") ? MAX_NEGATIVE : MAX_POSITIVE;
  if (student.text.length < limit) return false;
  const places = student.text.split(".")[1]?.length ?? 0;
  const studentScaled = (student.value.num * 10n ** BigInt(places)) / student.value.den;
  // Prefer an exact target (a fraction or integer) over listed decimals, which are approximations already.
  const exact = targets.filter((t) => t.kind !== "decimal");
  for (const t of exact.length ? exact : targets) {
    const { truncated, rounded } = scaled(t.value, places);
    if (studentScaled === truncated || studentScaled === rounded) return true;
  }
  return false;
}

/** Split an official answer line such as "Correct Answer: .1764, .1765, 3/17" into the accepted forms. */
export function splitAcceptedAnswers(text: string): string[] {
  return text
    .replace(/^\s*(correct answers?|answers?)\s*:?\s*/i, "")
    .split(/\s*(?:,|;|\bor\b)\s*/i)
    .map((s) => s.trim().replace(/−/g, "-"))
    .filter((s) => s.length > 0 && parseNumber(s) !== null);
}

/** A readable value for display: the first accepted form, preferring a fraction or integer. */
export function displayAnswer(accepted: readonly string[]): string | null {
  if (!accepted.length) return null;
  return accepted.find((a) => parseNumber(a)?.kind !== "decimal") ?? accepted[0];
}
