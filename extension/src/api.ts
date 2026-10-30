import type { ChatMessage, Settings } from "./types";

export const DEFAULT_SERVER = "https://rulecard.vercel.app";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get("settings")) as { settings?: Partial<Settings> };
  return { server: DEFAULT_SERVER, token: null, ...(stored.settings ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export function normalizeServer(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SERVER;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).origin;
}

interface RequestInitLite {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function request<T>(settings: Settings, path: string, init: RequestInitLite = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth !== false && settings.token) headers.authorization = `Bearer ${settings.token}`;
  let response: Response;
  try {
    response = await fetch(settings.server + path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Could not reach ${settings.server}. Check the server address and your connection.`);
  }
  const text = await response.text();
  let data: ({ error?: string; code?: string } & T) | null = null;
  try {
    data = text ? (JSON.parse(text) as { error?: string; code?: string } & T) : null;
  } catch {
    throw new ApiError(response.status, text.slice(0, 200) || response.statusText);
  }
  if (!response.ok) throw new ApiError(response.status, data?.error ?? response.statusText, data?.code);
  return data as T;
}

export async function authenticate(
  server: string,
  mode: "signin" | "signup",
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string } }> {
  return request({ server, token: null }, mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", { body: { email, password }, auth: false });
}

/** A link that opens `path` on the web app already signed in as this account (one-minute code). */
export async function webLink(settings: Settings, path: string): Promise<string> {
  const { code } = await request<{ code: string }>(settings, "/api/auth/handoff", { method: "POST", body: {} });
  return `${settings.server}/api/auth/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`;
}

/** Stream one chat turn from the AI SDK UI message stream (SSE lines of JSON parts). Resolves with the full reply. */
export async function streamChat(
  settings: Settings,
  attemptId: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
): Promise<string> {
  const messages = history.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.text }] }));
  let response: Response;
  try {
    response = await fetch(settings.server + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.token ?? ""}` },
      body: JSON.stringify({ attemptId, messages }),
    });
  } catch {
    throw new ApiError(0, `Could not reach ${settings.server}.`);
  }
  if (!response.ok || !response.body) {
    const text = await response.text();
    let message = response.statusText;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string };
      message = parsed.error ?? message;
      code = parsed.code;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new ApiError(response.status, message, code);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let part: { type?: string; delta?: string; errorText?: string };
      try {
        part = JSON.parse(payload) as typeof part;
      } catch {
        continue;
      }
      if (part.type === "text-delta" && typeof part.delta === "string") {
        full += part.delta;
        onDelta(part.delta);
      } else if (part.type === "error") {
        throw new ApiError(502, part.errorText ?? "The tutor hit an error mid-reply.");
      }
    }
  }
  return full;
}
