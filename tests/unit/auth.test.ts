import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-secret-0123456789abcdef";
  process.env.APP_PASSCODE = "unit-passcode-1";
});

describe("session tokens", () => {
  it("round-trips a signed session and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth/token");
    const token = await createSessionToken("user-1");
    expect(await verifySessionToken(token)).toEqual({ userId: "user-1" });
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
