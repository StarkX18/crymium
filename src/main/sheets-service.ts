import { google, sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  DEFAULT_PROFILE,
  DEFAULT_TEMPLATES,
  HEADERS,
  TABS,
} from "../shared/sheet-schema.js";
import type { AppSettings } from "../shared/types.js";
import type { StoredTokens } from "./config-store.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function createOAuthClient(settings: AppSettings): OAuth2Client {
  const redirectUri = "http://127.0.0.1:42817/oauth2callback";
  return new google.auth.OAuth2(
    settings.googleClientId,
    settings.googleClientSecret,
    redirectUri
  );
}

export function getAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCode(
  client: OAuth2Client,
  code: string
): Promise<StoredTokens> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return tokens as StoredTokens;
}

export function applyTokens(
  client: OAuth2Client,
  tokens: StoredTokens
): void {
  client.setCredentials(tokens);
}

export async function persistClientTokens(
  client: OAuth2Client,
  save: (tokens: StoredTokens) => void
): Promise<void> {
  const creds = client.credentials;
  if (creds.access_token || creds.refresh_token) {
    save(creds as StoredTokens);
  }
}

export async function ensureAuthorized(
  client: OAuth2Client,
  tokens: StoredTokens | null,
  save?: (tokens: StoredTokens) => void
): Promise<boolean> {
  if (!tokens?.refresh_token && !tokens?.access_token) return false;
  client.setCredentials(tokens);
  try {
    await client.getAccessToken();
    if (save) await persistClientTokens(client, save);
    return true;
  } catch {
    return false;
  }
}

export function formatSheetsError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Unable to parse range|Unable to open spreadsheet|not found/i.test(msg)) {
    return "Sheet tabs missing — click Initialize tabs & defaults first.";
  }
  if (/404|Requested entity was not found/i.test(msg)) {
    return "Spreadsheet not found — check the Spreadsheet ID from the URL.";
  }
  if (/403|permission|PERMISSION_DENIED/i.test(msg)) {
    return "No access to that spreadsheet — sign in with the Google account that owns the sheet.";
  }
  if (/redirect_uri_mismatch/i.test(msg)) {
    return "OAuth redirect mismatch — use a Desktop client, or add http://127.0.0.1:42817/oauth2callback to your Web client.";
  }
  if (/invalid_client|invalid_grant/i.test(msg)) {
    return "Invalid OAuth client ID/secret — check Google Cloud credentials and Save settings.";
  }
  return msg;
}

function sheetsApi(client: OAuth2Client): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: client });
}

async function tabExists(
  api: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string
): Promise<boolean> {
  const meta = await api.spreadsheets.get({ spreadsheetId });
  return (
    meta.data.sheets?.some((s) => s.properties?.title === title) ?? false
  );
}

async function addTab(
  api: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string
): Promise<void> {
  await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
}

export async function initializeSpreadsheet(
  client: OAuth2Client,
  spreadsheetId: string
): Promise<void> {
  const api = sheetsApi(client);

  for (const [tabKey, tabName] of Object.entries(TABS)) {
    if (!(await tabExists(api, spreadsheetId, tabName))) {
      await addTab(api, spreadsheetId, tabName);
    }
    const headers = HEADERS[tabName];
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }

  const existingProfile = await readRange(
    client,
    spreadsheetId,
    `${TABS.profile}!A2:A`
  );
  if (existingProfile.length === 0) {
    const profileRows = Object.entries(DEFAULT_PROFILE).map(([key, value]) => [
      key,
      value,
      new Date().toISOString(),
    ]);
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `${TABS.profile}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: profileRows },
    });
  }

  const existingTemplates = await readRange(
    client,
    spreadsheetId,
    `${TABS.templates}!A2:A`
  );
  if (existingTemplates.length === 0) {
    const templateRows = DEFAULT_TEMPLATES.map((t) => [
      t.template_id,
      t.name,
      t.body,
      t.slots,
      t.version,
      t.updated_at || new Date().toISOString(),
    ]);
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `${TABS.templates}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: templateRows },
    });
  }
}

