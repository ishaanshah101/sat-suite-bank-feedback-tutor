// Loads the unpacked extension into Chromium and drives the side panel against a running Rulecard server.
// Usage: BASE=http://localhost:3100 node scripts/check-extension.mjs (creates a fresh account each run)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.EMAIL ?? `ext-${Date.now()}@example.com`;
const PASSWORD = process.env.PASSWORD ?? "extension-check-1";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push(!!cond);
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${extra ? " | " + String(extra).slice(0, 200) : ""}`);
};

// Copy the extension and grant all sites up front. Automation cannot click the toolbar icon (which is what grants
// activeTab in real use) or accept the native permission prompt, so the copy carries <all_urls> instead.
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

  // Click path: make the page the active tab of the window, then drive the panel without activating it.
  const origin = new URL(BASE).origin;
  const pageTab = await worker.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    await chrome.tabs.update(tab.id, { active: true });
    return { id: tab.id, windowId: tab.windowId };
  }, origin);
  await panel.getByRole("button", { name: "Capture this tab" }).click();
  const captured = await Promise.race([
    panel.getByText("Which did you pick?").waitFor({ timeout: 60000 }).then(() => "question"),
    panel.locator(".banner.danger").first().waitFor({ timeout: 60000 }).then(async () => "error: " + (await panel.locator(".banner.danger").first().innerText())),
  ]).catch((e) => "timeout: " + e.message.split("\n")[0]);
  ok("capture via captureVisibleTab reached /api/extract and rendered a question", captured === "question" && (await panel.locator(".choice").count()) === 4, captured);
  if (captured !== "question") throw new Error("capture failed: " + captured);

  await panel.locator(".pick", { hasText: /^A$/ }).click();
  await panel.locator("#reasoning").fill("I thought a comma was fine");
  await panel.getByRole("button", { name: "Explain", exact: true }).click();
  await panel.locator(".rule-id").waitFor({ timeout: 60000 });
  const ruleText = await panel.locator(".rule-id").innerText();
  ok("rule card shows the rule id and name", /BND-01/.test(ruleText) && ruleText.includes("·"), ruleText);
  ok("why right / why pick fails / takeaway sections", (await panel.getByText(/Why B is right/).count()) === 1 && (await panel.getByText(/Why A fails/).count()) === 1 && (await panel.getByText("Takeaway").count()) === 1);
  ok("correct choice highlighted", (await panel.locator(".choice.correct").count()) === 1 && (await panel.locator(".choice.picked").count()) === 1);

  await panel.locator("#chat-input").fill("Why not a comma?");
  await panel.getByRole("button", { name: "Send" }).click();
  await panel.locator(".msg.tutor", { hasText: "Stub tutor reply" }).waitFor({ timeout: 60000 });
  ok("chat streams a reply", true);

  await panel.getByRole("button", { name: "Test me" }).click();
  await panel.locator(".choice.selectable").first().waitFor({ timeout: 60000 });
  await panel.locator(".choice.selectable").nth(2).click();
  await panel.locator(".banner.good, .banner.danger").last().waitFor({ timeout: 30000 });
  ok("drill answers and grades", (await panel.locator(".banner.good, .banner.danger").last().innerText()).length > 0);

  // Shortcut path: the service worker stores a capture, the panel picks it up.
  await worker.evaluate(async ({ id, windowId }) => {
    await chrome.tabs.update(id, { active: true });
    const image = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    await chrome.storage.session.set({ pendingCapture: { image, at: Date.now(), tabTitle: "test" } });
  }, pageTab);
  await panel.getByText("Which did you pick?").waitFor({ timeout: 60000 });
  ok("pending capture from the shortcut path is consumed", true);

  // Recent list and the signed-in link into the web app.
  await panel.locator(".recent").first().waitFor({ timeout: 15000 }).catch(() => undefined);
  const recentCount = await panel.locator(".recent").count();
  if (recentCount === 0) {
    // The pending capture left a question open; the list shows once it is cleared, so check the API directly.
    const { token, server } = (await worker.evaluate(() => chrome.storage.local.get("settings"))).settings;
    const res = await worker.evaluate(async ({ token, server }) => (await fetch(server + "/api/attempts?limit=5", { headers: { authorization: `Bearer ${token}` } })).json(), { token, server });
    ok("recent history API returns this account's review", res.attempts?.length === 1 && res.attempts[0].ruleId === "BND-01", JSON.stringify(res).slice(0, 120));
  } else {
    ok("recent list shows the review", recentCount >= 1);
  }
  const opened = context.waitForEvent("page", { timeout: 15000 });
  await panel.getByRole("button", { name: "History", exact: true }).click();
  const web = await opened;
  await web.waitForLoadState("domcontentloaded");
  await web.waitForURL(/\/history$/, { timeout: 15000 }).catch(() => undefined);
  const missedRow = await web.getByRole("cell", { name: "missed" }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok("History opens the web app signed in as the same account", /\/history$/.test(web.url()) && missedRow, `${web.url()} ${(await web.locator("main").innerText().catch(() => "")).slice(0, 150)}`);

  // Math: a grid-in question. The stub model returns a Math grid-in extraction for text that contains
  // "SAT Math"; the question is handed to the panel through the pendingQuestion hook.
  const mathQuestion = await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const res = await fetch(settings.server + "/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.token}` },
      body: JSON.stringify({ text: "SAT Math grid-in stub: \\(\\frac{3}{17}\\) check question for the extension.", source: "paste" }),
    });
    const data = await res.json();
    if (data.question) await chrome.storage.session.set({ pendingQuestion: data.question });
    return data.question ?? data;
  });
  ok("math extraction returns a grid-in question", mathQuestion?.section === "math" && mathQuestion?.format === "spr", JSON.stringify(mathQuestion).slice(0, 160));
  await panel.getByText("What did you enter?").waitFor({ timeout: 15000 });
  ok("panel shows the grid-in pick panel and renders math", (await panel.locator("#spr-input").count()) === 1 && (await panel.locator(".card math").count()) > 0);
  await panel.locator("#spr-input").fill("3 1/2");
  await panel.getByRole("alert").filter({ hasText: "Mixed numbers" }).waitFor({ timeout: 5000 }).catch(() => undefined);
  ok("grid-in input rejects a mixed number and disables Explain", (await panel.getByText(/Mixed numbers are not allowed/).count()) === 1 && (await panel.locator("#explain-button").isDisabled()));
  await panel.locator("#spr-input").fill("3/17");
  await panel.locator("#explain-button").click();
  await panel.locator(".steps").first().waitFor({ timeout: 60000 });
  const mathRule = await panel.locator(".rule-id").innerText();
  ok("math rule card shows a Math rule, steps and the graded grid-in answer", /(LE1|LFN|LE2|SYS|INQ|EQX|NLE|NLF|RAT|PCT|ONE|TWO|PRB|SMP|EVS|ARV|LAT|TRG|CIR|MTH)-\d{2}/.test(mathRule) && (await panel.locator(".spr-result .tag.good").count()) === 1, mathRule);
  await panel.getByRole("button", { name: "Test me" }).click();
  await panel.locator("#drill-spr-input").waitFor({ timeout: 60000 });
  await panel.locator("#drill-spr-input").fill("6");
  await panel.locator("#drill-check").click();
  await panel.locator(".banner.good, .banner.danger").last().waitFor({ timeout: 30000 });
  ok("math grid-in drill checks a typed answer", (await panel.locator(".banner.good").count()) >= 1, await panel.locator(".banner.good, .banner.danger").last().innerText());

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
