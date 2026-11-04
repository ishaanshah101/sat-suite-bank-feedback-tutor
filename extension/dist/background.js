// extension/src/addons/types.ts
function choicesOf(c) {
  return { A: c?.A ?? "", B: c?.B ?? "", C: c?.C ?? "", D: c?.D ?? "" };
}
var MATH_DOMAINS = ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"];
var MATH_SKILLS = [
  "Linear equations in one variable",
  "Linear functions",
  "Linear equations in two variables",
  "Systems of two linear equations in two variables",
  "Linear inequalities in one or two variables",
  "Nonlinear functions",
  "Nonlinear equations in one variable and systems of equations in two variables",
  "Equivalent expressions",
  "Ratios, rates, proportional relationships, and units",
  "Percentages",
  "One-variable data: Distributions and measures of center and spread",
  "Two-variable data: Models and scatterplots",
  "Probability and conditional probability",
  "Inference from sample statistics and margin of error",
  "Evaluating statistical claims: Observational studies and experiments",
  "Area and volume",
  "Lines, angles, and triangles",
  "Right triangles and trigonometry",
  "Circles"
];
var fold = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
var MATH_NAMES = new Set([...MATH_DOMAINS, ...MATH_SKILLS].map(fold));

// extension/src/addons/store.ts
var chromeKV = {
  async get(key) {
    const out = await chrome.storage.local.get(key);
    return out[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  }
};
function memoryKV(seed = {}) {
  const data = structuredClone(seed);
  return {
    async get(key) {
      return structuredClone(data[key]);
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async remove(key) {
      delete data[key];
    },
    dump: () => structuredClone(data)
  };
}
var current = null;
function kv() {
  if (!current) current = typeof chrome !== "undefined" && chrome?.storage?.local ? chromeKV : memoryKV();
  return current;
}
var UNSAFE_KEY = /^(__proto__|constructor|prototype)$/;
var isSafeKey = (key) => !UNSAFE_KEY.test(key);
var KEYS = {
  log: "rc.addons.log.v1",
  srs: "rc.addons.srs.v1",
  prefs: "rc.addons.prefs.v1",
  timer: "rc.addons.timer.v1",
  sets: "rc.addons.sets.v1",
  /** achievements.ts: { [badgeId]: earnedAt } */
  badges: "rc.addons.badges.v1"
};

// extension/src/addons/log.ts
var STEM_MAX = 500;
var PASSAGE_MAX = 1200;
var FIGURE_MAX = 800;
var STEP_MAX = 300;
var STEPS_MAX = 8;
var TYPED_MAX = 20;
var TEXT_MAX = 2e3;
var ID_MAX = 200;
var CHOICE_MAX = 500;
var ACCEPTED_MAX = 20;
var DRILLS_MAX = 500;
var LOG_BYTES_MAX = 4 * 1024 * 1024;
var AT_MIN = Date.UTC(2020, 0, 1);
var AT_SLACK = 864e5;
var clip = (s, n) => s ? s.length > n ? `${s.slice(0, n - 1)}\u2026` : s : null;
var queue = Promise.resolve();
async function readLog() {
  const raw = await kv().get(KEYS.log);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const ok = sanitizeEntry(e);
    return ok ? [ok] : [];
  });
}
var isStrings = (x) => Array.isArray(x) && x.every((s) => typeof s === "string");
var isStr = (x) => typeof x === "string";
var isNum = (x) => typeof x === "number" && Number.isFinite(x);
var LETTER_SET = /* @__PURE__ */ new Set(["A", "B", "C", "D"]);
var isLetter = (x) => isStr(x) && LETTER_SET.has(x);
var DIAGNOSES = /* @__PURE__ */ new Set(["misread", "rule_gap", "careless", "got_it_right", "unknown"]);
var CONFIDENCES = /* @__PURE__ */ new Set(["sure", "unsure", "guess"]);
var strOrNull = (v, n) => isStr(v) ? clip(v, n) : null;
var str = (v, n) => isStr(v) ? clip(v, n) ?? "" : "";
var idOf = (v) => isStr(v) && v !== "" && isSafeKey(v) ? v.slice(0, ID_MAX) : void 0;
function sanitizeEntry(x, now = Date.now()) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x;
  const attemptId = idOf(e.attemptId);
  const ruleId = idOf(e.ruleId);
  if (!attemptId || !ruleId || !isStr(e.stem)) return null;
  if (e.qbId !== void 0 && e.qbId !== null && isStr(e.qbId) && !isSafeKey(e.qbId)) return null;
  if (!isNum(e.at) || e.at < AT_MIN || e.at > now + AT_SLACK) return null;
  if (!isLetter(e.correct)) return null;
  const picked = e.picked === "correct" ? "correct" : isLetter(e.picked) ? e.picked : null;
  if (!picked) return null;
  if (e.result !== "right" && e.result !== "missed") return null;
  const drills = Array.isArray(e.drills) ? e.drills.filter((d) => !!d && typeof d === "object" && isNum(d.at) && typeof d.correct === "boolean").slice(0, DRILLS_MAX).map((d) => d.review === void 0 ? { at: d.at, correct: d.correct } : { at: d.at, correct: d.correct, review: Boolean(d.review) }) : [];
  const rawChoices = e.choices && typeof e.choices === "object" ? e.choices : null;
  const choices = choicesOf(null);
  if (rawChoices) for (const l of ["A", "B", "C", "D"]) choices[l] = str(rawChoices[l], CHOICE_MAX);
  const entry = {
    attemptId,
    at: e.at,
    ruleId,
    ruleName: strOrNull(e.ruleName, ID_MAX),
    ruleStatement: str(e.ruleStatement, TEXT_MAX),
    takeaway: str(e.takeaway, TEXT_MAX),
    whyCorrect: str(e.whyCorrect, TEXT_MAX),
    whyPickFails: strOrNull(e.whyPickFails, TEXT_MAX),
    diagnosis: isStr(e.diagnosis) && DIAGNOSES.has(e.diagnosis) ? e.diagnosis : "unknown",
    confidence: isNum(e.confidence) ? Math.min(1, Math.max(0, e.confidence)) : 0,
    picked,
    correct: e.correct,
    result: e.result,
    qbId: strOrNull(e.qbId, ID_MAX),
    domain: strOrNull(e.domain, ID_MAX),
    skill: strOrNull(e.skill, ID_MAX),
    difficulty: strOrNull(e.difficulty, ID_MAX),
    stem: clip(e.stem, STEM_MAX) ?? "",
    passage: strOrNull(e.passage, PASSAGE_MAX),
    choices,
    solvedByModel: e.solvedByModel === true,
    seconds: isNum(e.seconds) && e.seconds >= 0 ? e.seconds : null,
    note: str(e.note, TEXT_MAX),
    starred: e.starred === true,
    drills
  };
  if (e.selfConfidence !== void 0) entry.selfConfidence = isStr(e.selfConfidence) && CONFIDENCES.has(e.selfConfidence) ? e.selfConfidence : null;
  if (e.section === "rw" || e.section === "math" || e.section === null) entry.section = e.section;
  if (e.format === "mcq" || e.format === "spr" || e.format === null) entry.format = e.format;
  if (e.typed !== void 0) entry.typed = strOrNull(e.typed, TYPED_MAX);
  if (isStrings(e.accepted)) entry.accepted = e.accepted.slice(0, ACCEPTED_MAX).map((a) => clip(a, TYPED_MAX * 2) ?? "");
  if (e.figure !== void 0) entry.figure = strOrNull(e.figure, FIGURE_MAX);
  if (isStrings(e.steps)) entry.steps = e.steps.slice(0, STEPS_MAX).map((st) => clip(st, STEP_MAX) ?? "");
  if (e.shortcut !== void 0) entry.shortcut = strOrNull(e.shortcut, STEP_MAX);
  return entry;
}

