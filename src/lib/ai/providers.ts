import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, createGateway, NoObjectGeneratedError, NoOutputGeneratedError, RetryError, type LanguageModel } from "ai";
import { env } from "@/lib/env";
import { recordProviderError, recordProviderOk } from "@/db/queries";

export type ProviderName = "openai" | "anthropic" | "gateway";
const KNOWN: ProviderName[] = ["openai", "anthropic", "gateway"];
export type TaskKind = "extract" | "explain" | "chat" | "drill";

export interface ProviderHandle {
  name: ProviderName;
  model(kind: TaskKind): LanguageModel;
  modelId(kind: TaskKind): string;
  providerOptions(kind: TaskKind): Record<string, Record<string, string>>;
}

export class NoProviderError extends Error {
  constructor() {
    super("No AI provider is configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
    this.name = "NoProviderError";
  }
}

const COOLDOWN_MS = 10 * 60 * 1000;
const cooldowns = new Map<ProviderName, number>();

function openaiModels(): Record<TaskKind, string> {
  const explain = env("OPENAI_EXPLAIN_MODEL") ?? "gpt-6.1-sol";
  return {
    extract: env("OPENAI_EXTRACT_MODEL") ?? "gpt-6-luna",
    explain,
    chat: env("OPENAI_CHAT_MODEL") ?? explain,
    drill: explain,
  };
}

function anthropicModels(): Record<TaskKind, string> {
  const explain = env("ANTHROPIC_EXPLAIN_MODEL") ?? "claude-sonnet-5-5";
  return {
    extract: env("ANTHROPIC_EXTRACT_MODEL") ?? "claude-haiku-5-5",
    explain,
    chat: env("ANTHROPIC_CHAT_MODEL") ?? explain,
    drill: explain,
  };
}

/**
 * Vercel AI Gateway: no key of your own needed on Vercel (the deployment's OIDC identity signs the calls),
 * or set AI_GATEWAY_API_KEY anywhere. Billed to the Vercel account's gateway credits. AI_GATEWAY=off disables it.
 */
export function gatewayEnabled(): boolean {
  if (env("AI_GATEWAY") === "off") return false;
  return Boolean(env("AI_GATEWAY_API_KEY")) || env("VERCEL") === "1";
}

/**
 * Candidate models per task, best first. Vercel's free gateway tier only allows some models, so the
 * gateway walks this list and remembers (per server instance) which ones the account may not use.
 * All candidates read images and support structured output.
 */
const GATEWAY_CHEAP = [
  "openai/gpt-6-luna",
  "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5-nano",
  "anthropic/claude-haiku-5.5",
  "openai/gpt-4o-mini",
  "mistral/mistral-small",
  "alibaba/qwen3.7-flash",
];
const GATEWAY_STRONG = ["openai/gpt-6.1-sol", "anthropic/claude-sonnet-5.5", "google/gemini-2.5-flash", "openai/gpt-5-mini", ...GATEWAY_CHEAP];

function gatewayCandidates(): Record<TaskKind, string[]> {
  const list = (name: string, fallback: string[]) => {
    const raw = env(name);
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
  };
  const explain = list("GATEWAY_EXPLAIN_MODEL", GATEWAY_STRONG);
  return {
    extract: list("GATEWAY_EXTRACT_MODEL", GATEWAY_CHEAP),
    explain,
    chat: list("GATEWAY_CHAT_MODEL", explain),
    drill: explain,
  };
}

const blockedGatewayModels = new Set<string>();

/** The account cannot use this model (free tier, unknown model): try the next candidate, not the next provider. */
export function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /free tier|do not have access to this model|model.{0,40}(not found|not available|unsupported|does not exist)|no such model/i.test(message);
}

// Provider options are JSON values passed straight through to the model provider.
type ProviderOptionsValue = Record<string, Record<string, string | number | boolean | Record<string, number>>>;

