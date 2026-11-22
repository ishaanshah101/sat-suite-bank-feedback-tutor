// The panel: sign in, one button that answers the question on screen, and a chat about it.
import { renderMathHtml } from "../../src/lib/math/render";

interface SolvedView {
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
  server: string;
  shortcuts: { toggle: string | null; solve: string | null };
  screenAccess: string;
  platform: string;
  version: string;
}

interface HelperApi {
  state(): Promise<HelperState>;
  signIn(mode: "signin" | "signup", email: string, password: string, server?: string): Promise<{ email: string }>;
  signOut(): Promise<void>;
  solve(): Promise<void>;
  chat(question: unknown, turns: Array<{ role: "user" | "assistant"; text: string }>): Promise<{ reply: string }>;
  openScreenSettings(): Promise<void>;
  relaunch(): Promise<void>;
  hide(): Promise<void>;
  openWeb(): Promise<void>;
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
  // The current question
  phase: "idle" as "idle" | "capturing" | "solving" | "done" | "error",
  statusText: "",
  first: null as SolvedView | null,
  result: null as SolvedView | null,
  agreement: null as "agreed" | "tiebreak" | "single" | null,
  error: null as string | null,
  chat: [] as Array<{ role: "user" | "assistant"; text: string }>,
  chatBusy: false,
  draft: "",
};

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key === "text") el.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === "value" || key === "disabled" || key === "checked") (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : document.createTextNode(child));
  return el;
}

/** Text that may hold LaTeX in \( \): escaped text plus MathML. */
function math(tag: "p" | "li" | "span" | "div", text: string, props: Record<string, unknown> | null = null): HTMLElement {
  const el = h(tag, props);
  el.innerHTML = renderMathHtml(text);
  return el;
}

/** The Rulecard logo: blue tile, white card (same mark as the Chrome extension icon). */
const MARK_SVG = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="rcg-${cls}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d68f2"/><stop offset="1" stop-color="#2449d6"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#rcg-${cls})"/><rect x="19" y="25" width="58" height="48" rx="7" fill="#fff"/><rect x="28" y="38" width="40" height="7" rx="3.5" fill="#2f5bea"/><rect x="28" y="52" width="25" height="6" rx="3" fill="#c9d6fb"/></svg>`;
const MARK = (cls = "spark") => {
  const wrap = h("div");
  wrap.innerHTML = MARK_SVG(cls);
  return wrap.firstElementChild as HTMLElement;
};

function render(): void {
  const root = document.getElementById("app")!;
  const keep = document.activeElement instanceof HTMLInputElement ? document.activeElement.id : null;
  root.replaceChildren(top(), body(), composer());
  if (keep) (document.getElementById(keep) as HTMLInputElement | null)?.focus();
  const scroller = root.querySelector(".body");
  if (scroller && state.view === "home" && (state.chat.length || state.result)) scroller.scrollTop = scroller.scrollHeight;
}

function top(): Node {
  return h(
    "div",
    { class: "top" },
    h("div", { class: "brand" }, MARK("brand-mark"), "Rulecard Helper"),
    state.info?.signedIn ? h("button", { class: "icon-btn", title: "Open Rulecard on the web", text: "↗", onclick: () => void api.openWeb() }) : null,
    h("button", { class: "icon-btn", title: "Hide (⌥Space)", text: "✕", onclick: () => void api.hide() }),
  );
}

function body(): Node {
  const el = h("div", { class: "body" });
  if (state.view === "loading") el.append(h("div", { class: "status" }, h("div", { class: "spin" }), "Starting"));
  else if (state.view === "signin") el.append(...signInView());
  else if (state.view === "permission") el.append(...permissionView());
  else el.append(...homeView());
  return el;
}

