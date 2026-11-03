import { beforeAll, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ bearer: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(request.bearer ? { authorization: `Bearer ${request.bearer}` } : {}),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

const OWNER = "68311219-1a38-469e-ab48-b3bf632be848";

beforeAll(() => {
  process.env.DATABASE_URL = "pglite://memory";
  process.env.SESSION_SECRET = "unit-test-secret-0123456789abcdef";
  process.env.APP_PASSCODE = "old-passcode";
  process.env.DAILY_AI_LIMIT = "2";
});

describe("accounts", () => {
  it("signs up, signs in, rejects bad passwords and duplicate emails", async () => {
    const { signIn, signUp } = await import("@/lib/auth/accounts");
    const { verifySessionToken } = await import("@/lib/auth/token");
    const created = await signUp("10.0.0.1", { email: "  Student@Example.com ", password: "longenough1" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.user.email).toBe("student@example.com");
    expect(created.user.id).not.toBe(OWNER);
    expect(await verifySessionToken(created.token)).toMatchObject({ userId: created.user.id });

    const dup = await signUp("10.0.0.1", { email: "student@example.com", password: "another-pass" });
    expect(dup).toMatchObject({ ok: false, status: 409, code: "email_taken" });
    expect(await signUp("10.0.0.1", { email: "x@example.com", password: "short" })).toMatchObject({ ok: false, code: "weak_password" });
    expect(await signUp("10.0.0.1", { email: "not-an-email", password: "longenough1" })).toMatchObject({ ok: false, code: "invalid_email" });

    expect(await signIn("10.0.0.2", { email: "STUDENT@example.com", password: "longenough1" })).toMatchObject({ ok: true });
    expect(await signIn("10.0.0.2", { email: "student@example.com", password: "wrong-pass" })).toMatchObject({ ok: false, status: 401 });
    expect(await signIn("10.0.0.2", { email: "nobody@example.com", password: "whatever1" })).toMatchObject({ ok: false, status: 401 });
  });

  it("lets one account claim the original history with the old passcode", async () => {
    const { signUp } = await import("@/lib/auth/accounts");
    expect(await signUp("10.0.1.1", { email: "a@example.com", password: "longenough1", passcode: "wrong" })).toMatchObject({ ok: false, code: "bad_passcode" });
    const owner = await signUp("10.0.1.1", { email: "owner@example.com", password: "longenough1", passcode: "old-passcode" });
    expect(owner).toMatchObject({ ok: true, user: { id: OWNER } });
    expect(await signUp("10.0.1.2", { email: "b@example.com", password: "longenough1", passcode: "old-passcode" })).toMatchObject({ ok: false, code: "owner_claimed" });
  });

  it("rate limits sign-in tries per address", async () => {
    const { signIn, SIGNIN_MAX_ATTEMPTS } = await import("@/lib/auth/accounts");
    for (let i = 0; i < SIGNIN_MAX_ATTEMPTS; i++) {
      expect(await signIn("10.0.2.1", { email: "student@example.com", password: "nope-nope" })).toMatchObject({ status: 401 });
    }
    expect(await signIn("10.0.2.1", { email: "student@example.com", password: "longenough1" })).toMatchObject({ ok: false, status: 429 });
  });

  it("keeps counting guesses at other accounts after a right password", async () => {
    const { signIn, signUp, SIGNIN_MAX_ATTEMPTS } = await import("@/lib/auth/accounts");
    expect(await signUp("10.0.5.9", { email: "attacker@example.com", password: "longenough1" })).toMatchObject({ ok: true });
    for (let i = 0; i < SIGNIN_MAX_ATTEMPTS - 1; i++) {
      expect(await signIn("10.0.5.1", { email: "student@example.com", password: "nope-nope" })).toMatchObject({ status: 401 });
    }
    expect(await signIn("10.0.5.1", { email: "attacker@example.com", password: "longenough1" })).toMatchObject({ ok: true });
    expect(await signIn("10.0.5.1", { email: "student@example.com", password: "nope-nope" })).toMatchObject({ ok: false, status: 429 });
  });

  it("limits guesses at one account across addresses", async () => {
    const { signIn, signUp, SIGNIN_MAX_PER_ACCOUNT } = await import("@/lib/auth/accounts");
    expect(await signUp("10.0.6.9", { email: "target@example.com", password: "longenough1" })).toMatchObject({ ok: true });
    for (let i = 0; i < SIGNIN_MAX_PER_ACCOUNT; i++) {
      expect(await signIn(`10.0.6.${i}`, { email: "target@example.com", password: "nope-nope" })).toMatchObject({ status: 401 });
    }
    expect(await signIn("10.0.7.1", { email: "target@example.com", password: "longenough1" })).toMatchObject({ ok: false, status: 429 });
  });

  it("rejects a session token issued before the account existed", async () => {
    const { signUp } = await import("@/lib/auth/accounts");
    const { requireSession, UnauthorizedError } = await import("@/lib/auth/session");
    const { SignJWT } = await import("jose");
    const made = await signUp("10.0.8.1", { email: "stale@example.com", password: "longenough1" });
    if (!made.ok) throw new Error("signup failed");
    request.bearer = made.token;
    expect(await requireSession()).toMatchObject({ userId: made.user.id });
    const key = new TextEncoder().encode(process.env.SESSION_SECRET);
    request.bearer = await new SignJWT({ kind: "account" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(made.user.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime("1h")
      .sign(key);
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
    request.bearer = null;
  });

  it("enforces the daily AI limit except for the owner, and deletes an account with its data", async () => {
    const { signUp } = await import("@/lib/auth/accounts");
    const { chargeAiQuota, QuotaError } = await import("@/lib/ai/quota");
    const q = await import("@/db/queries");
    const made = await signUp("10.0.3.1", { email: "quota@example.com", password: "longenough1" });
    if (!made.ok) throw new Error("signup failed");
    const id = made.user.id;
    await chargeAiQuota(id, "extract");
    await chargeAiQuota(id, "explain");
    await expect(chargeAiQuota(id, "chat")).rejects.toBeInstanceOf(QuotaError);
    for (let i = 0; i < 4; i++) await chargeAiQuota(OWNER, "chat");

    const question = await q.upsertQuestion(id, { qb_id: null, test: null, domain: null, skill: null, difficulty: null, passage: null, stem: "s", choices: { A: "a", B: "b", C: "c", D: "d" }, correct: "A", rationale: null }, "paste");
    await q.createAttempt(id, { questionId: question.id, picked: "B", reasoning: null });
    await q.deleteUserAndData(id);
    expect(await q.getUser(id)).toBeNull();
    expect(await q.listAttempts(id)).toHaveLength(0);
    expect(await q.getQuestion(id, question.id)).toBeNull();
    expect(await q.countAiUse(id, new Date(0))).toBe(0);
  });
});
