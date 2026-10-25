import { ApiError, DEFAULT_SERVER, fetchToken, loadSettings, normalizeServer, request, saveSettings, streamChat } from "./api";
import { downscale } from "./image";
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
  type RuleCard,
  type Settings,
} from "./types";

interface State {
  view: "loading" | "connect" | "main";
  settings: Settings;
  connectError: string | null;
  connecting: boolean;
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
  explained: { attemptId: string; card: RuleCard; ruleName: string | null; picked: Pick } | null;
  chat: { messages: ChatMessage[]; busy: boolean; error: string | null };
  drill: { data: DrillResponse | null; picked: Letter | null; result: CheckResponse | null; loading: boolean; error: string | null };
}

const state: State = {
  view: "loading",
  settings: { server: DEFAULT_SERVER, token: null },
  connectError: null,
  connecting: false,
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
  explained: null,
  chat: { messages: [], busy: false, error: null },
  drill: { data: null, picked: null, result: null, loading: false, error: null },
};

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
  const server = h("input", { id: "server", class: "input", type: "url", placeholder: DEFAULT_SERVER, value: state.settings.server, autocomplete: "url" });
  const passcode = h("input", {
    id: "passcode",
    class: "input",
    type: "password",
    placeholder: "Passcode",
    autocomplete: "current-password",
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === "Enter") void connect();
    },
  });
  return [
    h(
      "div",
      { class: "card" },
      h("h1", { text: "Rulecard" }),
      h("p", { class: "muted small", text: "Capture a Question Bank tab and get the one rule the question tested. Connect to your Rulecard server with the same passcode as the web app." }),
      h("label", { class: "field" }, "Server", server),
      h("label", { class: "field" }, "Passcode", passcode),
      state.connectError ? h("div", { class: "banner danger", role: "alert", text: state.connectError }) : null,
      h("button", { class: "btn primary big", disabled: state.connecting, onclick: () => void connect() }, state.connecting ? spinner() : null, "Connect"),
    ),
  ];
}

async function connect() {
  const serverInput = (document.getElementById("server") as HTMLInputElement | null)?.value ?? "";
  const passcode = (document.getElementById("passcode") as HTMLInputElement | null)?.value ?? "";
  let server: string;
  try {
    server = normalizeServer(serverInput);
  } catch {
    state.connectError = "That server address does not look right.";
    render();
    return;
  }
  if (!passcode.trim()) {
    state.connectError = "Enter the passcode.";
    render();
    return;
  }
  state.connecting = true;
  state.connectError = null;
  render();
  try {
    // Ask for access to a custom server first; the request has to start inside the click.
    const origin = `${server}/*`;
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (!has) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) throw new Error(`Rulecard needs permission to talk to ${server}.`);
    }
    const token = await fetchToken(server, passcode);
    state.settings = { server, token };
    await saveSettings(state.settings);
    state.view = "main";
    await refreshHealth();
  } catch (error) {
    state.connectError = describe(error);
  } finally {
    state.connecting = false;
    render();
  }
}

async function signOut() {
  state.settings = { ...state.settings, token: null };
  await saveSettings(state.settings);
  resetQuestion();
  state.health = null;
  state.view = "connect";
  state.connectError = null;
  render();
}

// ---------- main view ----------

