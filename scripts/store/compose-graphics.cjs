// Run: node scripts/store/panel-shots.cjs && node scripts/store/compose-graphics.cjs (needs Chromium from Playwright).
// Builds every Chrome Web Store graphic for Rulecard from the panel shots.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../../store");
const OUT = DIR;
fs.mkdirSync(OUT, { recursive: true });
const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(DIR, ".panels", f)).toString("base64")}`;

const ICON_SVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d68f2"/><stop offset="1" stop-color="#2449d6"/></linearGradient>
  </defs>
  <rect x="0" y="0" width="96" height="96" rx="22" fill="url(#g)"/>
  <rect x="19" y="25" width="58" height="48" rx="7" fill="#ffffff"/>
  <rect x="28" y="38" width="40" height="7" rx="3.5" fill="#2f5bea"/>
  <rect x="28" y="52" width="25" height="6" rx="3" fill="#c9d6fb"/>
</svg>`;

const BASE_CSS = `
  *{box-sizing:border-box} html,body{margin:0}
  body{font-family:Inter,system-ui,sans-serif;color:#16161a;-webkit-font-smoothing:antialiased}
  .bg{position:absolute;inset:0;background:radial-gradient(1200px 700px at 85% 10%,#dfe7fd 0%,rgba(223,231,253,0) 60%),linear-gradient(135deg,#eef2fd 0%,#f7f7f5 70%)}
  .brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:20px;letter-spacing:-.01em}
  .brand svg{display:block}
  .eyebrow{display:inline-block;font-size:14px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#2f5bea;background:#e3eafd;padding:6px 12px;border-radius:999px}
  .panel{background:#f7f7f5;border-radius:18px;overflow:hidden;box-shadow:0 30px 60px rgba(24,38,94,.18),0 2px 6px rgba(24,38,94,.08);border:1px solid #e1e3ea;position:relative}
  .panel .bar{height:34px;background:#fff;border-bottom:1px solid #e4e4e0;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:12.5px;font-weight:600;color:#4b4b52}
  .panel .bar .x{margin-left:auto;color:#9a9aa2;font-weight:500}
  .panel .shot{display:block;width:100%;object-fit:cover;object-position:top}
`;

const OFF = { "rule.png": 0, "math-rule.png": 0, "spr-rule.png": 40, "drill.png": 233, "home.png": 0 };
const screenshot = (n, title, sub, file, opts = {}) => `<!doctype html><html><head><style>${BASE_CSS}
  body{width:1280px;height:800px;position:relative;overflow:hidden}
  .wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 72px 0 88px;gap:72px}
  .copy{flex:1}
  h1{font-size:50px;line-height:1.08;letter-spacing:-.025em;margin:22px 0 20px;font-weight:700}
  p{font-size:21px;line-height:1.5;color:#4b4b52;margin:0;max-width:560px}
  .foot{position:absolute;left:88px;bottom:44px}
  .panel{width:420px;flex:none}
  .panel .shot{height:${opts.panelH ?? 700}px}
</style></head><body><div class="bg"></div>
  <div class="wrap">
    <div class="copy"><span class="eyebrow">${n}</span><h1>${title}</h1><p>${sub}</p></div>
    <div class="panel"><div class="bar">${ICON_SVG(16)}Rulecard<span class="x">Side panel</span></div><div style="height:700px;overflow:hidden"><img src="${img(file)}" style="display:block;width:100%;margin-top:-${(OFF[file] ?? 0) * 1.05}px"></div></div>
  </div>
  <div class="foot brand">${ICON_SVG(30)}Rulecard</div>
</body></html>`;

const shots = [
  ["Reading and Writing", "Learn the one rule behind every miss", "Rulecard names the exact rule the question tested, why the right answer follows it, why your pick breaks it, and how to rule out the rest.", "rule.png"],
  ["Math", "Math rules with worked steps", "Tables, graphs and equations read into real math notation, with step by step work and a Desmos shortcut when it saves time.", "math-rule.png"],
  ["Grid-ins", "Grid-in answers graded exactly", "Type what you entered. Rulecard checks it against every accepted form, like 3/17, .1764 and .1765, using the official entry rules.", "spr-rule.png"],
  ["Test me", "Practice the same rule right away", "Press Test me for a fresh question on that exact rule. Math practice questions are double-checked by a second, independent solve.", "drill.png"],
  ["History", "Capture any question, track every miss", "Press Capture on a Question Bank question. Every review is saved to your free account, so the rules you keep missing are always one click away.", "home.png"],
];