function gatewayOptionsFor(id: string, kind: TaskKind): ProviderOptionsValue {
  const anthropicEffort: Record<TaskKind, string> = { extract: "low", explain: "medium", chat: "low", drill: "medium" };
  if (id.startsWith("anthropic/")) return { anthropic: { effort: anthropicEffort[kind] } };
  if (id.startsWith("openai/gpt-5") || id.startsWith("openai/gpt-6")) return { openai: { reasoningEffort: "low" } };
  // Gemini thinks by default and its thinking tokens count against the output limit, which truncates JSON.
  if (id.startsWith("google/gemini")) return { google: { thinkingConfig: { thinkingBudget: 512 } } };
  return {};
}

/** Run a model call again (up to `attempts` times) when the reply was not valid structured output. */
export async function retryOnNoOutput<T>(call: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await call();
    } catch (error) {
      if (!isNoOutputError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function makeGateway(): ProviderHandle {
  const provider = createGateway({ apiKey: env("AI_GATEWAY_API_KEY") });
  const candidates = gatewayCandidates();
  const usable = (kind: TaskKind) => {
    const left = candidates[kind].filter((id) => !blockedGatewayModels.has(id));
    return left.length ? left : candidates[kind];
  };
  type GatewayModel = ReturnType<typeof provider>;
  type CallOptions = Parameters<GatewayModel["doGenerate"]>[0];

  async function tryEach<T>(kind: TaskKind, options: CallOptions, call: (model: GatewayModel, options: CallOptions) => PromiseLike<T>): Promise<T> {
    let lastError: unknown;
    for (const id of usable(kind)) {
      try {
        return await call(provider(id), { ...options, providerOptions: { ...gatewayOptionsFor(id, kind) } });
      } catch (error) {
        if (!isModelUnavailableError(error)) throw error;
        blockedGatewayModels.add(id);
        lastError = error;
      }
    }
    throw lastError;
  }

  const chained = (kind: TaskKind): GatewayModel => {
    const first = provider(usable(kind)[0]);
    const model = Object.create(first) as GatewayModel;
    Object.defineProperty(model, "modelId", { get: () => usable(kind)[0] });
    model.doGenerate = (options) => tryEach(kind, options, (m, o) => m.doGenerate(o));
    model.doStream = (options) => tryEach(kind, options, (m, o) => m.doStream(o));
    return model;
  };

  return {
    name: "gateway",
    model: (kind) => chained(kind),
    modelId: (kind) => usable(kind)[0],
    providerOptions: () => ({}),
  };
}

function makeOpenAI(apiKey: string): ProviderHandle {
  const provider = createOpenAI({ apiKey });
  const models = openaiModels();
  return {
    name: "openai",
    model: (kind) => provider(models[kind]),
    modelId: (kind) => models[kind],
    providerOptions: () => ({ openai: { reasoningEffort: "low" } }),
  };
}

function makeAnthropic(apiKey: string): ProviderHandle {
  const provider = createAnthropic({ apiKey });
  const models = anthropicModels();
  const effort: Record<TaskKind, string> = { extract: "low", explain: "medium", chat: "low", drill: "medium" };
  return {
    name: "anthropic",
    model: (kind) => provider(models[kind]),
    modelId: (kind) => models[kind],
    providerOptions: (kind) => ({ anthropic: { effort: effort[kind] } }),
  };
}

/** Preference order. Your own keys come first; the gateway is appended last when it is enabled. */
export function providerOrder(): ProviderName[] {
  const raw = env("AI_PROVIDER_ORDER") ?? "openai,anthropic";
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderName => (KNOWN as string[]).includes(s));
  const unique = [...new Set(names)];
  for (const fallback of ["openai", "anthropic"] as const) if (!unique.includes(fallback)) unique.push(fallback);
  if (gatewayEnabled() && !unique.includes("gateway")) unique.push("gateway");
  return unique;
}

export function isConfigured(name: ProviderName): boolean {
  if (name === "openai") return Boolean(env("OPENAI_API_KEY"));
  if (name === "anthropic") return Boolean(env("ANTHROPIC_API_KEY"));
  return gatewayEnabled();
}

export function configuredProviders(): ProviderName[] {
  return providerOrder().filter(isConfigured);
}

export function isStubMode(): boolean {
  return env("RULECARD_STUB_AI") === "1";
}

export async function availableProviders(): Promise<ProviderHandle[]> {
  if (isStubMode()) {
    const { stubProvider } = await import("./stub");
    return [stubProvider()];
  }
  const handles: ProviderHandle[] = [];
  for (const name of providerOrder()) {
    if (name === "openai") {
      const key = env("OPENAI_API_KEY");
      if (key) handles.push(makeOpenAI(key));
    } else if (name === "anthropic") {
      const key = env("ANTHROPIC_API_KEY");
      if (key) handles.push(makeAnthropic(key));
    } else if (gatewayEnabled()) {
      handles.push(makeGateway());
    }
  }
  return handles;
}

export function cooldownUntil(name: ProviderName): number | null {
  const until = cooldowns.get(name);
  return until && until > Date.now() ? until : null;
}

function statusCodeOf(error: unknown): number | null {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : null;
}

/** Quota, billing, auth, rate limit, provider outage or network failure: try the next provider. */
export function isFailoverError(error: unknown): boolean {
  // The SDK retries retryable calls itself and then throws a wrapper around the last error.
  if (RetryError.isInstance(error)) {
    return isFailoverError(error.lastError) || error.errors.some((e) => isFailoverError(e));
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 401 || status === 402 || status === 403 || status === 429) return true;
    if (status >= 500) return true;
    if (status === 0 && error.isRetryable) return true;
    return false;
  }
  // Gateway errors carry a status code of their own (authentication, credits, rate limit, upstream outage).
  const status = statusCodeOf(error);
  if (status !== null) {
    return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (/fetch failed|econnreset|econnrefused|enotfound|socket hang up|network/.test(message)) return true;
  }
  return false;
}