export async function readRange(
  client: OAuth2Client,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const api = sheetsApi(client);
  const res = await api.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values as string[][]) ?? [];
}

export async function syncAllData(
  client: OAuth2Client,
  spreadsheetId: string
): Promise<{
  profile: Record<string, string>;
  templates: Map<string, string>;
  bank: import("../shared/resolver.js").QuestionBankRow[];
  portals: Record<string, string>[];
  jobs: Record<string, string>[];
}> {
  const profileRows = await readRange(
    client,
    spreadsheetId,
    `${TABS.profile}!A2:C`
  );
  const profile: Record<string, string> = {};
  for (const row of profileRows) {
    if (row[0]) profile[row[0]] = row[1] ?? "";
  }

  const templateRows = await readRange(
    client,
    spreadsheetId,
    `${TABS.templates}!A2:F`
  );
  const templates = new Map<string, string>();
  for (const row of templateRows) {
    if (row[0] && row[2]) templates.set(row[0], row[2]);
  }

  const bankRows = await readRange(
    client,
    spreadsheetId,
    `${TABS.questionBank}!A2:I`
  );
  const bank = bankRows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      prompt_display: r[1] ?? "",
      match_patterns: r[2] ?? "",
      answer: r[3] ?? "",
      answer_type: r[4] ?? "narrative",
      tags: r[5] ?? "",
      max_chars: r[6] ?? "",
    }));

  const portalRows = await readRange(
    client,
    spreadsheetId,
    `${TABS.portals}!A2:I`
  );
  const portals = portalRows.filter((r) => r[0]).map((r) => ({
    portal_id: r[0],
    base_url: r[1] ?? "",
    probe_url: r[2] ?? "",
    session_class: r[3] ?? "",
    adapter: r[4] ?? "",
    schedule_cron: r[5] ?? "",
    schedule_enabled: r[6] ?? "",
    last_probe_at: r[7] ?? "",
    last_probe_result: r[8] ?? "",
  }));

  const jobRows = await readRange(client, spreadsheetId, `${TABS.jobs}!A2:J`);
  const jobs = jobRows.filter((r) => r[0]).map((r) => ({
    job_id: r[0],
    portal_id: r[1] ?? "",
    title: r[2] ?? "",
    job_url: r[3] ?? "",
    status: r[4] ?? "",
    scheduled_for: r[5] ?? "",
    retry_after: r[6] ?? "",
    last_error: r[7] ?? "",
    attempt_count: r[8] ?? "",
    updated_at: r[9] ?? "",
  }));

  return { profile, templates, bank, portals, jobs };
}

export async function appendQuestionBankRow(
  client: OAuth2Client,
  spreadsheetId: string,
  row: string[]
): Promise<void> {
  const api = sheetsApi(client);
  await api.spreadsheets.values.append({
    spreadsheetId,
    range: `${TABS.questionBank}!A2`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

export async function appendCaptureLog(
  client: OAuth2Client,
  spreadsheetId: string,
  row: string[]
): Promise<void> {
  const api = sheetsApi(client);
  await api.spreadsheets.values.append({
    spreadsheetId,
    range: `${TABS.captureLog}!A2`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

export async function updateTemplate(
  client: OAuth2Client,
  spreadsheetId: string,
  templateId: string,
  body: string,
  version: number
): Promise<void> {
  const rows = await readRange(
    client,
    spreadsheetId,
    `${TABS.templates}!A2:F`
  );
  const idx = rows.findIndex((r) => r[0] === templateId);
  if (idx < 0) throw new Error(`Template ${templateId} not found`);
  const rowNum = idx + 2;
  const api = sheetsApi(client);
  await api.spreadsheets.values.update({
    spreadsheetId,
    range: `${TABS.templates}!C${rowNum}:E${rowNum}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[body, rows[idx][3] ?? "", String(version)]],
    },
  });
  await api.spreadsheets.values.update({
    spreadsheetId,
    range: `${TABS.templates}!F${rowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [[new Date().toISOString()]] },
  });
}
