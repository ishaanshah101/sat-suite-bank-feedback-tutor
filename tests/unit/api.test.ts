import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ userId: "user-1" }),
  UnauthorizedError: class UnauthorizedError extends Error {},
  unauthorizedResponse: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));

async function run(error: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const { withApi } = await import("@/lib/api");
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const response = await withApi(async () => {
      throw error;
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  } finally {
    spy.mockRestore();
  }
}

describe("withApi error mapping", () => {
  it("maps database constraint and uniqueness errors without echoing them", async () => {
    const check = Object.assign(new Error('new row violates check constraint "questions_section_chk"'), { code: "23514" });
    expect(await run(check)).toEqual({ status: 400, body: { error: "Invalid data", code: "constraint" } });
    const unique = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), { code: "23505" });
    expect(await run(unique)).toEqual({ status: 409, body: { error: "Already exists", code: "conflict" } });
  });

  it("maps timeouts and aborts to 504", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(await run(timeout)).toMatchObject({ status: 504, body: { code: "timeout" } });
    const abort = new DOMException("aborted", "AbortError");
    expect(await run(abort)).toMatchObject({ status: 504, body: { code: "timeout" } });
  });

  it("maps rate limits and hides unknown errors", async () => {
    const { RateLimitError } = await import("@/lib/auth/limit");
    expect(await run(new RateLimitError(429, "Too many tries."))).toEqual({ status: 429, body: { error: "Too many tries.", code: "rate_limited" } });
    expect(await run(new RateLimitError(503, "Database unavailable."))).toMatchObject({ status: 503, body: { code: "unavailable" } });
    const leaky = await run(new Error("password authentication failed for user postgres"));
    expect(leaky.status).toBe(500);
    expect(JSON.stringify(leaky.body)).not.toMatch(/postgres/);
  });
});

describe("proxy matcher", () => {
  it("covers every page and API route and skips only static assets", async () => {
    const { config } = await import("@/proxy");
    // Compiled the way `next build` compiles it.
    const { tryToParsePath } = await import("next/dist/lib/try-to-parse-path");
    const parsed = tryToParsePath(config.matcher[0]);
    expect(parsed.error).toBeUndefined();
    const regex = new RegExp(parsed.regexStr!);
    for (const path of ["/", "/history", "/api/explain", "/signin", "/privacy", "/api/ping", "/api/cron/keepalive", "/signin-help"]) expect(regex.test(path), path).toBe(true);
    for (const path of ["/_next/static/x", "/_next/image", "/favicon.ico", "/icon.svg", "/robots.txt"]) expect(regex.test(path), path).toBe(false);
  });

  it("treats only whole public segments as public pages", async () => {
    const { isPublicPage } = await import("@/proxy");
    for (const path of ["/signin", "/signin/", "/unlock", "/privacy", "/privacy/x"]) expect(isPublicPage(path), path).toBe(true);
    for (const path of ["/", "/history", "/signin-help", "/privacy-settings", "/account"]) expect(isPublicPage(path), path).toBe(false);
  });
});
