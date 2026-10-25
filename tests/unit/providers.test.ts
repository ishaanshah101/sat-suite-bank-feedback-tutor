import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APICallError } from "ai";

const ORIGINAL = { ...process.env };

async function freshProviders() {
  const mod = await import("@/lib/ai/providers");
  return mod;
}

describe("provider failover", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.AI_PROVIDER_ORDER = "openai,anthropic";
    delete process.env.RULECARD_STUB_AI;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("orders configured providers by AI_PROVIDER_ORDER", async () => {
    const { configuredProviders, providerOrder } = await freshProviders();
    expect(providerOrder()).toEqual(["openai", "anthropic"]);
    expect(configuredProviders()).toEqual(["openai", "anthropic"]);
    process.env.AI_PROVIDER_ORDER = "anthropic";
    expect(providerOrder()).toEqual(["anthropic", "openai"]);
    delete process.env.OPENAI_API_KEY;
    expect(configuredProviders()).toEqual(["anthropic"]);
  });

  it("classifies quota, auth and outage errors as failover errors", async () => {
    const { isFailoverError } = await freshProviders();
    const make = (statusCode: number) =>
      new APICallError({ message: "x", url: "https://example.com", requestBodyValues: {}, statusCode, responseHeaders: {}, responseBody: "" });
    for (const status of [401, 402, 403, 429, 500, 503]) expect(isFailoverError(make(status))).toBe(true);
    expect(isFailoverError(make(400))).toBe(false);
    expect(isFailoverError(make(422))).toBe(false);
    expect(isFailoverError(new TypeError("fetch failed"))).toBe(true);
    expect(isFailoverError(new Error("schema mismatch"))).toBe(false);
  });

  it("falls over to the next provider on a 429 and cools the failed one down", async () => {
    const { withFailover, cooldownUntil } = await freshProviders();
    const calls: string[] = [];
    const out = await withFailover("explain", async (p) => {
      calls.push(p.name);
      if (p.name === "openai") {
        throw new APICallError({ message: "quota", url: "u", requestBodyValues: {}, statusCode: 429, responseHeaders: {}, responseBody: "" });
      }
      return "ok";
    });
    expect(calls).toEqual(["openai", "anthropic"]);
    expect(out.provider).toBe("anthropic");
    expect(out.model).toBe("claude-sonnet-5-5");
    expect(cooldownUntil("openai")).not.toBeNull();

    // Cooled-down provider is tried last on the next call.
    const order: string[] = [];
    await withFailover("chat", async (p) => {
      order.push(p.name);
      return 1;
    });
    expect(order).toEqual(["anthropic"]);
  });

  it("does not fail over on non-retryable errors", async () => {
    const { withFailover } = await freshProviders();
    await expect(
      withFailover("drill", async () => {
        throw new Error("bad schema");
      }),
    ).rejects.toThrow("bad schema");
  });

  it("throws NoProviderError when no key is set", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { withFailover, NoProviderError } = await freshProviders();
    await expect(withFailover("explain", async () => 1)).rejects.toBeInstanceOf(NoProviderError);
  });
});

describe("gateway fallback", () => {
  it("joins the chain last on Vercel or with a gateway key, and can be switched off", async () => {
    const saved = { VERCEL: process.env.VERCEL, AI_GATEWAY: process.env.AI_GATEWAY, AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY };
    try {
      delete process.env.VERCEL;
      delete process.env.AI_GATEWAY;
      delete process.env.AI_GATEWAY_API_KEY;
      process.env.OPENAI_API_KEY = "test-openai";
      process.env.ANTHROPIC_API_KEY = "";
      process.env.AI_PROVIDER_ORDER = "openai,anthropic";
      let mod = await freshProviders();
      expect(mod.providerOrder()).toEqual(["openai", "anthropic"]);
      expect(mod.configuredProviders()).toEqual(["openai"]);

      process.env.VERCEL = "1";
      mod = await freshProviders();
      expect(mod.providerOrder()).toEqual(["openai", "anthropic", "gateway"]);
      expect(mod.configuredProviders()).toEqual(["openai", "gateway"]);
      const handles = await mod.availableProviders();
      expect(handles.map((h) => h.name)).toEqual(["openai", "gateway"]);
      expect(handles[1].modelId("extract")).toBe("openai/gpt-6-luna");

      process.env.AI_GATEWAY = "off";
      mod = await freshProviders();
      expect(mod.providerOrder()).toEqual(["openai", "anthropic"]);

      delete process.env.VERCEL;
      delete process.env.AI_GATEWAY;
      process.env.AI_GATEWAY_API_KEY = "vck_test";
      process.env.AI_PROVIDER_ORDER = "gateway,openai";
      mod = await freshProviders();
      expect(mod.providerOrder()).toEqual(["gateway", "openai", "anthropic"]);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
