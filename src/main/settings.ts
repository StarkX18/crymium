import { saveSettings, loadSettings } from "./config-store.js";
import type { AppSettings } from "../shared/types.js";

/** Merge partial settings from the UI and persist before Google API calls. */
export function persistSettings(partial?: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    ...current,
    ...partial,
    spreadsheetId: (partial?.spreadsheetId ?? current.spreadsheetId).trim(),
    googleClientId: (partial?.googleClientId ?? current.googleClientId).trim(),
    googleClientSecret: (
      partial?.googleClientSecret ?? current.googleClientSecret
    ).trim(),
  };
  saveSettings(next);
  return next;
}
