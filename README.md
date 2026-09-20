# Huntboard

Desktop job-hunt browser with a **persistent career session** (right pane) and **Google Sheets** as the system of record for profile, templates, question bank, portals, and job queue.

## What’s in this MVP

- Electron app: sidebar (setup, browse, templates, bank) + `BrowserView` on partition `persist:huntboard-careers`
- Google OAuth (opens your system browser) → refresh token stored with Electron `safeStorage` when available
- Initialize spreadsheet tabs: `Profile`, `Templates`, `QuestionBank`, `Portals`, `Jobs`, `CaptureLog`
- Sync profile / templates / bank from Sheets
- Editable `why_company` template → writes back to Sheets
- Injected capture script: when you finish editing a field on a career page, prompts **Save for similar questions?** → appends to `QuestionBank` + `CaptureLog`
- Answer resolver (profile → bank patterns → template) in `src/shared/resolver.ts` (used by future adapters)
- Scheduler hook (stub) for daily portal runs

## Google Cloud setup

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Enable Google Sheets API**.
2. **Credentials** → Create **OAuth client ID** → type **Desktop app**.
3. Add authorized redirect URI: `http://127.0.0.1:42817/oauth2callback` (the app listens locally for the code).
4. Copy Client ID and Client secret into Huntboard **Setup**.
5. Create a blank Google Sheet, copy the ID from  
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`  
   paste into Setup → **Initialize tabs & defaults** → **Connect Google** → **Sync**.

Share the sheet only with your account (it will contain application answers).

## Run locally

Use **Node 20 or 22 LTS** (not Node 25/26). Electron downloads a platform binary during `npm install`; that step is what failed if you see `Electron failed to install correctly`.

```bash
nvm install 22
nvm use 22
npm install
npm run build
npm start
```

Hot reload (Vite) — only if you need it:

```bash
npm run dev
```

If you see a **blank white window**, you were loading Vite while it was not running, or a career overlay covered the UI. Use `npm start` after `npm run build`.

```bash
npm run build
npm start
```

### Electron failed to install correctly

The `electron` npm package is a downloader. If `install.js` is skipped (npm 10+ backgrounds scripts; Node 26 is untested), `node_modules/electron` has no Chromium binary.

```bash
nvm use 22
rm -rf node_modules/electron
npm install --foreground-scripts
# or, if electron is already listed in node_modules:
npm run fix:electron
npm run dev
```

You need network access to GitHub releases (`github.com/electron/electron/releases`). LinkedIn Easy Apply is out of scope for now.

## Sheet columns

See `src/shared/sheet-schema.ts` for headers. Edit `Profile` and `QuestionBank` directly in Sheets; use **Sync** in the app to refresh cache.

## Next steps (not built yet)

- Portal adapters (`checkAuth`, `listJobs`, `fillApplication`)
- Cron scheduler reading `Portals.schedule_cron`
- Optional LLM rewrite layer (off by default)
- Merge-into-existing bank row (currently appends; merge suggestions are UI-only)
