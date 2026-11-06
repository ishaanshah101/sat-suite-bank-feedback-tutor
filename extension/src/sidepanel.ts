import { ApiError, authenticate, DEFAULT_SERVER, loadSettings, normalizeServer, request, saveSettings, webLink } from "./api";
import { activeTabIn, captureTab, CaptureBlocked, HELP, openExtensionSettings, requestAllSites, type CaptureFix } from "./capture";
import { isPracticeUrl, readPracticeTab } from "./practice";
import { downscale } from "./image";
import { renderMathHtml } from "../../src/lib/math/render";
import { parseSprEntry } from "../../src/lib/questions/spr";
import { LETTERS, type ExplainResponse, type ExtractResponse, type Health, type Letter, type PickResponse, type Question, type RecentAttempt, type RuleCard, type Settings } from "./types";
import { createAddons } from "./addons";
import { normalizeQuestion } from "./addons/types";

/** What the student said they picked on the card, once they have. */
interface PickResult {
  picked: Letter | "spr" | "correct";
  response: string | null;
  isCorrect: boolean | null;
}

/** The card for the captured question: the answer and 2 to 3 bullets, then (optionally) why their pick fails. */
interface CardResult {
  attemptId: string;
  card: RuleCard;
  ruleName: string | null;
  pick: PickResult | null;
}

interface State {
  view: "loading" | "connect" | "main";
  settings: Settings;
  connectError: string | null;
  connecting: boolean;
  authMode: "signin" | "signup";
  recent: RecentAttempt[] | null;
  health: Health | null;
  /** Which step of a capture is running: reading the question, then writing the bullets. */
  capturing: null | "reading" | "explaining";
  captureError: string | null;
  /** A one-click way past the capture error, when there is one. */
  captureFix: CaptureFix | null;
  question: Question | null;
  result: CardResult | null;
  /** Saving "which did you pick". */
  picking: boolean;
  pickError: string | null;
  /** What the student typed for a grid-in question. */
  sprInput: string;
  /** Whether "Question it read" is open (kept across re-renders). */
  questionOpen: boolean;
}

const state: State = {
  view: "loading",
  settings: { server: DEFAULT_SERVER, token: null },
  connectError: null,
  connecting: false,
  authMode: "signin",
  recent: null,
  health: null,
  capturing: null,
  captureError: null,
  captureFix: null,
  question: null,
  result: null,
  picking: false,
  pickError: null,
  sprInput: "",
  questionOpen: false,
};

/** The browser window this panel belongs to (the toolbar icon sends its clicks per window). */
let panelWindowId: number | null = null;
const bootedAt = Date.now();

// ---------- tiny DOM helpers ----------

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "text") el.textContent = String(value);
      else if (key.startsWith("on")) {
        // Only real listeners: a string here would become an inline handler attribute.
        if (typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "checked" || key === "disabled" || key === "value") (el as unknown as Record<string, unknown>)[key] = value;
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

const chip = (text: string, tone = "") => h("span", { class: `chip ${tone}`.trim(), text });

/** An element whose text may hold LaTeX math in \( \): plain parts are escaped, math becomes MathML. */
function mathEl<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, props: Record<string, unknown> | null = null): HTMLElementTagNameMap[K] {
  const el = h(tag, props);
  el.innerHTML = renderMathHtml(text);
  return el;
}

const isMathQuestion = (q: Question | null | undefined) => q?.section === "math";
const isGridIn = (q: Question | null | undefined) => q?.format === "spr";
const spinner = () => h("span", { class: "spinner", "aria-label": "working" });

function link(href: string, text: string, cls = ""): HTMLAnchorElement {
  return h("a", { href, target: "_blank", rel: "noreferrer", class: cls, text });
}

const app = () => document.getElementById("app") as HTMLDivElement;

/** Re-render everything, keeping the value and focus of whichever input the user is typing in. */
function render() {
  const active = document.activeElement as HTMLInputElement | null;
  const keep = active && active.id && "value" in active ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  const inputs: Record<string, string> = {};
  for (const el of app().querySelectorAll<HTMLInputElement>("input[id], textarea[id]")) inputs[el.id] = el.value;

  const root = app();
  root.replaceChildren(...(state.view === "connect" ? renderConnect() : state.view === "main" ? renderMainSafe() : [h("p", { class: "muted", text: "Loading..." })]));

  for (const [id, value] of Object.entries(inputs)) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el && el.type !== "checkbox" && !el.value) el.value = value;
  }
  if (keep) {
    const el = document.getElementById(keep.id) as HTMLInputElement | null;
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (keep.start !== null && keep.end !== null) el.setSelectionRange(keep.start, keep.end);
      } catch {
        // not a text input
      }
    }
  }
}

