import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-secret-0123456789abcdef";
});

describe("session tokens", () => {
  it("round-trips a signed session and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth/token");
    const token = await createSessionToken("user-1");
    expect(await verifySessionToken(token)).toEqual({ userId: "user-1" });
    expect(await verifySessionToken(token.slice(0, -2) + "zz")).toBeNull();
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
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
