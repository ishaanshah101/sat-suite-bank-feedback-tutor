// Makes the 1280x800 Chrome Web Store screenshots in store/: drives the real side panel against BASE,
// then frames each panel shot with a caption. Usage: BASE=http://localhost:3100 node scripts/store-screenshots.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3100";
const source = path.resolve("extension");
const ext = fs.mkdtempSync(path.join(os.tmpdir(), "rulecard-ext-"));
fs.cpSync(source, ext, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
manifest.host_permissions.push("<all_urls>");
fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(manifest));

const launch = { headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else launch.channel = "chromium";
const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "rulecard-shots-")), launch);
fs.mkdirSync("store", { recursive: true });

async function frame(panelPng, title, subtitle, out) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const img = `data:image/png;base64,${fs.readFileSync(panelPng).toString("base64")}`;
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:64px;padding:0 80px;box-sizing:border-box;background:linear-gradient(135deg,#e8eefc,#f7f7f5);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16161a">
    <div style="flex:1"><div style="font-size:15px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#2f5bea">Rulecard</div>
    <h1 style="font-size:46px;line-height:1.1;margin:14px 0 18px;letter-spacing:-.02em">${title}</h1>
    <p style="font-size:21px;line-height:1.45;color:#4b4b52;margin:0">${subtitle}</p></div>
    <img src="${img}" style="height:720px;border-radius:16px;box-shadow:0 20px 50px rgba(20,30,80,.18);border:1px solid #e4e4e0"></body></html>`);
  await page.screenshot({ path: out });
  await page.close();
}

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(worker.url()).host;
  const tabPage = await context.newPage();
  await tabPage.goto(`${BASE}/privacy`);
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.locator("#password").waitFor();
  await panel.getByRole("tab", { name: "Create account" }).click();
  if (BASE !== "https://rulecard.vercel.app") {
    await panel.getByText("Use a different server").click();
    await panel.locator("#server").fill(BASE);
    await panel.getByText("Use a different server").click();
  }
  await panel.locator("#email").fill("you@example.com");
  const shot1 = path.join(os.tmpdir(), "panel-signin.png");
  await panel.screenshot({ path: shot1 });
  await panel.locator("#email").fill(`shots-${Date.now()}@example.com`);
  await panel.locator("#password").fill("screenshot-pass-1");
  await panel.getByRole("button", { name: "Create account", exact: true }).click();
  await panel.getByRole("button", { name: "Capture this tab" }).waitFor({ timeout: 20000 });
  await worker.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    await chrome.tabs.update(tab.id, { active: true });
  }, new URL(BASE).origin);
  await panel.getByRole("button", { name: "Capture this tab" }).click();
  await panel.getByText("Which did you pick?").waitFor({ timeout: 90000 });
  await panel.locator(".pick", { hasText: /^A$/ }).click();
  await panel.locator("#reasoning").fill("I thought a comma was enough");
  const shot2 = path.join(os.tmpdir(), "panel-question.png");
  await panel.screenshot({ path: shot2 });
  await panel.getByRole("button", { name: "Explain", exact: true }).click();
  await panel.locator(".rule-id").waitFor({ timeout: 90000 });
  await panel.locator(".rule-id").scrollIntoViewIfNeeded();
  await panel.evaluate(() => document.querySelector(".rule-id")?.closest(".card")?.scrollIntoView({ block: "start" }));
  const shot3 = path.join(os.tmpdir(), "panel-rule.png");
  await panel.screenshot({ path: shot3 });

  await frame(shot2, "Capture the question you just missed", "Open any SAT Question Bank question, click Capture, and tell Rulecard which answer you picked and why.", "store/screenshot-1-capture.png");
  await frame(shot3, "Get the one rule it tested", "A short rule card: why the answer is right, why your pick fails, and a takeaway. Then ask follow-ups or drill the rule.", "store/screenshot-2-rule.png");
  await frame(shot1, "Your history follows you", "Free account with email and password. Every review is saved, in the extension and on the web app.", "store/screenshot-3-account.png");
  console.log("wrote store/screenshot-*.png");
} finally {
  await context.close();
}