// ---------- connect view ----------

function renderConnect(): Node[] {
  const signup = state.authMode === "signup";
  const submitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") void connect();
  };
  const email = h("input", { id: "email", class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email", value: state.settings.email ?? "", onkeydown: submitOnEnter });
  const password = h("input", {
    id: "password",
    class: "input",
    type: "password",
    placeholder: signup ? "At least 8 characters" : "Password",
    autocomplete: signup ? "new-password" : "current-password",
    onkeydown: submitOnEnter,
  });
  const server = h("input", { id: "server", class: "input", type: "url", placeholder: DEFAULT_SERVER, value: state.settings.server === DEFAULT_SERVER ? "" : state.settings.server, autocomplete: "url" });
  const tab = (mode: "signin" | "signup", label: string) =>
    h("button", {
      class: `tab${state.authMode === mode ? " active" : ""}`,
      role: "tab",
      "aria-selected": String(state.authMode === mode),
      text: label,
      onclick: () => {
        state.authMode = mode;
        state.connectError = null;
        render();
      },
    });
  return [
    h(
      "div",
      { class: "card" },
      h("h1", { text: "Rulecard" }),
      h("p", { class: "muted small", text: "Capture a Reading and Writing or Math question from a Question Bank PDF or a practice test and get the answer plus the 2 or 3 rules behind it. Your history is saved to your account, on the web app too." }),
      h("div", { class: "tabs", role: "tablist" }, tab("signin", "Sign in"), tab("signup", "Create account")),
      h("label", { class: "field" }, "Email", email),
      h("label", { class: "field" }, "Password", password),
      state.connectError ? h("div", { class: "banner danger", role: "alert", text: state.connectError }) : null,
      h(
        "button",
        { class: "btn primary big", disabled: state.connecting, onclick: () => void connect() },
        state.connecting ? spinner() : null,
        signup ? "Create account" : "Sign in",
      ),
      h("details", { class: "small muted" }, h("summary", { text: "Use a different server" }), h("label", { class: "field" }, "Server address (leave empty for the default)", server)),
      h("p", { class: "muted small" }, link(`${DEFAULT_SERVER}/privacy`, "Privacy")),
    ),
  ];
}

async function connect() {
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
  const email = value("email").trim();
  const password = value("password");
  let server: string;
  try {
    server = normalizeServer(value("server"));
  } catch (error) {
    state.connectError = describe(error);
    render();
    return;
  }
  if (!email || !password) {
    state.connectError = "Enter your email and password.";
    render();
    return;
  }
  state.connecting = true;
  state.connectError = null;
  render();
  try {
    // Ask for access to a custom server first; the request has to start inside the click.
    if (server !== DEFAULT_SERVER) {
      const origin = `${server}/*`;
      const has = await chrome.permissions.contains({ origins: [origin] });
      if (!has) {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) throw new Error(`Rulecard needs permission to talk to ${server}.`);
      }
    }
    const { token, user } = await authenticate(server, state.authMode, email, password);
    const previous = state.settings.server;
    state.settings = { server, token, email: user.email, userId: user.id };
    await saveSettings(state.settings);
    if (previous !== server) await dropServerPermission(previous);
    // Another student's local study data must not show up under this account.
    await addons.accountChanged();
    state.view = "main";
    render();
    void consumePendingQuestion();
    void refreshRecent();
    await refreshHealth();
  } catch (error) {
    state.connectError = describe(error);
  } finally {
    state.connecting = false;
    render();
  }
}

/** Open a page of the web app in a new tab, signed in as this account. */
async function openWeb(path: string) {
  try {
    await chrome.tabs.create({ url: await webLink(state.settings, path) });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    await chrome.tabs.create({ url: state.settings.server + path });
  }
}

async function refreshRecent() {
  try {
    const data = await request<{ attempts: RecentAttempt[] }>(state.settings, "/api/attempts?limit=5");
    state.recent = data.attempts;
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.recent = null;
  }
  render();
}