const smallTile = `<!doctype html><html><head><style>${BASE_CSS}
  body{width:440px;height:280px;position:relative;overflow:hidden;background:#2f5bea}
  .g{position:absolute;inset:0;background:radial-gradient(360px 260px at 100% 0%,#5b80ff 0%,rgba(91,128,255,0) 70%),linear-gradient(150deg,#3561f0 0%,#2245cf 100%)}
  .c{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 36px;color:#fff}
  .row{display:flex;align-items:center;gap:16px}
  .ic{background:#fff;border-radius:20px;padding:8px;box-shadow:0 10px 24px rgba(10,20,80,.25)}
  .name{font-size:40px;font-weight:700;letter-spacing:-.02em}
  .tag{margin-top:22px;font-size:21px;line-height:1.35;font-weight:500;color:#e6ecff;max-width:340px}
</style></head><body><div class="g"></div><div class="c">
  <div class="row"><div class="ic">${ICON_SVG(56)}</div><div class="name">Rulecard</div></div>
  <div class="tag">The one rule behind every SAT Reading, Writing and Math miss</div>
</div></body></html>`;

const marquee = `<!doctype html><html><head><style>${BASE_CSS}
  body{width:1400px;height:560px;position:relative;overflow:hidden}
  .g{position:absolute;inset:0;background:radial-gradient(700px 500px at 100% 0%,#5b80ff 0%,rgba(91,128,255,0) 70%),linear-gradient(150deg,#3561f0 0%,#2042c8 100%)}
  .c{position:absolute;left:96px;top:0;bottom:0;width:540px;display:flex;flex-direction:column;justify-content:center;color:#fff}
  .row{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:700;letter-spacing:-.01em}
  .ic{background:#fff;border-radius:16px;padding:6px}
  h1{font-size:52px;line-height:1.08;letter-spacing:-.03em;margin:30px 0 20px;font-weight:700}
  p{font-size:22px;line-height:1.45;margin:0;color:#dfe6ff;max-width:500px}
  .panel{position:absolute;width:380px}
  .panel .shot{height:600px}
  .p1{right:320px;top:76px;transform:rotate(-3deg)}
  .p2{right:64px;top:40px;transform:rotate(2.5deg)}
  .panel{box-shadow:0 40px 80px rgba(5,12,60,.45)}
</style></head><body><div class="g"></div>
  <div class="c"><div class="row"><div class="ic">${ICON_SVG(40)}</div>Rulecard</div>
    <h1>Learn the rule behind every SAT miss</h1>
    <p>Reading, Writing and Math. Capture a Question Bank question, get the one rule it tested, then practice it.</p></div>
  <div class="panel p1"><div class="bar">${ICON_SVG(16)}Rulecard</div><img class="shot" src="${img("rule.png")}"></div>
  <div class="panel p2"><div class="bar">${ICON_SVG(16)}Rulecard</div><img class="shot" src="${img("math-rule.png")}"></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const render = async (html, w, h, file, transparent = false) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: transparent });
    await page.close();
  };
  for (const [i, s] of shots.entries()) await render(screenshot(...s), 1280, 800, `screenshot-${i + 1}-${s[0].toLowerCase().replace(/\s+/g, "-")}.png`);
  await render(smallTile, 440, 280, "small-promo-tile-440x280.png");
  await render(marquee, 1400, 560, "marquee-promo-tile-1400x560.png");
  // Store icon: 96x96 artwork centered in a 128x128 transparent canvas (16px padding), per Chrome Web Store guidelines.
  await render(`<!doctype html><html><body style="margin:0;width:128px;height:128px;background:transparent"><div style="padding:16px">${ICON_SVG(96)}</div></body></html>`, 128, 128, "store-icon-128.png", true);
  await browser.close();
})();