function signInView(): Node[] {
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
  return [
    h("div", { class: "hero" }, MARK(), h("h1", { text: "Rulecard Helper" }), h("p", { text: "Sign in with your Rulecard account. It's the same one the Chrome extension and rulecard.vercel.app use." })),
    h(
      "form",
      { class: "stack", onsubmit: submit },
      h("input", { id: "email", class: "field", type: "email", placeholder: "Email", autocomplete: "username", required: true }),
      h("input", { id: "password", class: "field", type: "password", placeholder: state.mode === "signup" ? "New password (10+ characters)" : "Password", autocomplete: state.mode === "signup" ? "new-password" : "current-password", required: true }),
      state.authError ? h("div", { class: "error", text: state.authError }) : null,
      h("button", { class: "solve", type: "submit", disabled: state.busy }, state.busy ? h("div", { class: "spin" }) : null, state.mode === "signup" ? "Create account" : "Sign in"),
      h(
        "div",
        { class: "meta" },
        state.mode === "signup" ? "Already have an account? " : "New to Rulecard? ",
        h("button", {
          class: "link",
          type: "button",
          text: state.mode === "signup" ? "Sign in" : "Create one",
          onclick: () => {
            state.mode = state.mode === "signup" ? "signin" : "signup";
            state.authError = null;
            render();
          },
        }),
      ),
    ),
  ];
}

function permissionView(): Node[] {
  return [
    h("div", { class: "hero" }, MARK(), h("h1", { text: "Let it see your screen" }), h("p", { text: "macOS asks once before any app can read the screen." })),
    h(
      "div",
      { class: "card" },
      h(
        "ol",
        { class: "steps" },
        h("li", { text: "Open System Settings → Privacy & Security → Screen & System Audio Recording." }),
        h("li", { text: "Turn on Rulecard Helper." }),
        h("li", { text: "That's it. Rulecard Helper restarts by itself and answers the question on your screen." }),
      ),
    ),
    h("button", { class: "solve", onclick: () => void api.openScreenSettings() }, "Open Screen Recording settings"),
    h("p", { class: "meta", text: "Waiting for the switch to be turned on…" }),
    h("button", { class: "chip", onclick: () => void api.relaunch() }, "Didn't restart? Relaunch now"),
  ];
}

function homeView(): Node[] {
  const nodes: Node[] = [];
  const solving = state.phase === "capturing" || state.phase === "solving";
  if (!state.result && !state.first && state.phase !== "error" && !solving) {
    nodes.push(
      h("div", { class: "hero" }, MARK(), h("h1", { text: "Stuck on a question?" }), h("p", { text: "Open the question so it and its answer choices are on screen. Rulecard reads it and gives you the answer, checked twice." })),
    );
  }
  nodes.push(
    h(
      "button",
      { class: "solve", disabled: solving, onclick: () => void api.solve() },
      solving ? h("div", { class: "spin" }) : null,
      solving ? "Working on it" : state.result ? "Answer the next question" : "Answer the question on my screen",
      state.info?.shortcuts.solve && !solving ? h("kbd", { text: state.info.shortcuts.solve }) : null,
    ),
  );
  if (state.phase === "capturing") nodes.push(h("div", { class: "status" }, h("div", { class: "spin" }), "Looking at your screen"));
  if (state.phase === "solving" && !state.first) nodes.push(h("div", { class: "status" }, h("div", { class: "spin" }), state.statusText || "Reading the question"));
  const shown = state.result ?? state.first;
  if (shown) nodes.push(answerCard(shown, !state.result));
  if (state.phase === "error" && state.error) nodes.push(h("div", { class: "card" }, h("div", { class: "error", text: state.error })));
  if (!shown && !solving && state.phase !== "error") {
    nodes.push(
      h(
        "div",
        { class: "chips" },
        h("button", { class: "chip", text: "How does it work?", onclick: () => ask("How do you work, and how do you make sure the answer is right?") }),
        h("button", { class: "chip", text: "Ask about a rule", onclick: () => focusComposer("When do I use a semicolon on the SAT?") }),
      ),
    );
  }
  for (const m of state.chat) nodes.push(math("div", m.text, { class: `msg ${m.role}` }));
  if (state.chatBusy) nodes.push(h("div", { class: "status" }, h("div", { class: "spin" }), "Thinking"));
  nodes.push(h("div", { class: "foot" }, footText(), h("br"), state.info?.email ? `${state.info.email} · ` : "", h("button", { class: "link", type: "button", text: "Sign out", onclick: () => void signOut() })));
  return nodes;
}

function footText(): string {
  const s = state.info?.shortcuts;
  const parts = [s?.solve ? `${s.solve} answers the question on screen` : null, s?.toggle ? `${s.toggle} shows or hides this panel` : null].filter(Boolean);
  return parts.join(" · ");
}

