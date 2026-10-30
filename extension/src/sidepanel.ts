import { ApiError, authenticate, DEFAULT_SERVER, loadSettings, normalizeServer, request, saveSettings, streamChat, webLink } from "./api";
import { downscale } from "./image";
import { renderMathHtml } from "../../src/lib/math/render";
import { parseSprEntry } from "../../src/lib/questions/spr";
import {
  LETTERS,
  type ChatMessage,
  type CheckResponse,
  type DrillResponse,
  type ExplainResponse,
  type ExtractResponse,
  type Health,
  type Letter,
  type PendingCapture,
  type Pick,
  type Question,
  type RecentAttempt,
  type RuleCard,
  type Settings,
} from "./types";

interface State {
  view: "loading" | "connect" | "main";
  settings: Settings;
  connectError: string | null;
  connecting: boolean;
  authMode: "signin" | "signup";
  recent: RecentAttempt[] | null;
  health: Health | null;
  shortcut: string | null;
  capturing: boolean;
  captureError: string | null;
  needsAllSites: boolean;
  question: Question | null;
  picked: Pick | null;
  allowSolve: boolean;
  explaining: boolean;
  explainError: string | null;
  /** What the student typed for a grid-in question. */
  sprInput: string;
  explained: { attemptId: string; card: RuleCard; ruleName: string | null; picked: Pick; response: string | null; isCorrect: boolean | null } | null;
  chat: { messages: ChatMessage[]; busy: boolean; error: string | null };
  drill: { data: DrillResponse | null; picked: Letter | "spr" | null; response: string; result: CheckResponse | null; loading: boolean; error: string | null };
}

const state: State = {
  view: "loading",
  settings: { server: DEFAULT_SERVER, token: null },
  connectError: null,
  connecting: false,
  authMode: "signin",
  recent: null,
  health: null,
  shortcut: null,
  capturing: false,
  captureError: null,
  needsAllSites: false,
  question: null,
  picked: null,
  allowSolve: false,
  explaining: false,
  explainError: null,
  sprInput: "",
  explained: null,
  chat: { messages: [], busy: false, error: null },
  drill: emptyDrill(),
};

function emptyDrill(): State["drill"] {
  return { data: null, picked: null, response: "", result: null, loading: false, error: null };
}

const DIAGNOSIS: Record<RuleCard["diagnosis"], { label: string; tone: string }> = {
  misread: { label: "misread the sentence", tone: "warn" },
  rule_gap: { label: "rule gap", tone: "danger" },
  careless: { label: "careless slip", tone: "warn" },
  got_it_right: { label: "you got it", tone: "good" },
  unknown: { label: "no reasoning given", tone: "" },
};

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
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      else if (key === "checked" || key === "disabled" || key === "value") (el as unknown as Record<string, unknown>)[key] = value;
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
  root.replaceChildren(...(state.view === "connect" ? renderConnect() : state.view === "main" ? renderMain() : [h("p", { class: "muted", text: "Loading..." })]));

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
      h("p", { class: "muted small", text: "Capture a Reading and Writing or Math question from the Question Bank and learn the one rule it tested. Your history is saved to your account, on the web app too." }),
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
  } catch {
    state.connectError = "That server address does not look right.";
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
    state.settings = { server, token, email: user.email };
    await saveSettings(state.settings);
    state.view = "main";
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

async function signOut() {
  state.settings = { ...state.settings, token: null };
  await saveSettings(state.settings);
  resetQuestion();
  state.health = null;
  state.recent = null;
  state.view = "connect";
  state.connectError = null;
  render();
}

// ---------- main view ----------

function renderMain(): Node[] {
  const nodes: Node[] = [renderHeader(), renderCapture()];
  if (state.question) nodes.push(renderQuestion(state.question));
  else nodes.push(renderHowTo());
  if (!state.question && state.recent?.length) nodes.push(renderRecent(state.recent));
  if (state.explained) {
    nodes.push(renderRuleCard(state.explained.card, state.explained.picked, state.explained.ruleName));
    nodes.push(renderChat());
  }
  nodes.push(renderFooter());
  return nodes;
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
      title = "No AI key on the server yet (add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel)";
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
          chip(item.result === "right" ? "right" : item.result === "missed" ? "missed" : "reviewed", item.result === "right" ? "good" : item.result === "missed" ? "danger" : ""),
          item.section ? chip(item.section === "math" ? "Math" : "R&W") : null,
          h("span", { class: "small muted", text: item.ruleName ?? item.skill ?? "" }),
        ),
        mathEl("span", item.stem, { class: "recent-stem" }),
      ),
    ),
  );
}

