// The panel: a small black pill in the corner. One button reads the screen; the answer shows next to it.
// Nothing else: no explanation, no chat. Sign-in and the screen permission are small cards of their own.
export {};

interface SolvedView {
  answer: string;
  letter: string | null;
  value: string | null;
}

type HelperEvent =
  | { type: "capturing" }
  | { type: "status"; text: string }
  | { type: "first"; result: SolvedView }
  | { type: "done"; result: SolvedView; agreement: "agreed" | "tiebreak" | "single"; ms: number }
  | { type: "error"; error: string; code?: string; status?: number }
  | { type: "needs-permission" }
  | { type: "signed-out" };

interface HelperState {
  signedIn: boolean;
  email: string | null;
  shortcuts: { toggle: string | null; solve: string | null };
  screenAccess: string;
  platform: string;
}

interface HelperApi {
  state(): Promise<HelperState>;
  signIn(mode: "signin" | "signup", email: string, password: string): Promise<{ email: string }>;
  solve(): Promise<void>;
  openScreenSettings(): Promise<void>;
  relaunch(): Promise<void>;
  hide(): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  onEvent(listener: (event: HelperEvent) => void): () => void;
}

declare global {
  interface Window {
    helper: HelperApi;
  }
}

const api = window.helper;

type View = "loading" | "signin" | "home" | "permission";

const state = {
  view: "loading" as View,
  info: null as HelperState | null,
  mode: "signin" as "signin" | "signup",
  authError: null as string | null,
  busy: false,
  phase: "idle" as "idle" | "working" | "done" | "error",
  /** The quick answer, shown dimmed while the careful one is still checking it. */
  first: null as string | null,
  answer: null as string | null,
  agreement: null as "agreed" | "tiebreak" | "single" | null,
  error: null as string | null,
};

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key === "text") el.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === "value" || key === "disabled") (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : document.createTextNode(child));
  return el;
}