function answerCard(r: SolvedView, pending: boolean): Node {
  const test = `${r.exam === "act" ? "ACT" : "SAT"} ${sectionName(r)}`;
  const badge = pending
    ? h("span", { class: "badge" }, h("div", { class: "spin" }), "Double-checking")
    : state.agreement === "agreed"
      ? h("span", { class: "badge good", text: "✓ Checked twice" })
      : state.agreement === "tiebreak"
        ? h("span", { class: "badge warn", text: "Checked 3 times: close call" })
        : h("span", { class: "badge warn", text: "Checked once" });
  const letters = r.format === "mcq" ? lettersOf(r) : [];
  return h(
    "div",
    { class: `card ${pending ? "pending" : ""}` },
    h("div", { class: "answer" }, h("div", null, h("div", { class: "label", text: test }), h("div", { class: "big", text: `Answer: ${r.answer}` })), badge),
    r.why.length ? h("ul", { class: "why" }, ...r.why.map((w) => math("li", w))) : null,
    !pending && state.agreement === "tiebreak" ? h("p", { class: "meta", text: "The first two solves disagreed, so a third careful solve decided. Worth a second look." }) : null,
    h(
      "details",
      null,
      h("summary", { text: "Question it read" }),
      h(
        "div",
        { class: "read" },
        math("p", r.stem),
        letters.length
          ? h(
              "ol",
              null,
              ...letters.map(([pos, shownLetter]) => {
                const li = math("li", `${shownLetter}) ${r.choices[pos] ?? ""}`);
                if (pos === r.letter) li.classList.add("on");
                return li;
              }),
            )
          : null,
      ),
    ),
  );
}

function lettersOf(r: SolvedView): Array<[string, string]> {
  const positions = ["A", "B", "C", "D", "E"].filter((p) => p !== "E" || (r.choices.E ?? "").trim());
  const fghj: Record<string, string> = { A: "F", B: "G", C: "H", D: "J", E: "K" };
  return positions.map((p) => [p, r.letterStyle === "fghj" ? fghj[p] : p]);
}

function sectionName(r: SolvedView): string {
  return ({ rw: "Reading and Writing", math: "Math", english: "English", reading: "Reading", science: "Science" } as Record<string, string>)[r.section] ?? r.section;
}

function composer(): Node {
  if (state.view !== "home") return h("div");
  const send = () => {
    const text = state.draft.trim();
    if (text) ask(text);
  };
  return h(
    "div",
    { class: "composer" },
    h(
      "div",
      { class: "input" },
      h("input", {
        id: "draft",
        placeholder: state.result ? "Ask about this question" : "Ask an SAT or ACT question",
        value: state.draft,
        maxlength: 1500,
        oninput: (e: Event) => {
          state.draft = (e.target as HTMLInputElement).value;
        },
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === "Enter") send();
        },
      }),
      h("button", { class: "send", title: "Send", text: "↑", disabled: state.chatBusy, onclick: send }),
    ),
  );
}

function focusComposer(text: string) {
  state.draft = text;
  render();
  (document.getElementById("draft") as HTMLInputElement | null)?.focus();
}

async function ask(text: string): Promise<void> {
  if (state.chatBusy) return;
  state.chat.push({ role: "user", text });
  state.draft = "";
  state.chatBusy = true;
  render();
  const r = state.result;
  const question = r ? { exam: r.exam, section: r.section, stem: r.stem, choices: r.choices, answer: r.answer, why: r.why } : null;
  try {
    const { reply } = await api.chat(question, state.chat.slice(-12));
    state.chat.push({ role: "assistant", text: reply });
  } catch (error) {
    state.chat.push({ role: "assistant", text: cleanError(error) });
  } finally {
    state.chatBusy = false;
    render();
  }
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

async function signOut(): Promise<void> {
  await api.signOut();
  await refresh();
}

async function refresh(): Promise<void> {
  state.info = await api.state();
  state.view = !state.info.signedIn ? "signin" : state.info.platform === "darwin" && state.info.screenAccess === "denied" ? "permission" : "home";
  render();
}

api.onEvent((event) => {
  switch (event.type) {
    case "capturing":
      state.phase = "capturing";
      state.first = null;
      state.result = null;
      state.agreement = null;
      state.error = null;
      state.chat = [];
      break;
    case "status":
      state.phase = "solving";
      state.statusText = event.text;
      break;
    case "first":
      state.phase = "solving";
      state.first = event.result;
      break;
    case "done":
      state.phase = "done";
      state.result = event.result;
      state.agreement = event.agreement;
      break;
    case "error":
      state.phase = "error";
      state.error = event.error;
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
