#!/usr/bin/env node
/**
 * Electron's npm package is only a downloader. If install.js is skipped
 * (common on npm 10+ / Node 25+), path.txt is missing and `electron .` throws.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const force = process.argv.includes("--force");
const nodeMajor = Number(process.versions.node.split(".")[0]);

function electronRoot() {
  try {
    return path.dirname(require.resolve("electron/package.json"));
  } catch {
    console.error(
      "[huntboard] electron is not installed. Run: npm install"
    );
    process.exit(1);
  }
}

function binaryLooksInstalled(root) {
  const pathTxt = path.join(root, "path.txt");
  if (!fs.existsSync(pathTxt)) return false;
  const rel = fs.readFileSync(pathTxt, "utf8").trim();
  if (!rel) return false;
  return (
    fs.existsSync(path.join(root, "dist", rel)) ||
    fs.existsSync(path.join(root, rel))
  );
}

function download(root) {
  const installJs = path.join(root, "install.js");
  if (!fs.existsSync(installJs)) {
    console.error("[huntboard] electron/install.js missing; reinstall electron.");
    process.exit(1);
  }
  console.log(
    `[huntboard] Downloading Electron ${process.platform}-${process.arch} binary...`
  );
  const result = spawnSync(process.execPath, [installJs], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      // Never skip: a skipped download is exactly this failure mode.
      ELECTRON_SKIP_BINARY_DOWNLOAD: "",
    },
  });
  if (result.status !== 0) {
    console.error(`
[huntboard] Electron binary download failed.

On macOS, from the repo root:

  rm -rf node_modules/electron
  npm install --foreground-scripts

Use Node 20 or 22 LTS (you are on ${process.version}):

  nvm install 22
  nvm use 22

If you are behind a firewall, GitHub releases must be reachable
(electron downloads from github.com/electron/electron/releases).
`);
    process.exit(result.status ?? 1);
  }
}

if (nodeMajor >= 25) {
  console.warn(
    `[huntboard] Node ${process.version} is newer than Electron's usual host range. Prefer Node 22 LTS.`
  );
}

const root = electronRoot();
const pathTxt = path.join(root, "path.txt");
const distDir = path.join(root, "dist");

if (force) {
  fs.rmSync(pathTxt, { force: true });
  fs.rmSync(distDir, { recursive: true, force: true });
}

if (!force && binaryLooksInstalled(root)) {
  process.exit(0);
}

download(root);

if (!binaryLooksInstalled(root)) {
  console.error(
    "[huntboard] Electron still has no binary after install.js. Delete node_modules/electron and run npm install --foreground-scripts."
  );
  process.exit(1);
}

console.log("[huntboard] Electron binary is ready.");
