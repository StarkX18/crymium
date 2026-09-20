import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import type { AppSettings } from "../shared/types.js";

const CONFIG_NAME = "huntboard-config.json";
const TOKEN_NAME = "google-tokens.enc";

function configPath(): string {
  return path.join(app.getPath("userData"), CONFIG_NAME);
}

function tokenPath(): string {
  return path.join(app.getPath("userData"), TOKEN_NAME);
}

const defaultSettings: AppSettings = {
  spreadsheetId: "",
  googleClientId: "",
  googleClientSecret: "",
  llmEnabled: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(settings, null, 2));
}

export interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}

export function loadTokens(): StoredTokens | null {
  try {
    const buf = fs.readFileSync(tokenPath());
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(buf.toString("utf8"));
    }
    const dec = safeStorage.decryptString(buf);
    return JSON.parse(dec);
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  const json = JSON.stringify(tokens);
  fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(tokenPath(), safeStorage.encryptString(json));
  } else {
    fs.writeFileSync(tokenPath(), json);
  }
}

export function clearTokens(): void {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    /* ignore */
  }
}
