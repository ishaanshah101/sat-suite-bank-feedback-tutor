// Bundles the Rulecard Helper (main process, preload, panel) into desktop/dist. Run from the repo root.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const common = { bundle: true, sourcemap: false, minify: false, legalComments: "eof", logLevel: "info" };
await build({ ...common, entryPoints: [path.join(here, "src/main.ts"), path.join(here, "src/preload.ts")], outdir: out, platform: "node", target: "node22", format: "cjs", external: ["electron"] });
await build({ ...common, entryPoints: [path.join(here, "src/renderer.ts")], outdir: out, platform: "browser", target: "chrome130", format: "iife" });
await cp(path.join(here, "src/index.html"), path.join(out, "index.html"));
await cp(path.join(here, "src/styles.css"), path.join(out, "styles.css"));
await cp(path.join(here, "assets"), path.join(out, "assets"), { recursive: true });
