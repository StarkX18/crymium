interface HuntboardApi {
  getSettings: () => Promise<{
    spreadsheetId: string;
    googleClientId: string;
    googleClientSecret: string;
    llmEnabled: boolean;
  }>;
  saveSettings: (s: unknown) => Promise<unknown>;
  googleAuthStatus: () => Promise<{ connected: boolean; hasRefresh: boolean }>;
  googleConnect: () => Promise<{ ok: boolean; error?: string }>;
  googleDisconnect: () => Promise<{ ok: boolean }>;
  initSpreadsheet: () => Promise<{ ok: boolean; error?: string }>;
  syncSheets: () => Promise<{ ok: boolean; error?: string }>;
  getCaptureScript: () => Promise<string>;
  saveQuestionBank: (p: unknown) => Promise<{ ok: boolean; error?: string }>;
  suggestMerge: (prompt: string) => Promise<
    Array<{ id: string; prompt_display: string }>
  >;
  updateTemplate: (
    id: string,
    body: string
  ) => Promise<{ ok: boolean; error?: string }>;
  getCache: () => Promise<{
    profile: Record<string, string>;
    templates: Record<string, string>;
    bank: Array<{ id: string; prompt_display: string; match_patterns: string }>;
  }>;
  onFieldCaptured: (cb: (p: FieldCapture) => void) => () => void;
  onSyncComplete: (cb: (data: SyncData) => void) => () => void;
}

interface FieldCapture {
  prompt: string;
  value: string;
  url: string;
  maxLength?: number;
}

interface SyncData {
  profile: Record<string, string>;
  templates: Record<string, string>;
  bank: Array<{ id: string; prompt_display: string; match_patterns: string }>;
  portals: unknown[];
  jobs: unknown[];
}

declare global {
  interface Window {
    huntboard: HuntboardApi;
  }
}

if (!window.huntboard) {
  document.body.innerHTML =
    '<div class="boot-error"><h1>Huntboard failed to start</h1><p>The preload bridge is missing. From the repo root run <code>npm run build</code> then <code>npm start</code>.</p></div>';
  throw new Error("huntboard preload missing");
}

const api = window.huntboard;

const spreadsheetId = document.getElementById(
  "spreadsheetId"
) as HTMLInputElement;
const clientId = document.getElementById("clientId") as HTMLInputElement;
const clientSecret = document.getElementById("clientSecret") as HTMLInputElement;
const authStatus = document.getElementById("authStatus")!;
const careerUrl = document.getElementById("careerUrl") as HTMLInputElement;
const templateBody = document.getElementById("templateBody") as HTMLTextAreaElement;
const bankList = document.getElementById("bankList")!;
const bankCount = document.getElementById("bankCount")!;
const captureDialog = document.getElementById("captureDialog") as HTMLDialogElement;
const capturePrompt = document.getElementById("capturePrompt")!;
const captureAnswer = document.getElementById("captureAnswer") as HTMLTextAreaElement;
const captureMerge = document.getElementById("captureMerge") as HTMLSelectElement;

let pendingCapture: FieldCapture | null = null;
const dismissedPrompts = new Set<string>();

function switchTab(name: string): void {
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-tab") === name);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${name}`);
  });
}

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.getAttribute("data-tab") ?? "setup");
  });
});

async function refreshAuthStatus(): Promise<void> {
  const st = await api.googleAuthStatus();
  authStatus.textContent = st.connected
    ? "Google Sheets: connected"
    : "Google Sheets: not connected";
}

async function loadSettingsIntoForm(): Promise<void> {
  const s = await api.getSettings();
  spreadsheetId.value = s.spreadsheetId;
  clientId.value = s.googleClientId;
  clientSecret.value = s.googleClientSecret;
  await refreshAuthStatus();
}

