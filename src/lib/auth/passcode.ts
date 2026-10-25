import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

/** Constant-time comparison of equal-length HMAC digests of the two passcodes. */
export function passcodeMatches(submitted: string, expected: string): boolean {
  const key = requireEnv("SESSION_SECRET");
  const a = createHmac("sha256", key).update(submitted.normalize("NFKC").trim()).digest();
  const b = createHmac("sha256", key).update(expected.normalize("NFKC").trim()).digest();
  return timingSafeEqual(a, b);
}

export function secretMatches(submitted: string, expected: string): boolean {
  const a = createHmac("sha256", "rulecard").update(submitted).digest();
  const b = createHmac("sha256", "rulecard").update(expected).digest();
  return timingSafeEqual(a, b);
}
