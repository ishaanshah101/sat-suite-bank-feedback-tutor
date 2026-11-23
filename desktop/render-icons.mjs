// Renders the Rulecard logo into desktop/assets: the macOS app icon (icon.png) and the menu bar template icons.
// Run from the repo root: node desktop/render-icons.mjs desktop/assets
import { chromium } from "@playwright/test";
const OUT = process.argv[2];
// Rulecard mark in black and white: black tile, white card, two black lines (the helper is black and white only).
const mark = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#000"/><rect x="19" y="25" width="58" height="48" rx="7" fill="#fff"/><rect x="28" y="38" width="40" height="7" rx="3.5" fill="#000"/><rect x="28" y="52" width="25" height="6" rx="3" fill="#000"/></svg>`;
// macOS app icon: artwork 824/1024 with soft shadow, per Apple's grid.
const appIcon = `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><div style="filter:drop-shadow(0 18px 24px rgba(0,0,0,.28))">${mark(824)}</div></div>`;
// Menu bar template: black card outline with the two lines, transparent elsewhere.
const tray = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16"><path fill="#000" fill-rule="evenodd" d="M3.5 2.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm0 1.4a.6.6 0 0 0-.6.6v7a.6.6 0 0 0 .6.6h9a.6.6 0 0 0 .6-.6v-7a.6.6 0 0 0-.6-.6z"/><rect x="4.4" y="5.6" width="7.2" height="1.6" rx=".8"/><rect x="4.4" y="8.6" width="4.4" height="1.4" rx=".7" opacity=".55"/></svg>`;
const browser = await chromium.launch();
const shot = async (html, w, h, file) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${html}</body></html>`);
  await p.screenshot({ path: `${OUT}/${file}`, omitBackground: true });
  await p.close();
};
await shot(appIcon, 1024, 1024, "icon.png");
await shot(tray(16), 16, 16, "trayTemplate.png");
await shot(tray(32), 32, 32, "trayTemplate@2x.png");
await shot(`<div style="background:#1f2430;padding:8px;width:84px">${tray(64).replace(/#000/g,'#fff').replace('<rect x="4.4" y="5.6"','<rect fill="#fff" x="4.4" y="5.6"').replace('<rect x="4.4" y="8.6"','<rect fill="#fff" x="4.4" y="8.6"')}</div>`, 100, 80, "tray-preview.png");
await browser.close();