/** Give back the host permission a custom server was granted (nothing to do for the default). Failures are ignored. */
async function dropServerPermission(server: string) {
  if (!server || server === DEFAULT_SERVER) return;
  try {
    await chrome.permissions.remove({ origins: [`${server}/*`] });
  } catch {
    // never granted, or Chrome refused: nothing to give back
  }
}

async function signOut() {
  // Revoke the token on the server first, so a copy of it elsewhere stops working too.
  if (state.settings.token) await request(state.settings, "/api/logout", { body: {} }).catch(() => undefined);
  state.settings = { ...state.settings, token: null };
  await saveSettings(state.settings);
  await dropServerPermission(state.settings.server);
  // Anything waiting in session storage belongs to the account that was signed in.
  await chrome.storage.session.remove(["pendingQuestion"]).catch(() => undefined);
  state.captureError = null;
  state.captureFix = null;
  resetQuestion();
  state.health = null;
  state.recent = null;
  state.view = "connect";
  state.connectError = null;
  render();
}

// ---------- main view ----------

/** renderMain, but a bug in one card can't blank the whole panel: Settings (and "Erase local data") stays reachable. */
function renderMainSafe(): Node[] {
  try {
    return renderMain();
  } catch (error) {
    console.error("Rulecard: couldn't draw the panel", error);
    let top: Node;
    try {
      top = h("div", { class: "rc-top" }, renderHeader(), addons.renderTabBar());
    } catch {
      top = h("div", { class: "rc-top" }, h("h1", { text: "Rulecard" }));
    }
    return [
      top,
      h(
        "div",
        { class: "card" },
        h("h2", { text: "Something went wrong drawing this screen" }),
        h("p", { class: "muted small", text: describe(error) }),
        h("button", { class: "btn", text: "Open Settings", onclick: () => { addons.showTab("settings"); render(); } }),
      ),
    ];
  }
}

function renderMain(): Node[] {
  const tab = addons.tab();
  const nodes: (Node | null)[] = [h("div", { class: "rc-top" }, renderHeader(), addons.renderTabBar())];
  if (tab === "home") {
    // Home is only this: one button, then the answer and its 2 to 3 bullets, then "Which did you pick?".
    nodes.push(...addons.renderAboveCapture(), renderCaptureCard());
    if (state.result && state.question) nodes.push(renderResult(state.result, state.question));
  } else {
    if (tab === "progress" && state.recent?.length) nodes.push(renderRecent(state.recent));
    if (tab === "settings") nodes.push(renderHowTo());
    nodes.push(...addons.renderTab(tab));
  }
  nodes.push(...addons.renderOverlays());
  nodes.push(renderFooter());
  return nodes.filter((n): n is Node => Boolean(n));
}

function renderHeader(): Node {
  const health = state.health;
  let dot = "";
  let title = "Checking the server...";
  if (health) {
    if (!health.db.ok) {
      dot = "danger";
      title = "Database unreachable";
    } else if (health.ai.live || health.ai.stub || health.ai.configured.length) {
      dot = "good";
      title = `AI: ${health.ai.live ?? health.ai.configured[0] ?? "stub"} · database ok`;
    } else {
      dot = "warn";
      title = "No AI provider on the server right now";
    }
  }
  return h(
    "div",
    { class: "row between" },
    h("div", { class: "row" }, h("h1", { text: "Rulecard" }), h("span", { class: `dot ${dot}`.trim(), title })),
    h(
      "div",
      { class: "row small" },
      webButton("/history", "History"),
      webButton("/rules", "Rules"),
      h("button", { class: "btn link small", title: state.settings.email ?? "", onclick: () => void signOut(), text: "Sign out" }),
    ),
  );
}

function webButton(path: string, text: string): HTMLButtonElement {
  return h("button", { class: "btn link small", text, onclick: () => void openWeb(path) });
}

function renderRecent(items: RecentAttempt[]): Node {
  return h(
    "div",
    { class: "card" },
    h("div", { class: "row between" }, h("h2", { text: "Recent" }), webButton("/history", "All history")),
    ...items.map((item) =>
      h(
        "button",
        { class: "recent", onclick: () => void openWeb(`/history/${item.id}`) },
        h(
          "span",
          { class: "row" },
          chip(item.result === "right" ? "right" : item.result === "missed" ? "missed" : "reviewed", item.result === "right" ? "good" : item.result === "missed" ? "miss" : ""),
          item.section ? chip(item.section === "math" ? "Math" : "R&W") : null,
          h("span", { class: "small muted", text: item.ruleName ?? item.skill ?? "" }),
        ),
        mathEl("span", item.stem, { class: "recent-stem" }),
      ),
    ),
  );
}