function renderMain(): Node[] {
  const nodes: Node[] = [renderHeader(), renderCapture()];
  if (state.question) nodes.push(renderQuestion(state.question));
  else nodes.push(renderHowTo());
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
    h("div", { class: "row small" }, link(`${state.settings.server}/history`, "History"), link(`${state.settings.server}/rules`, "Rules"), h("button", { class: "btn link small", onclick: () => void signOut(), text: "Sign out" })),
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
      h("li", { text: "Work a question in the SAT Suite Question Bank and reveal the answer." }),
      h("li", { text: "Press Capture. One picture of that tab is read; nothing is recorded." }),
      h("li", { text: "Tell me what you picked (and why). You get the one rule it tested, why your pick breaks it, and a takeaway." }),
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
    q.qbId ? chip(`ID ${q.qbId}`) : null,
    q.domain ? chip(q.domain, "accent") : null,
    q.skill ? chip(q.skill, "accent") : null,
    q.difficulty ? chip(q.difficulty) : null,
    q.answerSource === "model" ? chip("answer solved by the model", "warn") : null,
  );
  const choices = h(
    "ol",
    { class: "choices" },
    ...LETTERS.map((letter) => {
      const isPick = picked === letter;
      const isCorrect = showAnswer && q.correct === letter;
      const cls = `choice ${isCorrect ? "correct" : isPick ? "pick" : ""}`.trim();
      return h(
        "li",
        { class: cls },
        h("span", { class: "letter", text: `${letter}.` }),
        h("span", { text: q.choices[letter] }),
        isCorrect ? h("span", { class: "tag good", text: "correct" }) : isPick ? h("span", { class: "tag danger", text: "your pick" }) : null,
      );
    }),
  );
  const children: Child[] = [chips, q.passage ? h("div", { class: "passage", text: q.passage }) : null, h("p", { class: "stem", text: q.stem }), choices];
  if (!state.explained) children.push(renderPickPanel(q));
  return h("div", { class: "card" }, ...children);
}