// extension/src/addons/prefs.ts
var DEFAULT_PREFS = {
  timer: true,
  cropBeforeSend: false,
  pageCheck: true,
  hotkeys: true,
  reminders: false,
  reminderHour: 19,
  dailyGoal: 10,
  autoSpeak: false,
  textCapture: true,
  strategies: true,
  askConfidence: true,
  testDate: null,
  zoom: 1,
  seenBefore: true,
  pastePanel: true,
  practice: true,
  plan: true,
  badges: true,
  qbQuiz: true,
  skillMap: true,
  wordBank: true,
  activity: true
};
var isObj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var num = (v, min, max, fallback, integer = false) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fallback;
function sanitizePrefs(raw) {
  const r = isObj(raw) ? raw : {};
  const out = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS)) {
    const v = r[key];
    if (typeof DEFAULT_PREFS[key] === "boolean" && typeof v === "boolean") out[key] = v;
  }
  out.reminderHour = num(r.reminderHour, 0, 23, DEFAULT_PREFS.reminderHour, true);
  out.dailyGoal = num(r.dailyGoal, 1, 100, DEFAULT_PREFS.dailyGoal, true);
  out.zoom = num(r.zoom, 0.5, 2, DEFAULT_PREFS.zoom);
  out.testDate = typeof r.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.testDate) ? r.testDate : null;
  return out;
}
async function readPrefs() {
  return sanitizePrefs(await kv().get(KEYS.prefs));
}

