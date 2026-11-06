// Loads the unpacked extension into Chromium and drives the side panel against a running Rulecard server.
// Usage: BASE=http://localhost:3100 node scripts/check-extension.mjs (creates a fresh account each run)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.EMAIL ?? `ext-${Date.now()}@example.com`;
const PASSWORD = process.env.PASSWORD ?? "extension-check-1";
const PRACTICE_PAGE = fs.readFileSync(path.resolve("tests/fixtures/mypractice-question.html"), "utf8");
const PRACTICE_URL = "https://mypractice.collegeboard.org/details?fp_8dbea909-c37c-43c1-bde0-b3c056674757";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push(!!cond);
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${extra ? " | " + String(extra).slice(0, 200) : ""}`);
};

// Copy the extension and grant the local test server up front: automation cannot accept the native
// permission prompt that a custom server asks for in real use.
const source = path.resolve("extension");
const ext = fs.mkdtempSync(path.join(os.tmpdir(), "rulecard-ext-"));
fs.cpSync(source, ext, { recursive: true });
const manifestPath = path.join(ext, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.host_permissions.push("<all_urls>");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rulecard-profile-"));
const launch = { headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else launch.channel = "chromium";
const context = await chromium.launchPersistentContext(profile, launch);
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  ok("service worker started", worker.url().endsWith("/dist/background.js"), worker.url());

  const page = await context.newPage();
  await page.goto(`${BASE}/privacy`);
  const panel = await context.newPage();
  panel.on("pageerror", (e) => console.log("panel pageerror:", e.message));
  panel.on("console", (m) => console.log(`panel console.${m.type()}:`, m.text().slice(0, 200)));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.locator("#password").waitFor({ timeout: 10000 });
  ok("sign-in view renders", true);

  const setServer = async () => {
    if (BASE === "https://rulecard.vercel.app") return;
    if (!(await panel.locator("#server").isVisible())) await panel.getByText("Use a different server").click();
    await panel.locator("#server").fill(BASE);
  };
  await setServer();
  await panel.locator("#email").fill(EMAIL);
  await panel.locator("#password").fill(PASSWORD);
  await panel.getByRole("button", { name: "Sign in", exact: true }).click();
  await panel.locator('[role="alert"]').waitFor({ timeout: 15000 });
  ok("unknown account is rejected", (await panel.locator('[role="alert"]').innerText()).includes("do not match"));

  await panel.getByRole("tab", { name: "Create account" }).click();
  await setServer();
  await panel.locator("#email").fill(EMAIL);
  await panel.locator("#password").fill(PASSWORD);
  await panel.getByRole("button", { name: "Create account", exact: true }).click();
  await panel.getByRole("button", { name: "Capture this tab" }).waitFor({ timeout: 15000 });
  const stored = await worker.evaluate(() => chrome.storage.local.get("settings"));
  ok("account created and token stored", typeof stored.settings?.token === "string" && stored.settings.token.split(".").length === 3 && stored.settings.email === EMAIL);
  await panel.locator(".dot.good").waitFor({ timeout: 15000 });
  ok("health dot is green (db + stub AI)", true);

  const granted = await worker.evaluate(() => chrome.runtime.getManifest());
  ok(
    "permissions: no tabs; all sites only as an optional grant; page access only on My Practice",
    JSON.stringify(granted.permissions) === JSON.stringify(["sidePanel", "storage", "alarms", "scripting", "activeTab"]) &&
      granted.host_permissions.filter((h) => h !== "<all_urls>").join(",") === "https://rulecard.vercel.app/*,https://mypractice.collegeboard.org/*" &&
      granted.optional_host_permissions.includes("<all_urls>") &&
      Boolean(granted.commands?._execute_action),
  );
  ok("Home is just the Capture button: no PDF picker, no plan", (await panel.locator('input[type="file"]').count()) === 0 && (await panel.getByText("Today's plan").count()) === 0 && (await panel.locator("#capture-tab").count()) === 1);

  // Capture: the panel screenshots the tab on screen (here the privacy page), the stub reads a Reading and
  // Writing question from it, and the card is the answer plus 2 bullets. No pick is needed.
  await page.bringToFront();
  let sent = null;
  const onRequest = (r) => {
    if (r.url().endsWith("/api/extract") && r.method() === "POST") sent = r.postData();
  };
  panel.on("request", onRequest);
  await panel.locator("#capture-tab").click();
  const captured = await Promise.race([
    panel.locator('[data-testid="key-rules"]').waitFor({ timeout: 60000 }).then(() => "card"),
    panel.locator('[data-testid="capture-error"]').waitFor({ timeout: 60000 }).then(async () => "error: " + (await panel.locator('[data-testid="capture-error"]').innerText())),
  ]).catch((e) => "timeout: " + e.message.split("\n")[0]);
  panel.off("request", onRequest);
  const shot = sent ? JSON.parse(sent) : {};
  ok("Capture sends one screenshot of the tab on screen", captured === "card" && shot.source === "capture" && /^data:image\/(png|jpeg);base64,/.test(shot.image ?? ""), captured);
  if (captured !== "card") throw new Error("capture failed: " + captured);
  ok(
    "the card is the answer and 2 to 3 bullets, nothing else",
    (await panel.getByText("Answer: B").count()) === 1 &&
      (await panel.locator('[data-testid="key-rules"] li').count()) === 2 &&
      (await panel.getByText("Simple explanation").count()) === 0 &&
      (await panel.getByRole("button", { name: "Test me" }).count()) === 0 &&
      (await panel.locator("#chat-input").count()) === 0,
  );
  const ruleText = await panel.locator(".rule-id").innerText();
  ok("the card names its rule", /BND-01/.test(ruleText) && ruleText.includes("·"), ruleText);
  ok("Which did you pick? offers A to D, nothing chosen yet", (await panel.getByText("Which did you pick?").count()) === 1 && (await panel.locator(".pick").count()) === 4 && (await panel.locator('[data-testid="pick-why"]').count()) === 0);
  ok("the question it read is folded away", !(await panel.locator("#result-card .choices").isVisible()));

  await panel.locator(".pick", { hasText: /^A$/ }).click();
  await panel.locator('[data-testid="pick-why"]').waitFor({ timeout: 30000 });
  const why = await panel.locator('[data-testid="pick-why"]').innerText();
  ok("picking a wrong letter says why it's wrong and what's right", /Why A is wrong/i.test(why) && /comma splice/.test(why) && /right answer is B/.test(why), why);
  await panel.locator(".pick", { hasText: /^B$/ }).click();
  await panel.locator('[data-testid="pick-why"].good').waitFor({ timeout: 30000 }).catch(() => undefined);
  ok("picking the right letter says so", /B is right/.test(await panel.locator('[data-testid="pick-why"]').innerText()));

  // The toolbar icon, clicked with the panel open, captures too (the worker passes the click on).
  const windowId = await panel.evaluate(async () => (await chrome.windows.getCurrent()).id);
  let toolbarCapture = false;
  const onToolbar = (r) => {
    if (r.url().endsWith("/api/extract") && r.method() === "POST") toolbarCapture = true;
  };
  panel.on("request", onToolbar);
  await worker.evaluate((id) => chrome.runtime.sendMessage({ type: "rc-toolbar-click", windowId: id }), windowId);
  await panel.waitForResponse((r) => r.url().endsWith("/api/explain") && r.request().method() === "POST", { timeout: 60000 }).catch(() => undefined);
  panel.off("request", onToolbar);
  ok("a toolbar click with the panel open captures this tab", toolbarCapture);
  await panel.locator('[data-testid="key-rules"]').waitFor({ timeout: 60000 });

  // Tabs: Home holds only the capture flow; today's plan has its own tab.
  ok("tab bar has Home, Plan, Progress, Practice, Words, Settings", (await panel.locator(".rc-tabbtn").allInnerTexts()).map((t) => t.replace(/\d+/g, "").trim()).join(",") === "Home,Plan,Progress,Practice,Words,Settings");
  await panel.getByRole("tab", { name: /^Plan/ }).click();
  ok("Plan tab shows today's plan and hides the capture button", (await panel.getByText(/Today's plan/).count()) >= 1 && (await panel.locator("#capture-tab").count()) === 0);
  await panel.getByRole("tab", { name: /^Progress/ }).click();
  await panel.locator(".recent").first().waitFor({ timeout: 15000 });
  ok("Progress tab shows recent reviews", (await panel.locator(".recent").count()) >= 1);
  await panel.getByRole("tab", { name: /^Settings/ }).click();
  ok("Settings tab holds How it works and settings", (await panel.getByText("How it works").count()) === 1 && (await panel.getByText("Export & settings").count()) === 1);
  await panel.getByRole("tab", { name: /^Home/ }).click();

  // A missed practice-test question in My Practice: the same button reads the page text (math back to LaTeX).
  await context.route("https://mypractice.collegeboard.org/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: PRACTICE_PAGE }));
  const practice = await context.newPage();
  await practice.goto(PRACTICE_URL);
  await practice.bringToFront();
  sent = null;
  panel.on("request", onRequest);
  await panel.locator("#capture-tab").click();
  await panel.waitForResponse((r) => r.url().endsWith("/api/explain") && r.request().method() === "POST", { timeout: 60000 }).catch(() => undefined);
  panel.off("request", onRequest);
  const body = sent ? JSON.parse(sent) : {};
  ok(
    "practice test: page text read with math as LaTeX",
    body.source === "paste" && /\\\(f\(x\)=a\{x\}\^\{2\}\+bx\+c\\\)/.test(body.text ?? "") && /You selected answer D\. The correct answer is A\./.test(body.text ?? "") && !/Previous|Show correct answer/.test(body.text ?? ""),
    (body.text ?? "").slice(0, 200),
  );
  await panel.locator('[data-testid="key-rules"]').waitFor({ timeout: 60000 });
  await panel.locator(".pick", { hasText: /^D$/ }).click();
  await panel.locator('[data-testid="pick-why"]').waitFor({ timeout: 30000 });
  ok("practice test: the pick step works on it too", /Why D is wrong/i.test(await panel.locator('[data-testid="pick-why"]').innerText()));
  await practice.close();

  // A page Chrome never lets extensions capture: the panel says so instead of failing silently.
  const blocked = await context.newPage();
  await blocked.goto("chrome://version").catch(() => undefined);
  await blocked.bringToFront();
  await panel.locator("#capture-tab").click();
  await panel.locator('[data-testid="capture-error"]').waitFor({ timeout: 15000 }).catch(() => undefined);
  ok("a page Chrome won't capture gets a plain message", /doesn't let extensions capture|refused|Allow/.test(await panel.locator('[data-testid="capture-error"]').innerText().catch(() => "")), await panel.locator('[data-testid="capture-error"]').innerText().catch(() => "none"));
  await blocked.close();

  // Recent list and the signed-in link into the web app.
  const opened = context.waitForEvent("page", { timeout: 15000 });
  await panel.getByRole("button", { name: "History", exact: true }).click();
  const web = await opened;
  await web.waitForLoadState("domcontentloaded");
  // A link never signs a browser in by itself: the handoff page asks for one click first.
  await web.getByTestId("handoff-continue").click({ timeout: 15000 });
  await web.waitForURL(/\/history$/, { timeout: 15000 }).catch(() => undefined);
  const missedRow = await web.getByRole("cell", { name: "missed" }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok("History opens the web app signed in as the same account, with the missed pick", /\/history$/.test(web.url()) && missedRow, `${web.url()} ${(await web.locator("main").innerText().catch(() => "")).slice(0, 150)}`);
  await web.close();

  // Math: a grid-in question, handed to the panel through the pendingQuestion hook and explained straight away.
  const mathQuestion = await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const res = await fetch(settings.server + "/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.token}` },
      body: JSON.stringify({ text: "SAT Math grid-in stub: \\(\\frac{3}{17}\\) check question for the extension. Correct Answer: 3/17", source: "paste" }),
    });
    const data = await res.json();
    if (data.question) await chrome.storage.session.set({ pendingQuestion: data.question });
    return data.question ?? data;
  });
  ok("math extraction returns a grid-in question", mathQuestion?.section === "math" && mathQuestion?.format === "spr", JSON.stringify(mathQuestion).slice(0, 160));
  await panel.getByText("What did you enter?").waitFor({ timeout: 60000 });
  ok("math card: answer, bullets, and a box for the grid-in answer", (await panel.getByText("Answer: 3/17").count()) === 1 && (await panel.locator("#spr-input").count()) === 1 && (await panel.locator('[data-testid="key-rules"] li').count()) >= 1);
  await panel.locator("#spr-input").fill("3 1/2");
  await panel.getByRole("alert").filter({ hasText: "Mixed numbers" }).waitFor({ timeout: 5000 }).catch(() => undefined);
  ok("grid-in box rejects a mixed number", (await panel.getByText(/Mixed numbers are not allowed/).count()) === 1 && (await panel.locator("#spr-check").isDisabled()));
  await panel.locator("#spr-input").fill("1/17");
  await panel.locator("#spr-check").click();
  await panel.locator('[data-testid="pick-why"]').waitFor({ timeout: 30000 });
  const mathWhy = await panel.locator('[data-testid="pick-why"]').innerText();
  ok("a wrong grid-in answer gets the right answer and the steps", /Why 1\/17 is wrong/i.test(mathWhy) && /right answer is 3\/17/.test(mathWhy) && (await panel.locator('[data-testid="pick-why"] .steps li').count()) >= 2, mathWhy);
  await panel.locator("#spr-input").fill("3/17");
  await panel.locator("#spr-check").click();
  await panel.locator('[data-testid="pick-why"].good').waitFor({ timeout: 30000 }).catch(() => undefined);
  ok("the right grid-in answer is graded right", (await panel.locator('[data-testid="pick-why"].good').count()) === 1 && (await panel.locator(".card math").count()) > 0);

  await panel.getByRole("button", { name: "Sign out" }).click();
  await panel.locator("#password").waitFor({ timeout: 10000 });
  const cleared = await worker.evaluate(() => chrome.storage.local.get("settings"));
  ok("sign out forgets the token", cleared.settings?.token === null);
} catch (error) {
  ok("script completed", false, error && error.message);
} finally {
  await context.close();
}
const failed = results.filter((r) => !r).length;
console.log(`SUMMARY: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
