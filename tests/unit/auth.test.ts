import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-secret-0123456789abcdef";
  process.env.APP_PASSCODE = "unit-passcode-1";
});

describe("session tokens", () => {
  it("round-trips a signed session and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth/token");
    const token = await createSessionToken("user-1");
    expect(await verifySessionToken(token)).toMatchObject({ userId: "user-1", issuedAt: expect.any(Number) });
    expect(await verifySessionToken(token.slice(0, -2) + "zz")).toBeNull();
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("rejects tokens from the old passcode gate (no account kind)", async () => {
    const { SignJWT } = await import("jose");
    const { verifySessionToken } = await import("@/lib/auth/token");
    const key = new TextEncoder().encode(process.env.SESSION_SECRET);
    const legacy = await new SignJWT({ pv: "abc" }).setProtectedHeader({ alg: "HS256" }).setSubject("user-1").setExpirationTime("1h").sign(key);
    expect(await verifySessionToken(legacy)).toBeNull();
  });

  it("flags tokens signed before the account was created", async () => {
    const { createSessionToken, issuedBeforeAccount, verifySessionToken } = await import("@/lib/auth/token");
    const session = (await verifySessionToken(await createSessionToken("user-1")))!;
    expect(issuedBeforeAccount(session, new Date(Date.now() - 60_000))).toBe(false);
    expect(issuedBeforeAccount(session, new Date())).toBe(false);
    expect(issuedBeforeAccount(session, new Date(Date.now() + 60_000))).toBe(true);
    expect(issuedBeforeAccount({ userId: "user-1" }, new Date(0))).toBe(true);
  });

  it("refuses a short SESSION_SECRET", async () => {
    const { createSessionToken } = await import("@/lib/auth/token");
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "too-short";
    try {
      await expect(createSessionToken("user-1")).rejects.toThrow(/at least 32 characters/);
    } finally {
      process.env.SESSION_SECRET = saved;
    }
  });
});

describe("handoff codes", () => {
  it("carries a fresh id per code and rejects session tokens", async () => {
    const { createHandoffCode, createSessionToken, verifyHandoffCode } = await import("@/lib/auth/token");
    const one = await verifyHandoffCode(await createHandoffCode("user-1"));
    const two = await verifyHandoffCode(await createHandoffCode("user-1"));
    expect(one).toMatchObject({ userId: "user-1", jti: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(two?.jti).not.toBe(one?.jti);
    expect(await verifyHandoffCode(await createSessionToken("user-1"))).toBeNull();
    expect(await verifyHandoffCode("nope")).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies the right password only and salts every hash", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
    const one = await hashPassword("correct horse");
    const two = await hashPassword("correct horse");
    expect(one).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(one).not.toBe(two);
    expect(await verifyPassword("correct horse", one)).toBe(true);
    expect(await verifyPassword("correct horsE", one)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("passcode comparison", () => {
  it("matches in constant time with trimming and rejects wrong codes", async () => {
    const { passcodeMatches, secretMatches } = await import("@/lib/auth/passcode");
    expect(passcodeMatches("  falcon-1 ", "falcon-1")).toBe(true);
    expect(passcodeMatches("falcon-2", "falcon-1")).toBe(false);
    expect(passcodeMatches("", "falcon-1")).toBe(false);
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abc", "abd")).toBe(false);
  });
});

describe("bearer tokens", () => {
  it("reads a Bearer authorization header and ignores other schemes", async () => {
    const { bearerToken } = await import("@/lib/auth/token");
    expect(bearerToken(new Headers({ authorization: "Bearer abc.def.ghi" }))).toBe("abc.def.ghi");
    expect(bearerToken(new Headers({ authorization: "bearer   abc" }))).toBe("abc");
    expect(bearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Bearer" }))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});
