// Calls to the Rulecard server, made from the main process (the panel itself never touches the network).

export interface SolvedView {
  answer: string;
  letter: string | null;
  value: string | null;
  exam: "sat" | "act";
  section: string;
  format: "mcq" | "spr";
  letterStyle: "abcd" | "fghj";
  stem: string;
  choices: Record<string, string>;
  why: string[];
  confidence: number;
}

export type SolveEvent =
  | { type: "status"; text: string }
  | { type: "first"; result: SolvedView }
  | { type: "done"; result: SolvedView; agreement: "agreed" | "tiebreak" | "single"; ms: number }
  | { type: "error"; error: string; code?: string; status: number };

const UA = "RulecardHelper/1.0";

async function call<T>(server: string, path: string, init: { token?: string | null; body?: unknown; method?: string }): Promise<T> {
  const res = await fetch(`${server}${path}`, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", "user-agent": UA, ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || `The server answered ${res.status}. Try again.`);
  }
  return data as T;
}

export function signIn(server: string, mode: "signin" | "signup", email: string, password: string) {
  return call<{ token: string; user: { id: string; email: string } }>(server, mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", { body: { email, password } });
}

export function signOut(server: string, token: string) {
  return call<unknown>(server, "/api/logout", { token, body: {} });
}


/** POST /api/solve and hand each NDJSON event to `onEvent` as it arrives. */
export async function solveStream(server: string, token: string, image: string, onEvent: (event: SolveEvent) => void): Promise<void> {
  const res = await fetch(`${server}/api/solve`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA, authorization: `Bearer ${token}` },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(200_000),
  });
  if (!res.ok || !res.body) {
    let message = `The server answered ${res.status}. Try again.`;
    try {
      message = ((await res.json()) as { error?: string }).error || message;
    } catch {
      // keep the default
    }
    onEvent({ type: "error", error: message, status: res.status });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line) as SolveEvent;
        if (event.type === "done" || event.type === "error") finished = true;
        onEvent(event);
      } catch {
        // skip a malformed line
      }
    }
  }
  if (!finished) onEvent({ type: "error", error: "The answer was cut off. Try again.", status: 0 });
}
