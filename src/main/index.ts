import {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  session,
} from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  loadSettings,
  saveSettings,
  loadTokens,
  saveTokens,
  clearTokens,
} from "./config-store.js";
import {
  createOAuthClient,
  getAuthUrl,
  ensureAuthorized,
  applyTokens,
  initializeSpreadsheet,
  syncAllData,
  appendQuestionBankRow,
  appendCaptureLog,
  updateTemplate,
} from "./sheets-service.js";
import { startOAuthFlow } from "./oauth-server.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import {
  draftMatchPattern,
  suggestBankMerge,
} from "../shared/resolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let careerView: BrowserView | null = null;

let cache = {
  profile: {} as Record<string, string>,
  templates: new Map<string, string>(),
  bank: [] as import("../shared/resolver.js").QuestionBankRow[],
};

const CAREER_PARTITION = "persist:huntboard-careers";

function getOAuthClient() {
  const settings = loadSettings();
  return createOAuthClient(settings);
}

function preloadPath(): string {
  return path.join(__dirname, "../../dist-preload/preload/index.js");
}

function injectCaptureScript(view: BrowserView): void {
  const scriptPath = isDev
    ? path.join(app.getAppPath(), "src/main/inject/capture-listener.js")
    : path.join(__dirname, "inject/capture-listener.js");
  const script = fs.readFileSync(scriptPath, "utf8");
  view.webContents.executeJavaScript(script).catch(() => {});
}

function layoutViews(): void {
  if (!mainWindow || !careerView) return;
  const [w, h] = mainWindow.getContentSize();
  const sidebar = 380;
  careerView.setBounds({ x: sidebar, y: 0, width: w - sidebar, height: h });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Huntboard",
  });

  careerView = new BrowserView({
    webPreferences: {
      partition: CAREER_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setBrowserView(careerView);
  layoutViews();
  mainWindow.on("resize", layoutViews);

  careerView.webContents.setWindowOpenHandler(({ url }) => {
    careerView?.webContents.loadURL(url);
    return { action: "deny" };
  });

  careerView.webContents.on("did-finish-load", () => {
    injectCaptureScript(careerView!);
  });

  careerView.webContents.on("console-message", (_e, _level, message) => {
    const prefix = "__HUNTBOARD_FIELD__:";
    if (!message.startsWith(prefix)) return;
    try {
      const payload = JSON.parse(message.slice(prefix.length));
      mainWindow?.webContents.send("field-captured", payload);
    } catch {
      /* ignore */
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../../dist-renderer/index.html")
    );
  }

  careerView.webContents.loadURL("about:blank");
}

async function refreshCacheFromSheets(): Promise<void> {
  const settings = loadSettings();
  if (!settings.spreadsheetId) return;
  const client = getOAuthClient();
  const tokens = loadTokens();
  if (!(await ensureAuthorized(client, tokens))) return;
  const data = await syncAllData(client, settings.spreadsheetId);
  cache = {
    profile: data.profile,
    templates: data.templates,
    bank: data.bank,
  };
  mainWindow?.webContents.send("sync-complete", {
    profile: data.profile,
    templates: Object.fromEntries(data.templates),
    bank: data.bank,
    portals: data.portals,
    jobs: data.jobs,
  });
}

function registerIpc(): void {
  ipcMain.handle("get-settings", () => loadSettings());
  ipcMain.handle("save-settings", (_e, settings) => {
    saveSettings(settings);
    return loadSettings();
  });

  ipcMain.handle("google-auth-status", async () => {
    const tokens = loadTokens();
    const client = getOAuthClient();
    const ok = await ensureAuthorized(client, tokens);
    return { connected: ok, hasRefresh: !!tokens?.refresh_token };
  });

  ipcMain.handle("google-connect", async () => {
    const settings = loadSettings();
    if (!settings.googleClientId || !settings.googleClientSecret) {
      return { ok: false, error: "Add Google OAuth client ID and secret in Settings." };
    }
    const client = getOAuthClient();
    const authUrl = getAuthUrl(client);
    const result = await startOAuthFlow(client, authUrl);
    if (result.error) return { ok: false, error: result.error };
    saveTokens(result.tokens);
    applyTokens(client, result.tokens);
    return { ok: true };
  });

  ipcMain.handle("google-disconnect", () => {
    clearTokens();
    return { ok: true };
  });

  ipcMain.handle("init-spreadsheet", async () => {
    const settings = loadSettings();
    if (!settings.spreadsheetId) {
      return { ok: false, error: "Set spreadsheet ID first." };
    }
    const client = getOAuthClient();
    const tokens = loadTokens();
    if (!(await ensureAuthorized(client, tokens))) {
      return { ok: false, error: "Connect Google first." };
    }
    await initializeSpreadsheet(client, settings.spreadsheetId);
    await refreshCacheFromSheets();
    return { ok: true };
  });

  ipcMain.handle("sync-sheets", async () => {
    try {
      await refreshCacheFromSheets();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("career-navigate", (_e, url: string) => {
    careerView?.webContents.loadURL(url);
    return { ok: true };
  });

  ipcMain.handle("save-question-bank", async (_e, payload) => {
    const settings = loadSettings();
    const client = getOAuthClient();
    const tokens = loadTokens();
    if (!(await ensureAuthorized(client, tokens))) {
      return { ok: false, error: "Not connected to Google." };
    }
    const id = `q_${Date.now()}`;
    const pattern =
      payload.pattern || draftMatchPattern(payload.prompt);
    const row = [
      payload.mergeId || id,
      payload.prompt,
      payload.mergeId
        ? `${pattern}|${cache.bank.find((b) => b.id === payload.mergeId)?.match_patterns ?? ""}`
        : pattern,
      payload.answer,
      payload.answerType || "narrative",
      payload.tags || "",
      payload.maxChars || "",
      "capture",
      new Date().toISOString(),
    ];
    await appendQuestionBankRow(client, settings.spreadsheetId, row);
    await appendCaptureLog(client, settings.spreadsheetId, [
      new Date().toISOString(),
      payload.portalId || "",
      payload.prompt,
      payload.mergeId || id,
      payload.mergeId ? "merge" : "new",
      pattern,
    ]);
    await refreshCacheFromSheets();
    return { ok: true, id };
  });

  ipcMain.handle("suggest-merge", (_e, prompt: string) => {
    return suggestBankMerge(prompt, cache.bank);
  });

  ipcMain.handle("update-template", async (_e, templateId: string, body: string) => {
    const settings = loadSettings();
    const client = getOAuthClient();
    const tokens = loadTokens();
    if (!(await ensureAuthorized(client, tokens))) {
      return { ok: false, error: "Not connected to Google." };
    }
    const version = (cache.templates.has(templateId) ? 2 : 1) + 1;
    await updateTemplate(
      client,
      settings.spreadsheetId,
      templateId,
      body,
      version
    );
    await refreshCacheFromSheets();
    return { ok: true };
  });

  ipcMain.handle("get-cache", () => ({
    profile: cache.profile,
    templates: Object.fromEntries(cache.templates),
    bank: cache.bank,
  }));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  startScheduler(async () => {
    /* TODO: probe portals from Sheets + run adapters */
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopScheduler();
  if (process.platform !== "darwin") app.quit();
});