function renderCapture(): Node {
  const hint = state.shortcut ? ["or press ", h("kbd", { text: state.shortcut })] : ["(set a shortcut at chrome://extensions/shortcuts)"];
  const children: Child[] = [
    h("button", { class: "btn primary big", disabled: state.capturing, onclick: () => void capture() }, state.capturing ? spinner() : null, state.capturing ? "Reading the question..." : state.question ? "Capture again" : "Capture this tab"),
    h("p", { class: "muted small" }, "On the Question Bank tab, click the Rulecard toolbar icon once (that is Chrome's permission to read the tab), reveal the answer, then click Capture ", ...hint, "."),
  ];
  if (state.health && !state.health.ai.live && !state.health.ai.stub && state.health.ai.configured.length === 0) {
    children.push(h("div", { class: "banner warn" }, "The server has no AI key yet, so capture will fail until you add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel. ", link(`${state.settings.server}/health`, "Status page")));
  }
  if (state.captureError) children.push(h("div", { class: "banner danger", role: "alert", text: state.captureError }));
  if (state.needsAllSites) {
    children.push(h("button", { class: "btn", onclick: () => void allowAllSites() }, "Allow capturing on all sites (no icon click needed)"));
  }
  return h("div", { class: "card" }, ...children);
}

function renderHowTo(): Node {
  return h(
    "div",
    { class: "card" },
    h("h2", { text: "How it works" }),
    h(
      "ol",
      { class: "steps small" },
      h("li", { text: "Work a Reading and Writing or Math question in the SAT Suite Question Bank and reveal the answer." }),
      h("li", { text: "Press Capture. One picture of that tab is read; nothing is recorded." }),
      h("li", { text: "Tell me what you picked or typed (and why). You get the one rule it tested, why your answer breaks it, and for Math the steps and a Desmos shortcut." }),
      h("li", { text: "Ask follow-ups, or press Test me for a fresh question on the same rule." }),
    ),
  );
}

function renderQuestion(q: Question): Node {
  const showAnswer = Boolean(state.explained);
  const picked = state.explained?.picked ?? null;
  const chips = h(
    "div",
    { class: "row" },
    chip(isMathQuestion(q) ? "Math" : "Reading and Writing"),
    isGridIn(q) ? chip("grid-in", "accent") : null,
    q.qbId ? chip(`ID ${q.qbId}`) : null,
    q.domain ? chip(q.domain, "accent") : null,
    q.skill ? chip(q.skill, "accent") : null,
    q.difficulty ? chip(q.difficulty) : null,
    q.answerSource === "model" ? chip("answer solved by the model", "warn") : null,
  );
  const children: Child[] = [
    chips,
    q.passage ? mathEl("div", q.passage, { class: "passage" }) : null,
    q.figure ? h("div", { class: "figure" }, h("div", { class: "figure-label", text: "Figure (as read)" }), mathEl("div", q.figure)) : null,
    mathEl("p", q.stem, { class: "stem" }),
  ];
  if (!isGridIn(q) && q.choices) {
    const choices = q.choices;
    children.push(
      h(
        "ol",
        { class: "choices" },
        ...LETTERS.map((letter) => {
          const isPick = picked === letter;
          const isCorrect = showAnswer && q.correct === letter;
          const cls = `choice ${isCorrect ? "correct" : isPick ? "picked" : ""}`.trim();
          return h(
            "li",
            { class: cls },
            h("span", { class: "letter", text: `${letter}.` }),
            mathEl("span", choices[letter]),
            isCorrect ? h("span", { class: "tag good", text: "correct" }) : isPick ? h("span", { class: "tag danger", text: "your pick" }) : null,
          );
        }),
      ),
    );
  } else if (showAnswer && state.explained) {
    const ex = state.explained;
    const accepted = q.answers?.length ? q.answers.join(", ") : ex.card.correct_answer;
    children.push(
      h(
        "div",
        { class: "spr-result" },
        ex.response
          ? h("div", { class: `choice ${ex.isCorrect === true ? "correct" : ex.isCorrect === false ? "picked" : ""}`.trim() }, h("span", { class: "letter", text: "You" }), h("span", { text: ex.response }), ex.isCorrect === true ? h("span", { class: "tag good", text: "correct" }) : ex.isCorrect === false ? h("span", { class: "tag danger", text: "not accepted" }) : null)
          : null,
        accepted ? h("div", { class: "choice correct" }, h("span", { class: "letter", text: "Key" }), h("span", { text: `Accepted: ${accepted}` })) : null,
      ),
    );
  }
  if (!state.explained) children.push(renderPickPanel(q));
  return h("div", { class: "card" }, ...children);
}

