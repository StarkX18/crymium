const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "main", "inject");
const dest = path.join(__dirname, "..", "dist-main", "main", "inject");

fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}