/** True when the model answered but produced no usable structured output (truncated or off-schema JSON). */
export function isNoOutputError(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

/** Leave the platform some seconds to run cleanup before a function hits its max duration. */
export function abortAfter(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function errorSummary(error: unknown): string {
  if (RetryError.isInstance(error)) return errorSummary(error.lastError);
  if (APICallError.isInstance(error)) return `${error.statusCode ?? "network"}: ${error.message}`.slice(0, 400);
  const status = statusCodeOf(error);
  if (status !== null && error instanceof Error) return `${status}: ${error.message}`.slice(0, 400);
  if (error instanceof Error) return error.message.slice(0, 400);
  return String(error).slice(0, 400);
}

export interface FailoverResult<T> {
  result: T;
  provider: ProviderName;
  model: string;
}

export async function withFailover<T>(kind: TaskKind, task: (provider: ProviderHandle) => Promise<T>): Promise<FailoverResult<T>> {
  const providers = await availableProviders();
  if (providers.length === 0) throw new NoProviderError();
  const now = Date.now();
  const ready = providers.filter((p) => !cooldownUntil(p.name));
  const cooled = providers.filter((p) => cooldownUntil(p.name));
  const ordered = [...ready, ...cooled];
  let lastError: unknown;
  for (const provider of ordered) {
    try {
      const result = await task(provider);
      if (cooldowns.has(provider.name)) cooldowns.delete(provider.name);
      void recordProviderOk(provider.name).catch(() => undefined);
      return { result, provider: provider.name, model: provider.modelId(kind) };
    } catch (error) {
      lastError = error;
      if (isFailoverError(error) && (provider.name as string) !== "stub") {
        const until = now + COOLDOWN_MS;
        cooldowns.set(provider.name, until);
        void recordProviderError(provider.name, errorSummary(error), new Date(until)).catch(() => undefined);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/** For streaming routes: the first provider that is not cooling down. */
export async function pickProvider(): Promise<ProviderHandle> {
  const providers = await availableProviders();
  if (providers.length === 0) throw new NoProviderError();
  return providers.find((p) => !cooldownUntil(p.name)) ?? providers[0];
}

export function noteStreamError(provider: ProviderHandle, error: unknown): void {
  if (!isFailoverError(error)) return;
  const until = Date.now() + COOLDOWN_MS;
  cooldowns.set(provider.name, until);
  void recordProviderError(provider.name, errorSummary(error), new Date(until)).catch(() => undefined);
}

export function noteStreamOk(provider: ProviderHandle): void {
  cooldowns.delete(provider.name);
  void recordProviderOk(provider.name).catch(() => undefined);
}