// extension/src/addons/srs.ts
var INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32];
var MAX_BOX = INTERVAL_DAYS.length - 1;
function dueRules(state, now) {
  return Object.values(state).filter((r) => r.due <= now).sort((a, b) => a.due - b.due || b.lapses - a.lapses || a.box - b.box);
}
async function readSrs() {
  const raw = await kv().get(KEYS.srs);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, r] of Object.entries(raw)) {
    if (!isSafeKey(id) || !r || typeof r !== "object") continue;
    const rule = r;
    if (typeof rule.box !== "number" || typeof rule.due !== "number" || typeof rule.attemptId !== "string") continue;
    out[id] = { ...rule, ruleId: id };
  }
  return out;
}

// extension/src/addons/stats.ts
function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// extension/src/addons/background.ts
var BADGE_ALARM = "rulecard-badge";
var REMINDER_ALARM = "rulecard-reminder";
var QB_URL = "https://satsuitequestionbank.collegeboard.org/digital/search";
async function refreshBadge() {
  const due = dueRules(await readSrs(), Date.now()).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#2f5bea" });
  await chrome.action.setBadgeText({ text: due ? String(Math.min(due, 99)) : "" });
  await chrome.action.setTitle({ title: due ? `Rulecard \xB7 ${due} rule${due === 1 ? "" : "s"} due for review` : "Open Rulecard" });
}
function nextAt(hour, now = Date.now()) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
async function scheduleReminder() {
  const prefs = await readPrefs();
  await chrome.alarms.clear(REMINDER_ALARM);
  if (prefs.reminders) chrome.alarms.create(REMINDER_ALARM, { when: nextAt(prefs.reminderHour), periodInMinutes: 24 * 60 });
}
async function maybeRemind() {
  const prefs = await readPrefs();
  if (!prefs.reminders || !chrome.notifications) return;
  const today = dayKey(Date.now());
  const log = await readLog();
  const doneToday = log.filter((e) => dayKey(e.at) === today).length;
  const due = dueRules(await readSrs(), Date.now()).length;
  if (doneToday >= prefs.dailyGoal) return;
  const message = due > 0 ? `${due} rule${due === 1 ? "" : "s"} due for review, plus ${Math.max(0, prefs.dailyGoal - doneToday)} questions to hit today's goal.` : doneToday === 0 ? "You haven't practiced today. Even 3 questions keeps the streak alive." : `${prefs.dailyGoal - doneToday} more to hit today's goal.`;
  chrome.notifications.create(REMINDER_ALARM, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Rulecard",
    message,
    priority: 0
  });
}
function installBackgroundAddons() {
  chrome.runtime.onInstalled.addListener((details) => {
    chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 30 });
    void refreshBadge();
    void scheduleReminder();
    if (details.reason === "install") void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  });
  chrome.runtime.onStartup.addListener(() => {
    void refreshBadge();
    void scheduleReminder();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BADGE_ALARM) void refreshBadge();
    if (alarm.name === REMINDER_ALARM) void maybeRemind().finally(() => scheduleReminder());
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[KEYS.srs]) void refreshBadge();
    if (changes[KEYS.prefs]) void scheduleReminder();
  });
  let clickHooked = false;
  const hookNotificationClick = () => {
    if (clickHooked || !chrome.notifications) return;
    clickHooked = true;
    chrome.notifications.onClicked.addListener((id) => {
      if (id !== REMINDER_ALARM) return;
      chrome.notifications.clear(id);
      void chrome.tabs.create({ url: QB_URL });
    });
  };
  hookNotificationClick();
  chrome.permissions.onAdded.addListener(() => hookNotificationClick());
}

// extension/src/background.ts
var openOnClick = () => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => void 0);
};
chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);
installBackgroundAddons();