/** A small "look" glyph: a viewfinder. Drawn in currentColor so it follows the button's color. */
function lookIcon(): Element {
  const wrap = h("span");
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>`;
  return wrap.firstElementChild as Element;
}

function render(): void {
  const root = document.getElementById("app")!;
  const keep = document.activeElement instanceof HTMLInputElement ? document.activeElement.id : null;
  const view = state.view === "signin" ? signInView() : state.view === "permission" ? permissionView() : homeView();
  root.replaceChildren(view);
  if (keep) (document.getElementById(keep) as HTMLInputElement | null)?.focus();
  fitWindow(view as HTMLElement);
}

/** The window is exactly as big as what it shows, so the pill stays small. */
let lastSize = "";
function fitWindow(el: HTMLElement): void {
  requestAnimationFrame(() => {
    const box = el.getBoundingClientRect();
    const width = Math.ceil(box.width);
    const height = Math.ceil(box.height);
    const key = `${width}x${height}`;
    if (key === lastSize || !width || !height) return;
    lastSize = key;
    void api.resize(width, height);
  });
}

function homeView(): Node {
  const working = state.phase === "working";
  const shown = state.answer ?? state.first;
  const solveKey = state.info?.shortcuts.solve;
  let out: Node;
  if (state.phase === "error" && state.error) out = h("span", { class: "msg", text: state.error, title: state.error });
  else if (shown) {
    const pending = !state.answer;
    const note = pending ? "Double-checking…" : state.agreement === "agreed" ? "Checked twice" : state.agreement === "tiebreak" ? "Close call: checked 3 times" : "Checked once";
    out = h("span", { class: `ans${pending ? " pending" : ""}`, text: shown, title: `${shown} · ${note}` });
  } else if (working) out = h("span", { class: "dots", text: "Reading", "aria-live": "polite" });
  else out = h("span", { class: "hint", text: solveKey ? `Answer ${solveKey}` : "Answer" });
  return h(
    "div",
    { class: "pill" },
    h("button", { class: "go", disabled: working, title: `Read the screen and answer${solveKey ? ` (${solveKey})` : ""}`, onclick: () => void api.solve() }, working ? h("span", { class: "spin" }) : lookIcon()),
    out,
    h("button", { class: "x", title: `Hide${state.info?.shortcuts.toggle ? ` (${state.info.shortcuts.toggle})` : ""}`, text: "×", onclick: () => void api.hide() }),
  );
}

function signInView(): Node {
  const submit = async (event: Event) => {
    event.preventDefault();
    const email = (document.getElementById("email") as HTMLInputElement).value.trim();
    const password = (document.getElementById("password") as HTMLInputElement).value;
    state.busy = true;
    state.authError = null;
    render();
    try {
      await api.signIn(state.mode, email, password);
      await refresh();
    } catch (error) {
      state.authError = cleanError(error);
    } finally {
      state.busy = false;
      render();
    }
  };
  return h(
    "form",
    { class: "card", onsubmit: submit },
    h("div", { class: "row" }, h("span", { class: "title", text: "Rulecard Helper" }), h("button", { class: "x", type: "button", title: "Hide", text: "×", onclick: () => void api.hide() })),
    h("input", { id: "email", class: "field", type: "email", placeholder: "Email", autocomplete: "username", required: true }),
    h("input", { id: "password", class: "field", type: "password", placeholder: state.mode === "signup" ? "New password (10+ characters)" : "Password", autocomplete: state.mode === "signup" ? "new-password" : "current-password", required: true }),
    state.authError ? h("div", { class: "small", text: state.authError }) : null,
    h("button", { class: "primary", type: "submit", disabled: state.busy }, state.busy ? h("span", { class: "spin" }) : null, state.mode === "signup" ? "Create account" : "Sign in"),
    h("button", {
      class: "link",
      type: "button",
      text: state.mode === "signup" ? "I have an account" : "Create an account",
      onclick: () => {
        state.mode = state.mode === "signup" ? "signin" : "signup";
        state.authError = null;
        render();
      },
    }),
  );
}

function permissionView(): Node {
  return h(
    "div",
    { class: "card" },
    h("div", { class: "row" }, h("span", { class: "title", text: "Allow screen access" }), h("button", { class: "x", title: "Hide", text: "×", onclick: () => void api.hide() })),
    h("div", { class: "small", text: "Turn on Rulecard Helper in Screen & System Audio Recording. It restarts by itself and answers." }),
    h("button", { class: "primary", onclick: () => void api.openScreenSettings() }, "Open Settings"),
    h("button", { class: "link", onclick: () => void api.relaunch(), text: "Didn't restart? Relaunch" }),
  );
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** Errors as a few words that fit the pill. */
function shortError(error: string, code?: string): string {
  if (code === "no_question" || /no (complete )?(sat or act )?question/i.test(error)) return "No question on screen";
  if (/daily|limit/i.test(error)) return "Daily limit reached";
  if (/could not see the screen/i.test(error)) return "Can't see the screen";
  if (/reach|network|connection|fetch/i.test(error)) return "No connection";
  return "Couldn't answer. Try again";
}

async function refresh(): Promise<void> {
  state.info = await api.state();
  state.view = !state.info.signedIn ? "signin" : state.info.platform === "darwin" && state.info.screenAccess === "denied" ? "permission" : "home";
  render();
}

api.onEvent((event) => {
  switch (event.type) {
    case "capturing":
      state.phase = "working";
      state.first = null;
      state.answer = null;
      state.agreement = null;
      state.error = null;
      break;
    case "status":
      state.phase = "working";
      break;
    case "first":
      state.phase = "working";
      state.first = event.result.answer;
      break;
    case "done":
      state.phase = "done";
      state.answer = event.result.answer;
      state.agreement = event.agreement;
      break;
    case "error":
      state.phase = "error";
      state.error = shortError(event.error, event.code);
      state.first = null;
      break;
    case "needs-permission":
      state.phase = "idle";
      state.view = "permission";
      break;
    case "signed-out":
      void refresh();
      return;
  }
  render();
});

render();
void refresh();