function renderPickPanel(q: Question): Node {
  const needsAnswer = !q.correct;
  const picks = h(
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
    h("button", {
      class: `pick wide ${state.picked === "correct" ? "on" : ""}`.trim(),
      text: "I got it right, but explain",
      onclick: () => {
        state.picked = "correct";
        render();
      },
    }),
  );
  const reasoning = h("input", {
    id: "reasoning",
    class: "input",
    placeholder: "What was your thinking? (optional, one line)",
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === "Enter") void explain();
    },
  });
  const children: Child[] = [h("h2", { text: "Which did you pick?" })];
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
  children.push(picks, reasoning);
  children.push(
    h(
      "div",
      { class: "row" },
      h("button", { class: "btn primary", disabled: !state.picked || state.explaining || (needsAnswer && !state.allowSolve), onclick: () => void explain() }, state.explaining ? spinner() : null, "Explain"),
      state.explaining ? h("span", { class: "muted small", text: "Writing your rule card..." }) : null,
    ),
  );
  if (state.explainError) children.push(h("div", { class: "banner danger", role: "alert", text: state.explainError }));
  return h("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}

function renderRuleCard(card: RuleCard, picked: Pick, ruleName: string | null): Node {
  const diag = DIAGNOSIS[card.diagnosis] ?? DIAGNOSIS.unknown;
  const section = (title: string, body: string) => h("section", null, h("h2", { text: title }), h("p", { text: body }));
  const children: Child[] = [
    h(
      "div",
      { class: "row" },
      chip(diag.label, diag.tone),
      chip(`confidence ${Math.round(card.confidence * 100)}%`),
      card.solved_by_model ? chip("answer worked out by the model, double check it", "warn") : null,
      card.suggested_rule ? chip(`suggested new rule: ${card.suggested_rule}`) : null,
    ),
    h(
      "div",
      { class: "banner accent" },
      h("div", { class: "rule-id" }, "Rule ", link(`${state.settings.server}/rules#${card.rule_id}`, `${card.rule_id}${ruleName ? ` · ${ruleName}` : ""}`)),
      h("p", { class: "rule-statement", text: card.rule_statement }),
    ),
    section(`Why ${card.correct_letter} is right`, card.why_correct),
    card.why_pick_fails && picked !== "correct" ? section(`Why ${picked} fails`, card.why_pick_fails) : null,
    card.eliminations.length
      ? h(
          "section",
          null,
          h("h2", { text: "Kill the rest" }),
          h("ul", { class: "list" }, ...card.eliminations.map((e) => h("li", null, h("span", { class: "letter", text: `${e.letter}.` }), h("span", { text: e.reason })))),
        )
      : null,
    h("div", { class: "banner", style: "background:var(--bg)" }, h("h2", { text: "Takeaway" }), h("p", { class: "stem", text: card.takeaway })),
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
      h("button", { class: "btn", disabled: d.loading, title: "Writes one new mini-question on the same rule", onclick: () => void startDrill() }, d.loading ? spinner() : null, "Test me"),
      d.error ? h("span", { class: "small", style: "color:var(--danger)", text: d.error }) : null,
    );
  }
  const drill = d.data;
  const choices = h(
    "ol",
    { class: "choices" },
    ...LETTERS.map((letter) => {
      const isPick = d.picked === letter;
      const isCorrect = d.result?.correctLetter === letter;
      const cls = d.result ? (isCorrect ? "correct" : isPick ? "pick" : "") : isPick ? "selected" : "selectable";
      return h(
        "li",
        { class: `choice ${cls}`.trim(), onclick: () => void answerDrill(letter) },
        h("span", { class: "letter", text: `${letter}.` }),
        h("span", { text: drill.question.choices[letter] }),
      );
    }),
  );
  const children: Child[] = [
    h("h2", { text: `Test me · ${drill.ruleId} ${drill.ruleName}` }),
    drill.question.passage ? h("div", { class: "passage", text: drill.question.passage }) : null,
    h("p", { class: "stem", text: drill.question.stem }),
    choices,
  ];
  if (d.result) {
    children.push(
      h(
        "div",
        { class: `banner ${d.result.correct ? "good" : "danger"}` },
        h("p", { class: "stem", text: d.result.correct ? "Right." : `Not quite. The answer is ${d.result.correctLetter}.` }),
        h("p", { text: d.result.correct ? d.result.whyCorrect : d.result.fix ?? d.result.whyCorrect }),
        !d.result.correct ? h("p", { class: "muted small", text: d.result.whyCorrect }) : null,
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
          ...c.messages.map((m) => h("div", { class: `msg ${m.role === "user" ? "user" : "tutor"}`, id: `msg-${m.id}` }, h("span", { class: "who", text: m.role === "user" ? "you" : "tutor" }), h("span", { class: "body", text: m.text || (c.busy ? "..." : "") }))),
        )
      : null,
    c.error ? h("div", { class: "banner danger", role: "alert", text: c.error }) : null,
    h("div", { class: "row" }, h("div", { style: "flex:1;min-width:0" }, input), h("button", { class: "btn", disabled: c.busy, onclick: () => void sendChat() }, c.busy ? spinner() : "Send")),
  );
}

function renderFooter(): Node {
  return h("div", { class: "footer muted" }, link(state.settings.server, "Open the web app"), h("span", { text: state.health ? `v${state.health.version}` : "" }));
}

// ---------- actions ----------

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "no_provider") return "The server has no AI key yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel, then try again.";
    if (error.code === "extraction_failed") return "I could not find a question in that picture. Scroll so the whole question and the choices are visible, then capture again.";
    if (error.code === "needs_answer") return "The answer was not visible. Reveal it on the Question Bank tab and capture again, or tick 'Let the model work out the answer'.";
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
    state.connectError = "Your session expired. Enter the passcode again.";
    render();
    return true;
  }
  return false;
}

function resetQuestion() {
  state.question = null;
  state.picked = null;
  state.allowSolve = false;
  state.explaining = false;
  state.explainError = null;
  state.explained = null;
  state.chat = { messages: [], busy: false, error: null };
  state.drill = { data: null, picked: null, result: null, loading: false, error: null };
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
  state.explaining = true;
  state.explainError = null;
  render();
  try {
    const data = await request<ExplainResponse>(state.settings, "/api/explain", {
      body: { questionId: q.id, picked: state.picked, reasoning: reasoning || null, allowModelSolve: state.allowSolve },
    });
    state.question = data.question;
    state.explained = { attemptId: data.attemptId, card: data.card, ruleName: data.rule?.name ?? null, picked: state.picked };
    state.chat = { messages: [], busy: false, error: null };
    state.drill = { data: null, picked: null, result: null, loading: false, error: null };
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
  state.drill = { data: null, picked: null, result: null, loading: true, error: null };
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
      if (body) body.textContent = reply.text;
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.pendingCapture?.newValue) void consumePendingCapture();
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
  await refreshHealth();
  await consumePendingCapture();
}

void boot();