function sprCheck(): { ok: boolean; error: string | null } {
  if (!state.sprInput.trim()) return { ok: false, error: null };
  const entry = parseSprEntry(state.sprInput);
  return entry.ok ? { ok: true, error: null } : { ok: false, error: entry.error };
}

function renderPickPanel(q: Question): Node {
  const gridIn = isGridIn(q);
  const needsAnswer = gridIn ? !q.answers?.length : !q.correct;
  const rightButton = h("button", {
    class: `pick wide ${state.picked === "correct" ? "on" : ""}`.trim(),
    text: "I got it right, but explain",
    onclick: () => {
      state.picked = "correct";
      render();
    },
  });
  const children: Child[] = [h("h2", { text: gridIn ? "What did you enter?" : "Which did you pick?" })];
  if (needsAnswer) {
    children.push(
      h(
        "div",
        { class: "banner warn" },
        h("p", { text: "The correct answer is not in what I read." }),
        h("p", { class: "muted small", text: "Reveal the answer on the Question Bank tab and capture again, or let me solve it (less reliable)." }),
        h(
          "label",
          { class: "row small", style: "margin-top:6px" },
          h("input", {
            type: "checkbox",
            checked: state.allowSolve,
            onchange: (event: Event) => {
              state.allowSolve = (event.target as HTMLInputElement).checked;
              render();
            },
          }),
          "Let the model work out the answer",
        ),
      ),
    );
  }
  let sprOk = true;
  if (gridIn) {
    const check = sprCheck();
    sprOk = state.picked !== "spr" || check.ok;
    const input = h("input", {
      id: "spr-input",
      class: "input",
      maxlength: 6,
      inputmode: "decimal",
      autocomplete: "off",
      placeholder: "Your answer, e.g. 3/17 or .75",
      value: state.sprInput,
      oninput: (event: Event) => {
        state.sprInput = (event.target as HTMLInputElement).value;
        state.picked = state.sprInput.trim() ? "spr" : state.picked === "spr" ? null : state.picked;
        render();
      },
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === "Enter") void explain();
      },
    });
    children.push(h("div", { class: "picks" }, h("div", { style: "flex:1;min-width:140px" }, input), rightButton));
    if (state.picked === "spr" && check.error) children.push(h("p", { class: "small", style: "color:var(--danger)", role: "alert", text: check.error }));
    else children.push(h("p", { class: "muted small", text: "Enter it the way you would on the test: a fraction or a decimal, up to 5 characters (6 if negative)." }));
  } else {
    children.push(
      h(
        "div",
        { class: "picks" },
        ...LETTERS.map((letter) =>
          h("button", {
            class: `pick ${state.picked === letter ? "on" : ""}`.trim(),
            text: letter,
            onclick: () => {
              state.picked = letter;
              render();
            },
          }),
        ),
        rightButton,
      ),
    );
  }
  const reasoning = h("input", {
    id: "reasoning",
    class: "input",
    placeholder: "What was your thinking? (optional, one line)",
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === "Enter") void explain();
    },
  });
  children.push(reasoning);
  children.push(
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { id: "explain-button", class: "btn primary", disabled: !state.picked || !sprOk || state.explaining || (needsAnswer && !state.allowSolve), onclick: () => void explain() },
        state.explaining ? spinner() : null,
        "Explain",
      ),
      state.explaining ? h("span", { class: "muted small", text: isMathQuestion(q) ? "Working it out..." : "Writing your rule card..." }) : null,
    ),
  );
  if (state.explainError) children.push(h("div", { class: "banner danger", role: "alert", text: state.explainError }));
  return h("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}

function renderRuleCard(card: RuleCard, picked: Pick, ruleName: string | null): Node {
  const diag = DIAGNOSIS[card.diagnosis] ?? DIAGNOSIS.unknown;
  const math = isMathQuestion(state.question);
  const section = (title: string, body: string) => h("section", null, h("h2", { text: title }), mathEl("p", body));
  const answerLabel = card.correct_letter ?? card.correct_answer ?? "the answer";
  const pickedLabel = picked === "spr" ? state.explained?.response ?? "your answer" : picked;
  const rulePath = `/rules${math ? "?section=math" : ""}#${card.rule_id}`;
  const children: Child[] = [
    h(
      "div",
      { class: "row" },
      chip(math && card.diagnosis === "careless" ? "computation slip" : math && card.diagnosis === "misread" ? "misread the question" : diag.label, diag.tone),
      chip(`confidence ${Math.round(card.confidence * 100)}%`),
      card.solved_by_model ? chip("answer worked out by the model, double check it", "warn") : null,
      card.suggested_rule ? chip(`suggested new rule: ${card.suggested_rule}`) : null,
    ),
    h(
      "div",
      { class: "banner accent" },
      h(
        "div",
        { class: "rule-id" },
        "Rule ",
        h("button", { class: "btn link rule-link", text: `${card.rule_id}${ruleName ? ` · ${ruleName}` : ""}`, onclick: () => void openWeb(rulePath) }),
      ),
      mathEl("p", card.rule_statement, { class: "rule-statement" }),
    ),
    section(`Why ${answerLabel} is right`, card.why_correct),
    card.why_pick_fails && picked !== "correct" ? section(`Why ${pickedLabel} fails`, card.why_pick_fails) : null,
    card.steps?.length ? h("section", null, h("h2", { text: "Steps" }), h("ol", { class: "steps" }, ...card.steps.map((step) => mathEl("li", step)))) : null,
    card.shortcut ? h("div", { class: "shortcut" }, h("h2", { text: "Shortcut" }), mathEl("p", card.shortcut)) : null,
    card.eliminations.length && !isGridIn(state.question)
      ? h(
          "section",
          null,
          h("h2", { text: "Kill the rest" }),
          h("ul", { class: "list" }, ...card.eliminations.map((e) => h("li", null, h("span", { class: "letter", text: `${e.letter}.` }), mathEl("span", e.reason)))),
        )
      : null,
    h("div", { class: "banner", style: "background:var(--bg)" }, h("h2", { text: "Takeaway" }), mathEl("p", card.takeaway, { class: "stem" })),
    renderDrill(),
  ];
  return h("div", { class: "card" }, ...children);
}

function renderDrill(): Node {
  const d = state.drill;
  if (!d.data) {
    return h(
      "div",
      { class: "row", style: "border-top:1px solid var(--line);padding-top:10px" },
      h("button", { class: "btn", disabled: d.loading, title: "Writes one new mini-question on the same rule", onclick: () => void startDrill() }, d.loading ? spinner() : null, d.loading ? "Writing a question..." : "Test me"),
      d.error ? h("span", { class: "small", style: "color:var(--danger)", text: d.error }) : null,
    );
  }
  const drill = d.data;
  const gridIn = drill.format === "spr" || !drill.question.choices;
  const children: Child[] = [
    h("h2", { text: `Test me · ${drill.ruleId} ${drill.ruleName}` }),
    drill.question.passage ? mathEl("div", drill.question.passage, { class: "passage" }) : null,
    drill.question.figure ? h("div", { class: "figure" }, h("div", { class: "figure-label", text: "Figure" }), mathEl("div", drill.question.figure)) : null,
    mathEl("p", drill.question.stem, { class: "stem" }),
  ];
  if (gridIn) {
    const entry = d.response.trim() ? parseSprEntry(d.response) : null;
    children.push(
      h(
        "div",
        { class: "picks" },
        h(
          "div",
          { style: "flex:1;min-width:140px" },
          h("input", {
            id: "drill-spr-input",
            class: "input",
            maxlength: 6,
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "Your answer",
            value: d.response,
            disabled: Boolean(d.result) || d.picked === "spr",
            oninput: (event: Event) => {
              d.response = (event.target as HTMLInputElement).value;
              render();
            },
            onkeydown: (event: KeyboardEvent) => {
              if (event.key === "Enter") void checkDrillResponse();
            },
          }),
        ),
        h("button", { id: "drill-check", class: "btn primary", disabled: !entry?.ok || Boolean(d.result) || d.picked === "spr", onclick: () => void checkDrillResponse() }, d.picked === "spr" && !d.result ? spinner() : null, "Check"),
      ),
    );
    if (entry && !entry.ok && !d.result) children.push(h("p", { class: "small", style: "color:var(--danger)", text: entry.error }));
  } else if (drill.question.choices) {
    const choices = drill.question.choices;
    children.push(
      h(
        "ol",
        { class: "choices" },
        ...LETTERS.map((letter) => {
          const isPick = d.picked === letter;
          const isCorrect = d.result?.correctLetter === letter;
          const cls = d.result ? (isCorrect ? "correct" : isPick ? "picked" : "") : isPick ? "selected" : "selectable";
          return h(
            "li",
            { class: `choice ${cls}`.trim(), onclick: () => void answerDrill(letter) },
            h("span", { class: "letter", text: `${letter}.` }),
            mathEl("span", choices[letter]),
          );
        }),
      ),
    );
  }
  if (d.result) {
    const answer = d.result.correctLetter ?? d.result.correctAnswer ?? "";
    children.push(
      h(
        "div",
        { class: `banner ${d.result.correct ? "good" : "danger"}` },
        h("p", { class: "stem", text: d.result.correct ? "Right." : `Not quite. The answer is ${answer}.` }),
        mathEl("p", d.result.correct ? d.result.whyCorrect : d.result.fix ?? d.result.whyCorrect),
        !d.result.correct && d.result.fix ? mathEl("p", d.result.whyCorrect, { class: "muted small" }) : null,
        d.result.solution?.length ? h("ol", { class: "steps small" }, ...d.result.solution.map((step) => mathEl("li", step))) : null,
      ),
      h("button", { class: "btn", disabled: d.loading, onclick: () => void startDrill() }, d.loading ? spinner() : null, "Another one"),
    );
  }
  if (d.error) children.push(h("div", { class: "banner danger", role: "alert", text: d.error }));
  return h("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}

function renderChat(): Node {
  const c = state.chat;
  const input = h("input", {
    id: "chat-input",
    class: "input",
    placeholder: "Ask about this question",
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === "Enter") void sendChat();
    },
  });
  return h(
    "div",
    { class: "card" },
    h("h2", { text: "Ask about this question" }),
    c.messages.length
      ? h(
          "div",
          { class: "chat" },
          ...c.messages.map((m) => h("div", { class: `msg ${m.role === "user" ? "user" : "tutor"}`, id: `msg-${m.id}` }, h("span", { class: "who", text: m.role === "user" ? "you" : "tutor" }), mathEl("span", m.text || (c.busy ? "..." : ""), { class: "body" }))),
        )
      : null,
    c.error ? h("div", { class: "banner danger", role: "alert", text: c.error }) : null,
    h("div", { class: "row" }, h("div", { style: "flex:1;min-width:0" }, input), h("button", { class: "btn", disabled: c.busy, onclick: () => void sendChat() }, c.busy ? spinner() : "Send")),
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
    if (error.code === "no_provider") return "The server has no AI key yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel, then try again.";
    if (error.code === "extraction_failed") return "I could not find a question in that picture. Scroll so the whole question and the choices are visible, then capture again.";
    if (error.code === "needs_answer") return "The answer was not visible. Reveal it on the Question Bank tab and capture again, or tick 'Let the model work out the answer'.";
    if (error.code === "daily_limit") return error.message;
    if (error.code === "invalid_response") return error.message;
    if (error.code === "unverified") return "Could not double-check that question. Try again.";
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
  state.picked = null;
  state.sprInput = "";
  state.allowSolve = false;
  state.explaining = false;
  state.explainError = null;
  state.explained = null;
  state.chat = { messages: [], busy: false, error: null };
  state.drill = emptyDrill();
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

async function activeTab(): Promise<chrome.tabs.Tab> {
  // The side panel belongs to one window: its active tab is the page to capture.
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.windowId === undefined) throw new Error("No active tab found. Click the Question Bank tab, then try again.");
  const url = tab.url ?? "";
  if (/^(chrome|chrome-extension|edge|about|devtools):/.test(url)) throw new Error("Switch to the Question Bank tab first; browser pages cannot be captured.");
  return tab;
}

async function capture() {
  if (state.capturing) return;
  state.capturing = true;
  state.captureError = null;
  state.needsAllSites = false;
  render();
  try {
    const tab = await activeTab();
    let raw: string;
    try {
      raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/permission|activeTab|all_urls/i.test(message)) {
        state.needsAllSites = true;
        throw new Error(
          "Chrome only lets Rulecard read a tab after you click the Rulecard toolbar icon on that tab (or press the shortcut there). Click the icon on the Question Bank tab, then Capture again. Or allow all sites below, once.",
        );
      }
      throw error;
    }
    await processImage(await downscale(raw));
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.captureError = describe(error);
  } finally {
    state.capturing = false;
    render();
  }
}

async function processImage(image: string) {
  const data = await request<ExtractResponse>(state.settings, "/api/extract", { body: { image, source: "capture" } });
  resetQuestion();
  state.question = data.question;
}

async function allowAllSites() {
  try {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    if (granted) {
      state.needsAllSites = false;
      state.captureError = null;
      render();
      await capture();
    }
  } catch (error) {
    state.captureError = describe(error);
    render();
  }
}

async function explain() {
  const q = state.question;
  if (!q || !state.picked || state.explaining) return;
  const reasoning = ((document.getElementById("reasoning") as HTMLInputElement | null)?.value ?? "").trim();
  const picked = state.picked;
  let response: string | null = null;
  if (picked === "spr") {
    const entry = parseSprEntry(state.sprInput);
    if (!entry.ok) {
      state.explainError = entry.error;
      render();
      return;
    }
    response = entry.text;
  }
  state.explaining = true;
  state.explainError = null;
  render();
  try {
    const data = await request<ExplainResponse>(state.settings, "/api/explain", {
      body: { questionId: q.id, picked, ...(response ? { response } : {}), reasoning: reasoning || null, allowModelSolve: state.allowSolve },
    });
    state.question = data.question;
    state.explained = { attemptId: data.attemptId, card: data.card, ruleName: data.rule?.name ?? null, picked, response, isCorrect: data.isCorrect ?? null };
    void refreshRecent();
    state.chat = { messages: [], busy: false, error: null };
    state.drill = emptyDrill();
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.explainError = describe(error);
  } finally {
    state.explaining = false;
    render();
  }
}

async function startDrill() {
  const attemptId = state.explained?.attemptId;
  if (!attemptId || state.drill.loading) return;
  state.drill = { ...emptyDrill(), loading: true };
  render();
  try {
    state.drill.data = await request<DrillResponse>(state.settings, "/api/drill", { body: { attemptId } });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.drill.error = describe(error);
  } finally {
    state.drill.loading = false;
    render();
  }
}

async function answerDrill(letter: Letter) {
  const d = state.drill;
  if (!d.data || d.result || d.picked) return;
  d.picked = letter;
  render();
  try {
    d.result = await request<CheckResponse>(state.settings, "/api/drill/check", { body: { drillId: d.data.drillId, picked: letter } });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    d.error = describe(error);
    d.picked = null;
  }
  render();
}

async function checkDrillResponse() {
  const d = state.drill;
  if (!d.data || d.result || d.picked) return;
  const entry = parseSprEntry(d.response);
  if (!entry.ok) {
    d.error = entry.error;
    render();
    return;
  }
  d.picked = "spr";
  d.error = null;
  render();
  try {
    d.result = await request<CheckResponse>(state.settings, "/api/drill/check", { body: { drillId: d.data.drillId, response: entry.text } });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    d.error = describe(error);
    d.picked = null;
  }
  render();
}

async function sendChat() {
  const attemptId = state.explained?.attemptId;
  const input = document.getElementById("chat-input") as HTMLInputElement | null;
  const text = (input?.value ?? "").trim();
  if (!attemptId || !text || state.chat.busy) return;
  if (input) input.value = "";
  const c = state.chat;
  c.busy = true;
  c.error = null;
  const user: ChatMessage = { id: `u-${Date.now()}`, role: "user", text };
  const reply: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", text: "" };
  c.messages.push(user, reply);
  render();
  try {
    const history = c.messages.slice(0, -1);
    await streamChat(state.settings, attemptId, history, (delta) => {
      reply.text += delta;
      const body = document.querySelector(`#msg-${reply.id} .body`);
      if (body) body.innerHTML = renderMathHtml(reply.text);
      else render();
    });
    if (!reply.text) reply.text = "(no reply)";
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    c.error = describe(error);
    c.messages = c.messages.filter((m) => m.id !== reply.id);
  } finally {
    c.busy = false;
    render();
  }
}

// ---------- captures triggered by the keyboard shortcut (service worker) ----------

async function consumePendingCapture() {
  const stored = (await chrome.storage.session.get("pendingCapture")) as { pendingCapture?: PendingCapture };
  const pending = stored.pendingCapture;
  if (!pending) return;
  await chrome.storage.session.remove("pendingCapture");
  if (Date.now() - pending.at > 120_000) return;
  if (state.view !== "main") return;
  state.capturing = true;
  state.captureError = null;
  render();
  try {
    if (pending.error) throw new Error(pending.error);
    if (pending.image) await processImage(pending.image);
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.captureError = describe(error);
  } finally {
    state.capturing = false;
    render();
  }
}

/**
 * A question handed to the panel from elsewhere (for example the extension's own check script, or a
 * future "send to panel" button): load it as the current question and clear the key.
 */
async function consumePendingQuestion() {
  const stored = (await chrome.storage.session.get("pendingQuestion")) as { pendingQuestion?: Question };
  const pending = stored.pendingQuestion;
  if (!pending) return;
  await chrome.storage.session.remove("pendingQuestion");
  if (state.view !== "main" || !pending.id || !pending.stem) return;
  resetQuestion();
  state.question = pending;
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingCapture?.newValue) void consumePendingCapture();
  if (area === "session" && changes.pendingQuestion?.newValue) void consumePendingQuestion();
});

// ---------- boot ----------

async function boot() {
  state.settings = await loadSettings();
  try {
    const commands = await chrome.commands.getAll();
    state.shortcut = commands.find((c) => c.name === "capture")?.shortcut || null;
  } catch {
    state.shortcut = null;
  }
  if (!state.settings.token) {
    state.view = "connect";
    render();
    return;
  }
  state.view = "main";
  render();
  void refreshRecent();
  await refreshHealth();
  await consumePendingCapture();
  await consumePendingQuestion();
}

void boot();
