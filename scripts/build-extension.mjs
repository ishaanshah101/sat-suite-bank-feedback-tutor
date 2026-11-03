import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("extension/dist", { recursive: true });
await build({
  entryPoints: { sidepanel: "extension/src/sidepanel.ts", background: "extension/src/background.ts", welcome: "extension/src/addons/welcome.ts" },
  outdir: "extension/dist",
  bundle: true,
  format: "esm",
  target: ["chrome116"],
  platform: "browser",
  sourcemap: false,
  minify: false,
  // Bundled MIT notices (KaTeX) stay at the end of dist/sidepanel.js.
  legalComments: "eof",
  logLevel: "info",
});
