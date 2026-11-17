// Rulecard Helper: a floating panel in the top corner of the Mac screen, like a desktop AI assistant.
// Press Option+Shift+Space (or the button) and it looks at the screen you are on, finds the SAT or ACT
// question there and answers it, checked twice. Option+Space shows or hides the panel.
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, screen, shell, systemPreferences, Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import { chat, signIn, signOut, solveStream, type ChatTurn, type QuestionContext } from "./api";

const DEFAULT_SERVER = "https://rulecard.vercel.app";
const SHORTCUTS = { toggle: "Alt+Space", solve: "Alt+Shift+Space" } as const;
const PANEL = { width: 440, height: 660, margin: 14 };

interface Settings {
  server: string;
  email: string | null;
  /** The session token, encrypted with the macOS keychain when available. */
  token: string | null;
  tokenEncrypted: boolean;
}

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    return { server: raw.server || DEFAULT_SERVER, email: raw.email ?? null, token: raw.token ?? null, tokenEncrypted: Boolean(raw.tokenEncrypted) };
  } catch {
    return { server: DEFAULT_SERVER, email: null, token: null, tokenEncrypted: false };
  }
}

function saveSettings(next: Settings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

let settings: Settings;

function token(): string | null {
  if (!settings.token) return null;
  if (!settings.tokenEncrypted) return settings.token;
  try {
    return safeStorage.decryptString(Buffer.from(settings.token, "base64"));
  } catch {
    return null;
  }
}

function storeToken(email: string, value: string | null): void {
  const encrypt = value !== null && safeStorage.isEncryptionAvailable();
  settings = {
    ...settings,
    email: value ? email : null,
    token: value === null ? null : encrypt ? safeStorage.encryptString(value).toString("base64") : value,
    tokenEncrypted: encrypt,
  };
  saveSettings(settings);
}

let panel: BrowserWindow | null = null;
let tray: Tray | null = null;
const registered: Record<keyof typeof SHORTCUTS, boolean> = { toggle: false, solve: false };

const send = (channel: string, payload: unknown) => panel?.webContents.send(channel, payload);

/** The panel sits in the top-right corner of the screen the pointer is on. */
function placePanel(win: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const [w] = win.getSize();
  win.setPosition(Math.round(area.x + area.width - w - PANEL.margin), Math.round(area.y + PANEL.margin));
}

function createPanel(): BrowserWindow {
  const win = new BrowserWindow({
    width: PANEL.width,
    height: PANEL.height,
    minWidth: 360,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Nothing in the panel navigates or opens windows; links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadFile(path.join(__dirname, "index.html"));
  win.on("closed", () => {
    panel = null;
  });
  return win;
}

function showPanel(): void {
  if (!panel) panel = createPanel();
  placePanel(panel);
  panel.show();
  panel.focus();
}

function togglePanel(): void {
  if (panel?.isVisible() && panel.isFocused()) panel.hide();
  else showPanel();
}

function screenAccess(): string {
  return process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "granted";
}

/**
 * One screenshot of the screen the pointer is on. The panel fades out for a moment so it is not in the shot.
 * macOS asks for Screen Recording permission the first time; until it is granted the shot is blank.
 */
async function captureScreen(): Promise<string> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const scale = display.scaleFactor || 1;
  const long = Math.max(display.size.width, display.size.height) * scale;
  const fit = Math.min(1, 2400 / long);
  const size = { width: Math.round(display.size.width * scale * fit), height: Math.round(display.size.height * scale * fit) };
  const wasVisible = Boolean(panel?.isVisible());
  if (wasVisible) panel!.setOpacity(0);
  try {
    await new Promise((resolve) => setTimeout(resolve, 140));
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error("no-screen");
    // A long edge of 1600 px keeps text sharp for the model and the upload small.
    let image = source.thumbnail;
    const { width, height } = image.getSize();
    const shrink = Math.min(1, 1600 / Math.max(width, height));
    if (shrink < 1) image = image.resize({ width: Math.round(width * shrink), height: Math.round(height * shrink), quality: "best" });
    return `data:image/jpeg;base64,${image.toJPEG(90).toString("base64")}`;
  } finally {
    if (wasVisible) panel?.setOpacity(1);
  }
}

let solving = false;

/** Capture the screen and stream the careful answer to the panel. */
async function solveScreen(): Promise<void> {
  if (solving) return;
  showPanel();
  const auth = token();
  if (!auth) {
    send("helper:event", { type: "signed-out" });
    return;
  }
  if (screenAccess() !== "granted" && screenAccess() !== "not-determined") {
    send("helper:event", { type: "needs-permission" });
    return;
  }
  solving = true;
  try {
    send("helper:event", { type: "capturing" });
    let image: string;
    try {
      image = await captureScreen();
    } catch {
      send("helper:event", { type: screenAccess() === "granted" ? "error" : "needs-permission", error: "Rulecard Helper could not see the screen." });
      return;
    }
    if (screenAccess() !== "granted" && process.platform === "darwin") {
      // The first capture triggers macOS's permission prompt; the shot itself only shows the desktop.
      send("helper:event", { type: "needs-permission" });
      return;
    }
    await solveStream(settings.server, auth, image, (event) => {
      if (event.type === "error" && event.status === 401) {
        storeToken("", null);
        send("helper:event", { type: "signed-out" });
        return;
      }
      send("helper:event", event);
    });
  } catch (error) {
    send("helper:event", { type: "error", error: error instanceof Error ? error.message : "Something went wrong. Try again." });
  } finally {
    solving = false;
  }
}

function registerShortcuts(): void {
  registered.toggle = globalShortcut.register(SHORTCUTS.toggle, togglePanel);
  registered.solve = globalShortcut.register(SHORTCUTS.solve, () => void solveScreen());
}

function buildTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Rulecard Helper");
  const menu = () =>
    Menu.buildFromTemplate([
      { label: "Show Rulecard Helper", accelerator: registered.toggle ? "Alt+Space" : undefined, click: showPanel },
      { label: "Answer the question on my screen", accelerator: registered.solve ? "Alt+Shift+Space" : undefined, click: () => void solveScreen() },
      { type: "separator" },
      { label: "Open at login", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
      { label: settings.email ? `Sign out (${settings.email})` : "Not signed in", enabled: Boolean(settings.email), click: () => void doSignOut() },
      { type: "separator" },
      { label: "Quit Rulecard Helper", role: "quit" },
    ]);
  tray.on("click", () => tray?.popUpContextMenu(menu()));
  tray.on("right-click", () => tray?.popUpContextMenu(menu()));
}

async function doSignOut(): Promise<void> {
  const auth = token();
  storeToken("", null);
  if (auth) await signOut(settings.server, auth).catch(() => undefined);
  send("helper:event", { type: "signed-out" });
}

/** Only the panel's own page may call the main process. */
function fromPanel(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(panel && event.sender === panel.webContents && event.senderFrame?.url.startsWith("file://"));
}

function wireIpc(): void {
  const handle = (channel: string, fn: (...args: never[]) => unknown) =>
    ipcMain.handle(channel, async (event, ...args) => {
      if (!fromPanel(event)) throw new Error("Not allowed");
      return (fn as (...a: unknown[]) => unknown)(...args);
    });
  handle("helper:state", () => ({
    signedIn: Boolean(token()),
    email: settings.email,
    server: settings.server,
    shortcuts: { toggle: registered.toggle ? "⌥Space" : null, solve: registered.solve ? "⌥⇧Space" : null },
    screenAccess: screenAccess(),
    platform: process.platform,
    version: app.getVersion(),
  }));
  handle("helper:sign-in", async (mode: unknown, email: unknown, password: unknown, server: unknown) => {
    const base = typeof server === "string" && /^https:\/\/[^\s/]+$/.test(server.trim()) ? server.trim() : DEFAULT_SERVER;
    const result = await signIn(base, mode === "signup" ? "signup" : "signin", String(email ?? ""), String(password ?? ""));
    settings = { ...settings, server: base };
    storeToken(result.user.email, result.token);
    return { email: result.user.email };
  });
  handle("helper:sign-out", () => doSignOut());
  handle("helper:solve", () => solveScreen());
  handle("helper:chat", async (question: unknown, turns: unknown) => {
    const auth = token();
    if (!auth) throw new Error("Sign in first.");
    return chat(settings.server, auth, question as QuestionContext | null, turns as ChatTurn[]);
  });
  handle("helper:open-screen-settings", () => shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"));
  handle("helper:relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
  handle("helper:hide", () => panel?.hide());
  handle("helper:open-web", () => shell.openExternal(settings.server));
}

// One copy at a time: opening the app again just shows the panel.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showPanel);
  app.whenReady().then(() => {
    settings = loadSettings();
    if (process.platform === "darwin") app.dock?.hide();
    wireIpc();
    registerShortcuts();
    buildTray();
    showPanel();
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  // A menu bar app keeps running with its panel hidden.
  app.on("window-all-closed", () => undefined);
}
