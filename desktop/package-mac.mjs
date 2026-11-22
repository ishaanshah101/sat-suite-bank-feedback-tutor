// Builds Rulecard Helper for Apple silicon Macs (M1 and later) and zips the app, keeping the framework symlinks.
// Run from the repo root: node desktop/package-mac.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const run = (cmd, args, cwd = here) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const version = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8")).version;
const release = path.join(here, "release");

run("node", [path.join(here, "build.mjs")]);
fs.rmSync(release, { recursive: true, force: true });
run("npx", ["electron-builder", "--mac", "dir", "--arm64"]);
for (const [dir, label] of [["mac-arm64", "apple-silicon"]]) {
  const zip = path.join(release, `Rulecard-Helper-${version}-mac-${label}.zip`);
  run("zip", ["-qry", zip, "Rulecard Helper.app"], path.join(release, dir));
  console.log(`${path.basename(zip)}: ${(fs.statSync(zip).size / 1e6).toFixed(1)} MB`);
}
