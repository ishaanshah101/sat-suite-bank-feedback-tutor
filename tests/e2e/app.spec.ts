import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-password-123";
let counter = 0;
const newEmail = () => `student${Date.now()}-${counter++}@example.com`;
const PASTED = `Question ID: 0badf00d
The study ended in 2019 _____ the results were published a year later.
Which choice completes the text so that it conforms to the conventions of Standard English?
A. 2019, the
B. 2019; the
C. 2019 the
D. 2019, and the
Correct Answer: B`;

/** Create a fresh account through the sign-up form and land on the review page. */
async function signUp(page: Page, email = newEmail()) {
  await page.goto("/signin");
  await expect(async () => {
    await page.getByRole("tab", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL("**/");
  await page.waitForLoadState("networkidle");
  return email;
}

/** Dev-mode hydration can lag; keep clicking the tab until its panel renders. */
async function openTab(page: Page, tab: string, panelTestId: string) {
  await expect(async () => {
    await page.getByTestId(tab).click();
    await expect(page.getByTestId(panelTestId)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test("signed-out pages redirect to /signin and APIs return 401", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/unlock");
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  const res = await request.get("/api/health");
  expect(res.status()).toBe(401);
  const ping = await request.get("/api/ping");
  expect(ping.status()).toBe(200);
  expect(await ping.json()).toMatchObject({ ok: true, db: true, ai: true });
});

test("create an account, sign out, wrong password errors, right password signs in", async ({ page }) => {
  const email = await signUp(page);
  await expect(page.getByTestId("input-strip")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByTestId("account-email")).toHaveText(email);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("auth-error")).toContainText("do not match");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("input-strip")).toBeVisible();
});

test("each account sees only its own history", async ({ browser }) => {
  test.setTimeout(90_000);
  const first = await browser.newContext();
  const a = await first.newPage();
  await signUp(a);
  const extracted = await a.request.post("/api/extract", { data: { text: PASTED, source: "paste" } });
  const { question } = (await extracted.json()) as { question: { id: string } };
  const explained = await a.request.post("/api/explain", { data: { questionId: question.id, picked: "A", reasoning: null } });
  const { attemptId } = (await explained.json()) as { attemptId: string };

  const second = await browser.newContext();
  const b = await second.newPage();
  await signUp(b);
  await b.goto("/history");
  await expect(b.getByRole("cell", { name: "missed" })).toHaveCount(0);
  const peek = await b.request.post("/api/drill", { data: { attemptId } });
  expect(peek.status()).toBe(404);
  await first.close();
  await second.close();
});

test("paste, explain, chat, test me, history and rules", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await openTab(page, "tab-paste", "paste-textarea");
  await page.getByTestId("paste-textarea").fill(PASTED);
  await page.getByTestId("paste-submit").click();
  await expect(page.getByText("Which choice completes the text so that it conforms")).toBeVisible();
  await expect(page.getByTestId("pick-panel")).toBeVisible();

  await page.getByTestId("pick-A").click();
  await page.getByTestId("reasoning-input").fill("I thought a comma was fine");
  await page.getByTestId("explain-button").click();
  const card = page.getByTestId("rule-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("BND-01");
  await expect(card).toContainText("Why B is right");
  await expect(card).toContainText("Why A fails");
  await expect(card).toContainText("Takeaway");

  await page.getByTestId("chat-input").fill("Why not a comma?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("chat-panel")).toContainText("Stub tutor reply", { timeout: 30_000 });

  await page.getByRole("button", { name: "Test me" }).click();
  const drill = page.getByTestId("drill-panel");
  await expect(drill).toBeVisible({ timeout: 30_000 });
  await drill.getByRole("button", { name: /^C\./ }).click();
  await expect(page.getByTestId("drill-result")).toContainText("Right.");

  await page.goto("/history");
  await expect(page.getByRole("cell", { name: "missed" })).toBeVisible();
  await page.getByRole("link", { name: /\w{3} \d+/ }).first().click();
  await expect(page.getByTestId("rule-card")).toBeVisible();
  await expect(page.getByTestId("chat-panel")).toContainText("Why not a comma?");

  await page.goto("/rules");
  await expect(page.getByText("missed 1 time").first()).toBeVisible();
  await expect(page.locator("#BND-01")).toBeVisible();
});

test("PDF export parses in the browser and opens a question", async ({ page }) => {
  await signUp(page);
  await openTab(page, "tab-pdf", "pdf-panel");
  await page.getByTestId("pdf-input").setInputFiles(path.join(import.meta.dirname, "..", "fixtures", "qb-export.pdf"));
  const list = page.getByTestId("pdf-list");
  await expect(list).toBeVisible({ timeout: 60_000 });
  await expect(list).toContainText("2 questions parsed from 2 pages");
  await list.getByRole("button", { name: /960dec02/ }).click();
  await expect(page.getByText("A recent study of coastal towns")).toBeVisible();
  await expect(page.getByTestId("pick-panel")).toBeVisible();
});

test("health and cron endpoints", async ({ page, request }) => {
  await signUp(page);
  const health = await page.request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.db.ok).toBe(true);
  expect(body.ai.stub).toBe(true);
  const unauthorized = await request.get("/api/cron/keepalive");
  expect(unauthorized.status()).toBe(401);
  const authorized = await request.get("/api/cron/keepalive", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(authorized.status()).toBe(200);
  await page.goto("/health");
  await expect(page.getByText("Database reachable")).toBeVisible();
});

test("browser extension: token endpoint, bearer auth and CORS for extension origins", async ({ request }) => {
  const origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
  const preflight = await request.fetch("/api/health", {
    method: "OPTIONS",
    headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" },
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()["access-control-allow-origin"]).toBe(origin);
  expect(preflight.headers()["access-control-allow-headers"]).toContain("authorization");

  const email = newEmail();
  const created = await request.post("/api/auth/signup", { data: { email, password: PASSWORD }, headers: { origin } });
  expect(created.status()).toBe(200);
  expect(created.headers()["set-cookie"]).toBeUndefined();

  const wrong = await request.post("/api/auth/signin", { data: { email, password: "nope-nope" }, headers: { origin } });
  expect(wrong.status()).toBe(401);
  expect(wrong.headers()["access-control-allow-origin"]).toBe(origin);

  const issued = await request.post("/api/auth/signin", { data: { email, password: PASSWORD }, headers: { origin } });
  expect(issued.status()).toBe(200);
  const { token, user } = (await issued.json()) as { token: string; user: { email: string } };
  expect(user.email).toBe(email);
  const me = await request.get("/api/me", { headers: { origin, authorization: `Bearer ${token}` } });
  expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email);
  expect(token.split(".")).toHaveLength(3);

  const denied = await request.get("/api/health", { headers: { origin, authorization: "Bearer not-a-token" } });
  expect(denied.status()).toBe(401);

  const allowed = await request.get("/api/health", { headers: { origin, authorization: `Bearer ${token}` } });
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()["access-control-allow-origin"]).toBe(origin);
  const body = (await allowed.json()) as { db: { ok: boolean } };
  expect(body.db.ok).toBe(true);

  const extracted = await request.post("/api/extract", { data: { text: PASTED, source: "paste" }, headers: { origin, authorization: `Bearer ${token}` } });
  expect(extracted.status()).toBe(200);
  const { question } = (await extracted.json()) as { question: { id: string; correct: string | null } };
  const explained = await request.post("/api/explain", {
    data: { questionId: question.id, picked: "A", reasoning: "extension test" },
    headers: { origin, authorization: `Bearer ${token}` },
  });
  expect(explained.status()).toBe(200);
  const card = (await explained.json()) as { attemptId: string; rule: { id: string; name: string | null } };
  expect(card.rule.id).toBe("BND-01");
  expect(card.rule.name).toBeTruthy();

  const chat = await request.post("/api/chat", {
    data: { attemptId: card.attemptId, messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Why not a comma?" }] }] },
    headers: { origin, authorization: `Bearer ${token}` },
  });
  expect(chat.status()).toBe(200);
  expect(await chat.text()).toContain("text-delta");
});