function renderBank(
  bank: Array<{ id: string; prompt_display: string; match_patterns: string }>
): void {
  bankCount.textContent = `${bank.length} entries`;
  bankList.innerHTML = "";
  for (const row of bank.slice(0, 50)) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="id">${row.id}</span><br>${row.prompt_display.slice(0, 80)}`;
    bankList.appendChild(li);
  }
}

function applySyncData(data: SyncData): void {
  renderBank(data.bank);
  if (data.templates.why_company) {
    templateBody.value = data.templates.why_company;
  }
}

document.getElementById("btnSaveSettings")!.addEventListener("click", async () => {
  await api.saveSettings({
    spreadsheetId: spreadsheetId.value.trim(),
    googleClientId: clientId.value.trim(),
    googleClientSecret: clientSecret.value.trim(),
    llmEnabled: false,
  });
  authStatus.textContent = "Settings saved.";
});

document.getElementById("btnConnect")!.addEventListener("click", async () => {
  const res = await api.googleConnect();
  authStatus.textContent = res.ok
    ? "Connected. Tokens stored in OS keychain when available."
    : `Error: ${res.error}`;
  await refreshAuthStatus();
});

document.getElementById("btnDisconnect")!.addEventListener("click", async () => {
  await api.googleDisconnect();
  await refreshAuthStatus();
});

document.getElementById("btnInitSheet")!.addEventListener("click", async () => {
  const res = await api.initSpreadsheet();
  authStatus.textContent = res.ok ? "Sheet initialized." : `Error: ${res.error}`;
});

document.getElementById("btnSync")!.addEventListener("click", async () => {
  const res = await api.syncSheets();
  authStatus.textContent = res.ok ? "Synced." : `Error: ${res.error}`;
});

type CareerWebview = HTMLElement & {
  src: string;
  executeJavaScript: (code: string) => Promise<unknown>;
};

const careerView = document.getElementById("careerView") as CareerWebview;
const careerForm = document.getElementById("careerForm") as HTMLFormElement;

careerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  let url = careerUrl.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  careerView.src = url;
});

careerView.addEventListener("did-navigate", (e) => {
  const ev = e as Event & { url?: string };
  if (ev.url && !ev.url.startsWith("data:")) careerUrl.value = ev.url;
});

let captureScript = "";
careerView.addEventListener("dom-ready", () => {
  if (!captureScript) return;
  void careerView.executeJavaScript(captureScript).catch(() => {});
});
void api.getCaptureScript().then((script) => {
  captureScript = script;
});

careerView.addEventListener("console-message", (e) => {
  const ev = e as Event & { message?: string };
  const prefix = "__HUNTBOARD_FIELD__:";
  const message = ev.message ?? "";
  if (!message.startsWith(prefix)) return;
  try {
    const payload = JSON.parse(message.slice(prefix.length)) as FieldCapture;
    if (dismissedPrompts.has(payload.prompt)) return;
    void openCaptureDialog(payload);
  } catch {
    /* ignore */
  }
});

document.getElementById("btnSaveTemplate")!.addEventListener("click", async () => {
  const res = await api.updateTemplate("why_company", templateBody.value);
  authStatus.textContent = res.ok ? "Template saved." : `Error: ${res.error}`;
});

async function openCaptureDialog(payload: FieldCapture): Promise<void> {
  pendingCapture = payload;
  capturePrompt.textContent = payload.prompt;
  captureAnswer.value = payload.value;
  captureMerge.innerHTML = '<option value="">— New entry —</option>';
  const suggestions = await api.suggestMerge(payload.prompt);
  for (const s of suggestions) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.id}: ${s.prompt_display.slice(0, 40)}`;
    captureMerge.appendChild(opt);
  }
  captureDialog.showModal();
}

captureDialog.querySelector("form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingCapture) return;
  const mergeId = captureMerge.value || undefined;
  const res = await api.saveQuestionBank({
    prompt: pendingCapture.prompt,
    answer: captureAnswer.value,
    mergeId,
    maxChars: pendingCapture.maxLength,
  });
  if (!res.ok) authStatus.textContent = `Save failed: ${res.error}`;
  captureDialog.close();
  pendingCapture = null;
});

document.getElementById("captureDismiss")!.addEventListener("click", () => {
  if (pendingCapture) dismissedPrompts.add(pendingCapture.prompt);
  captureDialog.close();
  pendingCapture = null;
});

api.onFieldCaptured((payload) => {
  const p = payload as FieldCapture;
  if (dismissedPrompts.has(p.prompt)) return;
  void openCaptureDialog(p);
});

api.onSyncComplete((data) => applySyncData(data as SyncData));

void (async () => {
  await loadSettingsIntoForm();
  const cache = await api.getCache();
  if (cache.bank.length) renderBank(cache.bank);
  if (cache.templates.why_company) templateBody.value = cache.templates.why_company;
  await api.syncSheets();
})();