/** The one button. Everything on Home starts here. */
function renderCaptureCard(): Node {
  const busy = state.capturing !== null;
  const label =
    state.capturing === "reading"
      ? "Reading the question..."
      : state.capturing === "explaining"
        ? "Writing your explanation..."
        : state.result
          ? "Capture another question"
          : "Capture this tab";
  const children: Child[] = [
    h("button", { id: "capture-tab", class: "btn primary big", disabled: busy, onclick: () => void captureThisTab() }, busy ? spinner() : null, label),
  ];
  if (!state.result && !busy) {
    children.push(
      h("p", {
        class: "muted small",
        text: "Open a Question Bank PDF, or a practice-test question you're reviewing, so the whole question is on screen. Press Capture: you get the answer and the 2 or 3 rules that explain it.",
      }),
      h("p", { class: "muted small", text: "Tip: clicking the Rulecard icon in Chrome's toolbar captures too." }),
    );
  }
  if (state.health && !state.health.ai.live && !state.health.ai.stub && state.health.ai.configured.length === 0) {
    children.push(h("div", { class: "banner warn" }, "The server has no AI provider right now, so captures will fail. ", link(`${state.settings.server}/health`, "Status page")));
  }
  if (state.captureError) children.push(renderCaptureError(state.captureError, state.captureFix));
  return h("div", { class: "card", id: "capture-card" }, ...children);
}

function renderCaptureError(message: string, fix: CaptureFix | null): Node {
  const action =
    fix === "allSites"
      ? h("button", { id: "allow-capture", class: "btn primary", text: "Allow", onclick: () => void allowAllSites() })
      : fix === "fileAccess"
        ? h("button", { id: "open-ext-settings", class: "btn", text: "Open Rulecard's settings", onclick: () => void openExtensionSettings() })
        : null;
  return h("div", { class: "banner danger", role: "alert", "data-testid": "capture-error" }, h("p", { text: message }), action ? h("div", { class: "row", style: "margin-top:8px" }, action) : null);
}

function renderHowTo(): Node {
  return h(
    "div",
    { class: "card" },
    h("h2", { text: "How it works" }),
    h(
      "ol",
      { class: "steps small" },
      h("li", { text: "Open the question: a SAT Suite Question Bank PDF, or a practice-test question in My Practice that you got wrong. Make sure the whole question and its choices are on screen." }),
      h("li", { text: "Press Capture this tab (or click the Rulecard icon in Chrome's toolbar). Rulecard takes one screenshot of that tab, only when you ask." }),
      h("li", { text: "You get the answer and 2 or 3 bullets with the rules behind it, in plain words." }),
      h("li", { text: "Tap the letter you picked to see why it's wrong. Your plan, progress and review are in the other tabs." }),
    ),
  );
}

/** The card: the answer, 2 to 3 bullets, then "Which did you pick?". */
function renderResult(r: CardResult, q: Question): Node {
  const card = r.card;
  const math = isMathQuestion(q);
  const answer = card.correct_letter ?? card.correct_answer ?? "?";
  const bullets = card.key_rules?.length ? card.key_rules : [card.rule_statement];
  const rulePath = `/rules${math ? "?section=math" : ""}#${card.rule_id}`;
  return h(
    "div",
    { class: "card", id: "result-card" },
    h(
      "div",
      { class: "row between" },
      h("strong", { class: "answer-line", "data-testid": "card-answer", text: `Answer: ${answer}` }),
      card.solved_by_model ? chip("worked out by Rulecard, check it", "warn") : null,
    ),
    h("ul", { class: "key-rules", "data-testid": "key-rules" }, ...bullets.map((rule) => mathEl("li", rule))),
    h(
      "div",
      { class: "rule-id small muted" },
      "Rule ",
      h("button", { class: "btn link rule-link", text: `${card.rule_id}${r.ruleName ? ` · ${r.ruleName}` : ""}`, onclick: () => void openWeb(rulePath) }),
    ),
    renderPickSection(r, q),
    renderQuestionRead(q),
  );
}

