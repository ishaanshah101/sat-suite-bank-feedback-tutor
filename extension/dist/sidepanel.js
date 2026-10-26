// extension/src/api.ts
var DEFAULT_SERVER = "https://rulecard.vercel.app";
var ApiError = class extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
};
async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { server: DEFAULT_SERVER, token: null, ...stored.settings ?? {} };
}
async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}
function normalizeServer(input) {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SERVER;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).origin;
}
async function request(settings, path, init = {}) {
  const headers = { accept: "application/json" };
  if (init.body !== void 0) headers["content-type"] = "application/json";
  if (init.auth !== false && settings.token) headers.authorization = `Bearer ${settings.token}`;
  let response;
  try {
    response = await fetch(settings.server + path, {
      method: init.method ?? (init.body !== void 0 ? "POST" : "GET"),
      headers,
      body: init.body !== void 0 ? JSON.stringify(init.body) : void 0
    });
  } catch {
    throw new ApiError(0, `Could not reach ${settings.server}. Check the server address and your connection.`);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(response.status, text.slice(0, 200) || response.statusText);
  }
  if (!response.ok) throw new ApiError(response.status, data?.error ?? response.statusText, data?.code);
  return data;
}
async function authenticate(server, mode, email, password) {
  return request({ server, token: null }, mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", { body: { email, password }, auth: false });
}
async function webLink(settings, path) {
  const { code } = await request(settings, "/api/auth/handoff", { method: "POST", body: {} });
  return `${settings.server}/api/auth/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`;
}
async function streamChat(settings, attemptId, history, onDelta) {
  const messages = history.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.text }] }));
  let response;
  try {
    response = await fetch(settings.server + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.token ?? ""}` },
      body: JSON.stringify({ attemptId, messages })
    });
  } catch {
    throw new ApiError(0, `Could not reach ${settings.server}.`);
  }
  if (!response.ok || !response.body) {
    const text = await response.text();
    let message = response.statusText;
    let code;
    try {
      const parsed = JSON.parse(text);
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
  for (; ; ) {
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
      let part;
      try {
        part = JSON.parse(payload);
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

// extension/src/image.ts
var MAX_LONG_EDGE = 1568;
var PNG_BUDGET_BYTES = 26e5;
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
async function downscale(dataUrl, maxEdge = MAX_LONG_EDGE) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas not available");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    let out = await canvas.convertToBlob({ type: "image/png" });
    if (out.size > PNG_BUDGET_BYTES) out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    return blobToDataUrl(out);
  } finally {
    bitmap.close();
  }
}

// extension/src/types.ts
var LETTERS = ["A", "B", "C", "D"];

// extension/src/sidepanel.ts
var state = {
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
  explained: null,
  chat: { messages: [], busy: false, error: null },
  drill: { data: null, picked: null, result: null, loading: false, error: null }
};
var DIAGNOSIS = {
  misread: { label: "misread the sentence", tone: "warn" },
  rule_gap: { label: "rule gap", tone: "danger" },
  careless: { label: "careless slip", tone: "warn" },
  got_it_right: { label: "you got it", tone: "good" },
  unknown: { label: "no reasoning given", tone: "" }
};
function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === void 0 || value === null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "text") el.textContent = String(value);
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "checked" || key === "disabled" || key === "value") el[key] = value;
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === void 0 || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}
var chip = (text, tone = "") => h("span", { class: `chip ${tone}`.trim(), text });
var spinner = () => h("span", { class: "spinner", "aria-label": "working" });
function link(href, text, cls = "") {
  return h("a", { href, target: "_blank", rel: "noreferrer", class: cls, text });
}
var app = () => document.getElementById("app");
function render() {
  const active = document.activeElement;
  const keep = active && active.id && "value" in active ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  const inputs = {};
  for (const el of app().querySelectorAll("input[id], textarea[id]")) inputs[el.id] = el.value;
  const root = app();
  root.replaceChildren(...state.view === "connect" ? renderConnect() : state.view === "main" ? renderMain() : [h("p", { class: "muted", text: "Loading..." })]);
  for (const [id, value] of Object.entries(inputs)) {
    const el = document.getElementById(id);
    if (el && el.type !== "checkbox" && !el.value) el.value = value;
  }
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (keep.start !== null && keep.end !== null) el.setSelectionRange(keep.start, keep.end);
      } catch {
      }
    }
  }
}
function renderConnect() {
  const signup = state.authMode === "signup";
  const submitOnEnter = (event) => {
    if (event.key === "Enter") void connect();
  };
  const email = h("input", { id: "email", class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email", value: state.settings.email ?? "", onkeydown: submitOnEnter });
  const password = h("input", {
    id: "password",
    class: "input",
    type: "password",
    placeholder: signup ? "At least 8 characters" : "Password",
    autocomplete: signup ? "new-password" : "current-password",
    onkeydown: submitOnEnter
  });
  const server = h("input", { id: "server", class: "input", type: "url", placeholder: DEFAULT_SERVER, value: state.settings.server === DEFAULT_SERVER ? "" : state.settings.server, autocomplete: "url" });
  const tab = (mode, label) => h("button", {
    class: `tab${state.authMode === mode ? " active" : ""}`,
    role: "tab",
    "aria-selected": String(state.authMode === mode),
    text: label,
    onclick: () => {
      state.authMode = mode;
      state.connectError = null;
      render();
    }
  });
  return [
    h(
      "div",
      { class: "card" },
      h("h1", { text: "Rulecard" }),
      h("p", { class: "muted small", text: "Capture a Question Bank question and learn the one rule it tested. Your history is saved to your account, on the web app too." }),
      h("div", { class: "tabs", role: "tablist" }, tab("signin", "Sign in"), tab("signup", "Create account")),
      h("label", { class: "field" }, "Email", email),
      h("label", { class: "field" }, "Password", password),
      state.connectError ? h("div", { class: "banner danger", role: "alert", text: state.connectError }) : null,
      h(
        "button",
        { class: "btn primary big", disabled: state.connecting, onclick: () => void connect() },
        state.connecting ? spinner() : null,
        signup ? "Create account" : "Sign in"
      ),
      h("details", { class: "small muted" }, h("summary", { text: "Use a different server" }), h("label", { class: "field" }, "Server address (leave empty for the default)", server)),
      h("p", { class: "muted small" }, link(`${DEFAULT_SERVER}/privacy`, "Privacy"))
    )
  ];
}
async function connect() {
  const value = (id) => document.getElementById(id)?.value ?? "";
  const email = value("email").trim();
  const password = value("password");
  let server;
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
async function openWeb(path) {
  try {
    await chrome.tabs.create({ url: await webLink(state.settings, path) });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    await chrome.tabs.create({ url: state.settings.server + path });
  }
}
async function refreshRecent() {
  try {
    const data = await request(state.settings, "/api/attempts?limit=5");
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
function renderMain() {
  const nodes = [renderHeader(), renderCapture()];
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
function renderHeader() {
  const health = state.health;
  let dot = "";
  let title = "Checking the server...";
  if (health) {
    if (!health.db.ok) {
      dot = "danger";
      title = "Database unreachable";
    } else if (health.ai.live || health.ai.stub || health.ai.configured.length) {
      dot = "good";
      title = `AI: ${health.ai.live ?? health.ai.configured[0] ?? "stub"} \xB7 database ok`;
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
      h("button", { class: "btn link small", title: state.settings.email ?? "", onclick: () => void signOut(), text: "Sign out" })
    )
  );
}
function webButton(path, text) {
  return h("button", { class: "btn link small", text, onclick: () => void openWeb(path) });
}
function renderRecent(items) {
  return h(
    "div",
    { class: "card" },
    h("div", { class: "row between" }, h("h2", { text: "Recent" }), webButton("/history", "All history")),
    ...items.map(
      (item) => h(
        "button",
        { class: "recent", onclick: () => void openWeb(`/history/${item.id}`) },
        h("span", { class: "row" }, chip(item.result === "right" ? "right" : "missed", item.result === "right" ? "good" : "danger"), h("span", { class: "small muted", text: item.ruleName ?? item.skill ?? "" })),
        h("span", { class: "recent-stem", text: item.stem })
      )
    )
  );
}
function renderCapture() {
  const hint = state.shortcut ? ["or press ", h("kbd", { text: state.shortcut })] : ["(set a shortcut at chrome://extensions/shortcuts)"];
  const children = [
    h("button", { class: "btn primary big", disabled: state.capturing, onclick: () => void capture() }, state.capturing ? spinner() : null, state.capturing ? "Reading the question..." : state.question ? "Capture again" : "Capture this tab"),
    h("p", { class: "muted small" }, "On the Question Bank tab, click the Rulecard toolbar icon once (that is Chrome's permission to read the tab), reveal the answer, then click Capture ", ...hint, ".")
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
function renderHowTo() {
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
      h("li", { text: "Ask follow-ups, or press Test me for a fresh question on the same rule." })
    )
  );
}
function renderQuestion(q) {
  const showAnswer = Boolean(state.explained);
  const picked = state.explained?.picked ?? null;
  const chips = h(
    "div",
    { class: "row" },
    q.qbId ? chip(`ID ${q.qbId}`) : null,
    q.domain ? chip(q.domain, "accent") : null,
    q.skill ? chip(q.skill, "accent") : null,
    q.difficulty ? chip(q.difficulty) : null,
    q.answerSource === "model" ? chip("answer solved by the model", "warn") : null
  );
  const choices = h(
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
        h("span", { text: q.choices[letter] }),
        isCorrect ? h("span", { class: "tag good", text: "correct" }) : isPick ? h("span", { class: "tag danger", text: "your pick" }) : null
      );
    })
  );
  const children = [chips, q.passage ? h("div", { class: "passage", text: q.passage }) : null, h("p", { class: "stem", text: q.stem }), choices];
  if (!state.explained) children.push(renderPickPanel(q));
  return h("div", { class: "card" }, ...children);
}
function renderPickPanel(q) {
  const needsAnswer = !q.correct;
  const picks = h(
    "div",
    { class: "picks" },
    ...LETTERS.map(
      (letter) => h("button", {
        class: `pick ${state.picked === letter ? "on" : ""}`.trim(),
        text: letter,
        onclick: () => {
          state.picked = letter;
          render();
        }
      })
    ),
    h("button", {
      class: `pick wide ${state.picked === "correct" ? "on" : ""}`.trim(),
      text: "I got it right, but explain",
      onclick: () => {
        state.picked = "correct";
        render();
      }
    })
  );
  const reasoning = h("input", {
    id: "reasoning",
    class: "input",
    placeholder: "What was your thinking? (optional, one line)",
    onkeydown: (event) => {
      if (event.key === "Enter") void explain();
    }
  });
  const children = [h("h2", { text: "Which did you pick?" })];
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
            onchange: (event) => {
              state.allowSolve = event.target.checked;
              render();
            }
          }),
          "Let the model work out the answer"
        )
      )
    );
  }
  children.push(picks, reasoning);
  children.push(
    h(
      "div",
      { class: "row" },
      h("button", { class: "btn primary", disabled: !state.picked || state.explaining || needsAnswer && !state.allowSolve, onclick: () => void explain() }, state.explaining ? spinner() : null, "Explain"),
      state.explaining ? h("span", { class: "muted small", text: "Writing your rule card..." }) : null
    )
  );
  if (state.explainError) children.push(h("div", { class: "banner danger", role: "alert", text: state.explainError }));
  return h("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}
function renderRuleCard(card, picked, ruleName) {
  const diag = DIAGNOSIS[card.diagnosis] ?? DIAGNOSIS.unknown;
  const section = (title, body) => h("section", null, h("h2", { text: title }), h("p", { text: body }));
  const children = [
    h(
      "div",
      { class: "row" },
      chip(diag.label, diag.tone),
      chip(`confidence ${Math.round(card.confidence * 100)}%`),
      card.solved_by_model ? chip("answer worked out by the model, double check it", "warn") : null,
      card.suggested_rule ? chip(`suggested new rule: ${card.suggested_rule}`) : null
    ),
    h(
      "div",
      { class: "banner accent" },
      h("div", { class: "rule-id" }, "Rule ", link(`${state.settings.server}/rules#${card.rule_id}`, `${card.rule_id}${ruleName ? ` \xB7 ${ruleName}` : ""}`)),
      h("p", { class: "rule-statement", text: card.rule_statement })
    ),
    section(`Why ${card.correct_letter} is right`, card.why_correct),
    card.why_pick_fails && picked !== "correct" ? section(`Why ${picked} fails`, card.why_pick_fails) : null,
    card.eliminations.length ? h(
      "section",
      null,
      h("h2", { text: "Kill the rest" }),
      h("ul", { class: "list" }, ...card.eliminations.map((e) => h("li", null, h("span", { class: "letter", text: `${e.letter}.` }), h("span", { text: e.reason }))))
    ) : null,
    h("div", { class: "banner", style: "background:var(--bg)" }, h("h2", { text: "Takeaway" }), h("p", { class: "stem", text: card.takeaway })),
    renderDrill()
  ];
  return h("div", { class: "card" }, ...children);
}
function renderDrill() {
  const d = state.drill;
  if (!d.data) {
    return h(
      "div",
      { class: "row", style: "border-top:1px solid var(--line);padding-top:10px" },
      h("button", { class: "btn", disabled: d.loading, title: "Writes one new mini-question on the same rule", onclick: () => void startDrill() }, d.loading ? spinner() : null, "Test me"),
      d.error ? h("span", { class: "small", style: "color:var(--danger)", text: d.error }) : null
    );
  }
  const drill = d.data;
  const choices = h(
    "ol",
    { class: "choices" },
    ...LETTERS.map((letter) => {
      const isPick = d.picked === letter;
      const isCorrect = d.result?.correctLetter === letter;
      const cls = d.result ? isCorrect ? "correct" : isPick ? "pick" : "" : isPick ? "selected" : "selectable";
      return h(
        "li",
        { class: `choice ${cls}`.trim(), onclick: () => void answerDrill(letter) },
        h("span", { class: "letter", text: `${letter}.` }),
        h("span", { text: drill.question.choices[letter] })
      );
    })
  );
  const children = [
    h("h2", { text: `Test me \xB7 ${drill.ruleId} ${drill.ruleName}` }),
    drill.question.passage ? h("div", { class: "passage", text: drill.question.passage }) : null,
    h("p", { class: "stem", text: drill.question.stem }),
    choices
  ];
  if (d.result) {
    children.push(
      h(
        "div",
        { class: `banner ${d.result.correct ? "good" : "danger"}` },
        h("p", { class: "stem", text: d.result.correct ? "Right." : `Not quite. The answer is ${d.result.correctLetter}.` }),
        h("p", { text: d.result.correct ? d.result.whyCorrect : d.result.fix ?? d.result.whyCorrect }),
        !d.result.correct ? h("p", { class: "muted small", text: d.result.whyCorrect }) : null
      ),
      h("button", { class: "btn", disabled: d.loading, onclick: () => void startDrill() }, d.loading ? spinner() : null, "Another one")
    );
  }
  if (d.error) children.push(h("div", { class: "banner danger", role: "alert", text: d.error }));
  return h("div", { style: "display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:10px" }, ...children);
}
function renderChat() {
  const c = state.chat;
  const input = h("input", {
    id: "chat-input",
    class: "input",
    placeholder: "Ask about this question",
    onkeydown: (event) => {
      if (event.key === "Enter") void sendChat();
    }
  });
  return h(
    "div",
    { class: "card" },
    h("h2", { text: "Ask about this question" }),
    c.messages.length ? h(
      "div",
      { class: "chat" },
      ...c.messages.map((m) => h("div", { class: `msg ${m.role === "user" ? "user" : "tutor"}`, id: `msg-${m.id}` }, h("span", { class: "who", text: m.role === "user" ? "you" : "tutor" }), h("span", { class: "body", text: m.text || (c.busy ? "..." : "") })))
    ) : null,
    c.error ? h("div", { class: "banner danger", role: "alert", text: c.error }) : null,
    h("div", { class: "row" }, h("div", { style: "flex:1;min-width:0" }, input), h("button", { class: "btn", disabled: c.busy, onclick: () => void sendChat() }, c.busy ? spinner() : "Send"))
  );
}
function renderFooter() {
  return h(
    "div",
    { class: "footer muted" },
    webButton("/", "Open the web app"),
    h("span", { class: "small", text: [state.settings.email, state.health ? `v${state.health.version}` : ""].filter(Boolean).join(" \xB7 ") })
  );
}
function describe(error) {
  if (error instanceof ApiError) {
    if (error.code === "no_provider") return "The server has no AI key yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel, then try again.";
    if (error.code === "extraction_failed") return "I could not find a question in that picture. Scroll so the whole question and the choices are visible, then capture again.";
    if (error.code === "needs_answer") return "The answer was not visible. Reveal it on the Question Bank tab and capture again, or tick 'Let the model work out the answer'.";
    if (error.code === "daily_limit") return error.message;
    if (error.status === 429) return error.message;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
async function handleAuthFailure(error) {
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
  state.allowSolve = false;
  state.explaining = false;
  state.explainError = null;
  state.explained = null;
  state.chat = { messages: [], busy: false, error: null };
  state.drill = { data: null, picked: null, result: null, loading: false, error: null };
}
async function refreshHealth() {
  try {
    state.health = await request(state.settings, "/api/health");
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.health = null;
  }
  render();
}
async function activeTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.windowId === void 0) throw new Error("No active tab found. Click the Question Bank tab, then try again.");
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
    let raw;
    try {
      raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/permission|activeTab|all_urls/i.test(message)) {
        state.needsAllSites = true;
        throw new Error(
          "Chrome only lets Rulecard read a tab after you click the Rulecard toolbar icon on that tab (or press the shortcut there). Click the icon on the Question Bank tab, then Capture again. Or allow all sites below, once."
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
async function processImage(image) {
  const data = await request(state.settings, "/api/extract", { body: { image, source: "capture" } });
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
  const reasoning = (document.getElementById("reasoning")?.value ?? "").trim();
  state.explaining = true;
  state.explainError = null;
  render();
  try {
    const data = await request(state.settings, "/api/explain", {
      body: { questionId: q.id, picked: state.picked, reasoning: reasoning || null, allowModelSolve: state.allowSolve }
    });
    state.question = data.question;
    state.explained = { attemptId: data.attemptId, card: data.card, ruleName: data.rule?.name ?? null, picked: state.picked };
    void refreshRecent();
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
    state.drill.data = await request(state.settings, "/api/drill", { body: { attemptId } });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    state.drill.error = describe(error);
  } finally {
    state.drill.loading = false;
    render();
  }
}
async function answerDrill(letter) {
  const d = state.drill;
  if (!d.data || d.result || d.picked) return;
  d.picked = letter;
  render();
  try {
    d.result = await request(state.settings, "/api/drill/check", { body: { drillId: d.data.drillId, picked: letter } });
  } catch (error) {
    if (await handleAuthFailure(error)) return;
    d.error = describe(error);
    d.picked = null;
  }
  render();
}
async function sendChat() {
  const attemptId = state.explained?.attemptId;
  const input = document.getElementById("chat-input");
  const text = (input?.value ?? "").trim();
  if (!attemptId || !text || state.chat.busy) return;
  if (input) input.value = "";
  const c = state.chat;
  c.busy = true;
  c.error = null;
  const user = { id: `u-${Date.now()}`, role: "user", text };
  const reply = { id: `a-${Date.now()}`, role: "assistant", text: "" };
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
async function consumePendingCapture() {
  const stored = await chrome.storage.session.get("pendingCapture");
  const pending = stored.pendingCapture;
  if (!pending) return;
  await chrome.storage.session.remove("pendingCapture");
  if (Date.now() - pending.at > 12e4) return;
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
}
void boot();
