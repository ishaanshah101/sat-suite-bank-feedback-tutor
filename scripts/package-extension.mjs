// Builds the extension and zips exactly the files Chrome needs into store/rulecard-extension-<version>.zip,
// ready to upload in the Chrome Web Store developer dashboard.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

execFileSync("node", ["scripts/build-extension.mjs"], { stdio: "inherit" });
const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
const files = ["manifest.json", "sidepanel.html", "sidepanel.css", "dist/sidepanel.js", "dist/background.js", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"];
for (const file of files) {
  if (!fs.existsSync(path.join("extension", file))) throw new Error(`missing extension/${file}`);
}
fs.mkdirSync("store", { recursive: true });
for (const old of fs.readdirSync("store").filter((f) => /^rulecard-extension-.*\.zip$/.test(f))) fs.rmSync(path.join("store", old));
const out = path.resolve("store", `rulecard-extension-${manifest.version}.zip`);
execFileSync("zip", ["-X", "-q", out, ...files], { cwd: "extension", stdio: "inherit" });
console.log(`wrote ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