function renderPickSection(r: CardResult, q: Question): Node {
  const gridIn = isGridIn(q);
  const card = r.card;
  const answer = card.correct_letter ?? card.correct_answer ?? "?";
  const children: Child[] = [h("h2", { text: gridIn ? "What did you enter?" : "Which did you pick?" })];
  if (gridIn) {
    const entry = state.sprInput.trim() ? parseSprEntry(state.sprInput) : null;
    children.push(
      h(
        "div",
        { class: "picks" },
        h(
          "div",
          { style: "flex:1;min-width:140px" },
          h("input", {
            id: "spr-input",
            class: "input",
            maxlength: 6,
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "Your answer, e.g. 3/17 or .75",
            value: state.sprInput,
            oninput: (event: Event) => {
              state.sprInput = (event.target as HTMLInputElement).value;
              render();
            },
            onkeydown: (event: KeyboardEvent) => {
              if (event.key === "Enter") void choosePick("spr");
            },
          }),
        ),
        h("button", { id: "spr-check", class: "btn", disabled: !entry?.ok || state.picking, onclick: () => void choosePick("spr") }, state.picking ? spinner() : null, "Check"),
      ),
    );
    if (entry && !entry.ok) children.push(h("p", { class: "small", style: "color:var(--danger)", role: "alert", text: entry.error }));
  } else {
    children.push(
      h(
        "div",
        { class: "picks", role: "group", "aria-label": "The letter you picked" },
        ...LETTERS.map((letter) =>
          h("button", {
            class: `pick ${r.pick?.picked === letter ? "on" : ""}`.trim(),
            text: letter,
            disabled: state.picking,
            "aria-pressed": String(r.pick?.picked === letter),
            onclick: () => void choosePick(letter),
          }),
        ),
      ),
    );
  }
  if (state.pickError) children.push(h("div", { class: "banner danger", role: "alert", text: state.pickError }));
  const p = r.pick;
  if (p && !state.picking) {
    const yours = p.picked === "spr" ? p.response ?? "your answer" : p.picked;
    if (p.isCorrect === true) {
      children.push(h("div", { class: "banner good", "data-testid": "pick-why" }, h("p", { class: "stem", text: `${yours} is right. Nice.` }), h("p", { class: "small muted", text: "The bullets above are why, so you get it right every time." })));
    } else {
      const why = card.why_pick_fails?.trim();
      children.push(
        h(
          "div",
          { class: "banner miss", "data-testid": "pick-why" },
          h("h2", { text: `Why ${yours} is wrong` }),
          why ? mathEl("p", why) : null,
          mathEl("p", `The right answer is ${answer}. ${card.why_correct ?? ""}`.trim(), { class: why ? "small" : "" }),
          gridIn && card.steps?.length ? h("ol", { class: "steps small" }, ...card.steps.map((step) => mathEl("li", step))) : null,
        ),
      );
    }
  }
  return h("div", { class: "pick-section", style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}

/** What Rulecard read from the screen, folded away: open it to check the capture got the right question. */
function renderQuestionRead(q: Question): Node {
  const choices = !isGridIn(q) && q.choices ? q.choices : null;
  return h(
    "details",
    {
      class: "more small",
      open: state.questionOpen,
      ontoggle: (event: Event) => {
        state.questionOpen = (event.target as HTMLDetailsElement).open;
      },
    },
    h("summary", { text: "Question it read" }),
    h(
      "div",
      { class: "row" },
      chip(isMathQuestion(q) ? "Math" : "Reading and Writing"),
      q.qbId ? chip(`ID ${q.qbId}`) : null,
      q.skill ? chip(q.skill, "accent") : null,
      q.difficulty ? chip(q.difficulty) : null,
    ),
    q.passage ? mathEl("div", q.passage, { class: "passage" }) : null,
    q.figure ? h("div", { class: "figure" }, h("div", { class: "figure-label", text: "Figure (as read)" }), mathEl("div", q.figure)) : null,
    mathEl("p", q.stem, { class: "stem" }),
    choices ? h("ol", { class: "choices" }, ...LETTERS.map((letter) => h("li", { class: "choice" }, h("span", { class: "letter", text: `${letter}.` }), mathEl("span", choices[letter])))) : null,
  );
}

function renderFooter(): Node {
  return h(
    "div",
    { class: "footer muted" },
    webButton("/", "Open the web app"),
    h("span", { class: "small", text: [state.settings.email, state.health ? `v${state.health.version}` : ""].filter(Boolean).join(" · ") }),
  );
}

// ---------- actions ----------

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "no_provider") return "The server has no AI provider right now. Try again later.";
    if (error.code === "extraction_failed") return "I couldn't find a whole question on this tab. Scroll so the question and all of its answer choices are on screen, then press Capture again.";
    if (error.code === "daily_limit") return error.message;
    if (error.code === "invalid_response") return error.message;
    if (error.status === 429) return error.message;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

async function handleAuthFailure(error: unknown): Promise<boolean> {
  if (error instanceof ApiError && error.status === 401) {
    state.settings = { ...state.settings, token: null };
    await saveSettings(state.settings);
    resetQuestion();
    state.view = "connect";
    state.connectError = "Your session expired. Sign in again.";
    render();
    return true;
  }
  return false;
}

function resetQuestion() {
  state.question = null;
  state.result = null;
  state.picking = false;
  state.pickError = null;
  state.sprInput = "";
  state.questionOpen = false;
}

async function refreshHealth() {
  try {
    state.health = await request<Health>(state.settings, "/api/health");
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.health = null;
  }
  render();
}

/** One capture at a time: a second press (or a toolbar click) waits for the first. */
let inflight: Promise<void> | null = null;

function serialCapture(run: () => Promise<void>): Promise<void> {
  const next = (inflight ?? Promise.resolve()).then(run, run).finally(() => {
    if (inflight === next) inflight = null;
  });
  inflight = next;
  return next;
}

type Source = { image: string; source: "capture" | "image" } | { text: string; source: "paste" };

/**
 * What to send for the tab on screen. My Practice pages are read as text (the whole question, even the
 * part scrolled out of view; math comes back as LaTeX), with a screenshot instead when there is a graph.
 * Everything else, Question Bank PDFs included, is a screenshot.
 */
async function sourceFor(tab: chrome.tabs.Tab): Promise<Source> {
  if (tab.id !== undefined && isPracticeUrl(tab.url)) {
    const read = await readPracticeTab(tab.id);
    if (read && read.text.length >= 40 && !read.hasFigure) return { text: read.text, source: "paste" };
  }
  return { image: await downscale(await captureTab(tab)), source: "capture" };
}

/** The button: screenshot this tab, read the question, and explain it. */
function captureThisTab(): Promise<void> {
  if (state.capturing) return inflight ?? Promise.resolve();
  addons.showTab("home");
  state.capturing = "reading";
  state.captureError = null;
  state.captureFix = null;
  render();
  return serialCapture(async () => {
    try {
      const tab = await activeTabIn(panelWindowId);
      if (!tab) throw new CaptureBlocked(HELP.noTab, null);
      await explainSource(await sourceFor(tab));
    } catch (error) {
      if (await handleAuthFailure(error)) return;
      state.captureError = describe(error);
      state.captureFix = error instanceof CaptureBlocked ? error.fix : null;
    } finally {
      state.capturing = null;
      render();
    }
  });
}

/** Read the question, then write its card (no pick needed). A known pick is recorded straight after. */
async function explainSource(body: Source, picked: Letter | null = null): Promise<void> {
  state.capturing = "reading";
  render();
  const data = await request<ExtractResponse>(state.settings, "/api/extract", { body });
  await explainQuestion(data.question, picked);
}

async function explainQuestion(question: Question, picked: Letter | null = null): Promise<void> {
  resetQuestion();
  state.question = question;
  state.capturing = "explaining";
  render();
  void addons.afterExtract(normalizeQuestion(question));
  const data = await request<ExplainResponse>(state.settings, "/api/explain", {
    body: { questionId: question.id, picked: "none", allowModelSolve: true },
  });
  state.question = data.question;
  state.result = { attemptId: data.attemptId, card: data.card, ruleName: data.rule?.name ?? null, pick: null };
  void refreshRecent();
  if (picked && data.question.format !== "spr") {
    state.capturing = null;
    await choosePick(picked);
  }
}

/** "Which did you pick?": no model call, the card already knows why each wrong choice is wrong. */
async function choosePick(picked: Letter | "spr"): Promise<void> {
  const r = state.result;
  const q = state.question;
  if (!r || !q || state.picking) return;
  let response: string | null = null;
  if (picked === "spr") {
    const entry = parseSprEntry(state.sprInput);
    if (!entry.ok) {
      state.pickError = entry.error;
      render();
      return;
    }
    response = entry.text;
  } else if (r.pick?.picked === picked) {
    return;
  }
  state.picking = true;
  state.pickError = null;
  render();
  try {
    const data = await request<PickResponse>(state.settings, "/api/explain/pick", { body: { attemptId: r.attemptId, picked, ...(response ? { response } : {}) } });
    r.card = data.card;
    r.pick = { picked: data.picked, response: data.response, isCorrect: data.isCorrect };
    // The local study log (Plan, Progress, Practice) records the question once the student says what they picked.
    void addons.afterExplain({ attemptId: r.attemptId, card: data.card, question: q, rule: { id: data.card.rule_id, name: r.ruleName }, isCorrect: data.isCorrect }, data.picked, data.response);
    void refreshRecent();
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.pickError = describe(error);
  } finally {
    state.picking = false;
    render();
  }
}

async function allowAllSites() {
  // permissions.request has to start inside the click, so it goes first.
  const granted = await requestAllSites();
  if (!granted) {
    state.captureError = "Not allowed. You can still click the Rulecard icon in Chrome's toolbar while you're on the question: that captures it.";
    state.captureFix = null;
    render();
    return;
  }
  await captureThisTab();
}

// ---------- questions handed to the panel ----------

/**
 * A question handed to the panel from elsewhere (the extension's own check script, for example):
 * explain it like a capture and clear the key.
 */
async function consumePendingQuestion() {
  const stored = (await chrome.storage.session.get("pendingQuestion")) as { pendingQuestion?: Question };
  const pending = stored.pendingQuestion;
  if (!pending) return;
  await chrome.storage.session.remove("pendingQuestion");
  if (state.view !== "main" || !pending.id || !pending.stem) return;
  addons.showTab("home");
  state.captureError = null;
  state.captureFix = null;
  await serialCapture(async () => {
    try {
      await explainQuestion(pending);
    } catch (error) {
      if (await handleAuthFailure(error)) return;
      state.captureError = describe(error);
    } finally {
      state.capturing = null;
      render();
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingQuestion?.newValue) void consumePendingQuestion();
});

// The toolbar icon, clicked while this panel is already open in its window, means "capture this tab".
// (Clicking it also gives Rulecard permission for that tab, so it works where the button can't.)
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  const m = message as { type?: string; windowId?: number };
  if (m?.type !== "rc-toolbar-click" || m.windowId !== panelWindowId) return;
  // A panel the click itself just opened only shows the button.
  if (Date.now() - bootedAt < 1500 || state.view !== "main") return;
  void captureThisTab();
});

