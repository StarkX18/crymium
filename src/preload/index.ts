import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("huntboard", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("save-settings", settings),
  googleAuthStatus: () => ipcRenderer.invoke("google-auth-status"),
  googleConnect: () => ipcRenderer.invoke("google-connect"),
  googleDisconnect: () => ipcRenderer.invoke("google-disconnect"),
  initSpreadsheet: () => ipcRenderer.invoke("init-spreadsheet"),
  syncSheets: () => ipcRenderer.invoke("sync-sheets"),
  getCaptureScript: () => ipcRenderer.invoke("get-capture-script"),
  saveQuestionBank: (payload: unknown) =>
    ipcRenderer.invoke("save-question-bank", payload),
  suggestMerge: (prompt: string) => ipcRenderer.invoke("suggest-merge", prompt),
  updateTemplate: (templateId: string, body: string) =>
    ipcRenderer.invoke("update-template", templateId, body),
  getCache: () => ipcRenderer.invoke("get-cache"),
  onFieldCaptured: (cb: (payload: unknown) => void) => {
    const handler = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on("field-captured", handler);
    return () => ipcRenderer.removeListener("field-captured", handler);
  },
  onSyncComplete: (cb: (data: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on("sync-complete", handler);
    return () => ipcRenderer.removeListener("sync-complete", handler);
  },
});