// ---------- boot ----------

/** Resolves once boot() has read the saved settings, so the add-ons know whose data they are loading. */
let settingsLoaded!: () => void;
const settingsReady = new Promise<void>((resolve) => {
  settingsLoaded = resolve;
});

async function boot() {
  try {
    await bootInner();
  } catch (error) {
    console.error("Rulecard: could not start", error);
    app().replaceChildren(
      h(
        "div",
        { class: "card" },
        h("h2", { text: "Rulecard could not start" }),
        h("p", { class: "muted small", text: describe(error) }),
        h("button", { class: "btn primary", text: "Retry", onclick: () => void boot() }),
      ),
    );
  }
}

async function bootInner() {
  panelWindowId = (await chrome.windows.getCurrent().catch(() => null))?.id ?? null;
  try {
    state.settings = await loadSettings();
  } finally {
    settingsLoaded();
  }
  if (!state.settings.token) {
    state.view = "connect";
    render();
    return;
  }
  await addons.accountChanged();
  state.view = "main";
  render();
  void consumePendingQuestion();
  void refreshRecent();
  await refreshHealth();
}

const addons = createAddons(
  {
    get settings() {
      return state.settings;
    },
    request,
    rerender: () => render(),
    openWeb: (path: string) => openWeb(path),
    describe,
  },
  {
    getQuestion: () => (state.question ? normalizeQuestion(state.question) : null),
    getExplained: () => {
      const r = state.result;
      if (!r?.pick) return null;
      return { attemptId: r.attemptId, picked: r.pick.picked === "spr" ? "correct" : r.pick.picked };
    },
    // A miss from the Question Bank export quiz: its picture, with the letter the student picked.
    processImage: (image, picked) =>
      serialCapture(async () => {
        addons.showTab("home");
        try {
          await explainSource({ image, source: "image" }, picked ?? null);
        } finally {
          state.capturing = null;
          render();
        }
      }),
    settingsReady,
    capture: () => void captureThisTab(),
    pick: (letter) => {
      if (!state.result || !state.question || letter === "correct") return;
      if (isGridIn(state.question)) return;
      void choosePick(letter);
    },
  },
);

void boot();
