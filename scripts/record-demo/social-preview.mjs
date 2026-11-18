#!/usr/bin/env node
// Generates the 1280x640 GitHub social preview (docs/assets/social-preview.png).
//
// The app screenshot inside the card is the real Kompri UI running in the demo harness
// (same simulated backend and documented numbers as the README demo, see demo-main.ts):
// Video tab, the 60 s 1080p60 source clip loaded, Discord preset selected.
//
// Usage:  npm run social-preview
// Needs:  Playwright's Chromium (npx playwright install chromium) or CHROME_PATH.
import { createServer } from "vite";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "docs", "assets", "social-preview.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ root, configFile: join(root, "vite.config.ts"), server: { port: 5181, strictPort: false }, logLevel: "error" });
await server.listen();
const url = `${server.resolvedUrls.local[0]}scripts/record-demo/index.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-proxy-server"] });

async function run() {
// 1. Real UI screenshot from the harness.
const app = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 2 });
const errors = [];
app.on("pageerror", (e) => errors.push(String(e)));
await app.goto(url);
await app.getByText(/drop files here/i).first().waitFor();
await app.getByRole("button", { name: /^\s*video\s*$/i }).first().click();
await sleep(500);
await app.evaluate(() => window.__demo.drop(540, 240));
await sleep(1200);
await app.getByRole("button", { name: /discord/i }).first().click();
await sleep(1500);
const shot = (await app.screenshot({ type: "png" })).toString("base64");
await app.close();
if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));

// 2. Compose the card.
const icon = readFileSync(join(root, "resource", "app-icon.png")).toString("base64");
const pills = [
  ["⚡", "1-Click Target Size · Discord / WhatsApp / Gmail", true],
  ["▸", "Windows Explorer Right-Click Menu", false],
  ["◆", "100% Offline · FFmpeg Bundled", false],
  ["▣", "Windows · macOS · Linux", false],
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 640px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; color: #ece9ff;
    background: radial-gradient(900px 500px at 78% 30%, #2d2456 0%, rgba(13,13,15,0) 70%), radial-gradient(700px 420px at 10% 90%, #1f1840 0%, rgba(13,13,15,0) 70%), #0d0d0f; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(124,106,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,255,.05) 1px, transparent 1px); background-size: 40px 40px; }
  .left { position: absolute; left: 56px; top: 132px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand img { width: 84px; height: 84px; border-radius: 20px; box-shadow: 0 12px 40px rgba(124,106,255,.45); }
  h1 { font-size: 76px; font-weight: 700; letter-spacing: -1.5px; line-height: 1; background: linear-gradient(90deg,#fff,#c9c0ff); -webkit-background-clip: text; color: transparent; }
  .formerly { margin-top: 8px; font-size: 15px; color: #8d88a8; letter-spacing: .3px; }
  .tag { margin: 26px 0 26px; font-size: 22px; color: #cfcbe6; }
  .pill { display: inline-flex; align-items: center; gap: 14px; padding: 13px 18px; margin-bottom: 12px; border-radius: 12px; font-size: 17px; font-weight: 600;
    background: rgba(28,28,33,.75); border: 1px solid #2a2a32; }
  .pill.on { background: rgba(45,36,86,.8); border-color: #7c6aff; box-shadow: 0 0 24px rgba(124,106,255,.25); }
  .pill i { font-style: normal; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 7px; background: #2d2456; color: #a099ff; font-size: 13px; }
  .shot { position: absolute; right: 52px; top: 64px; width: 640px; border-radius: 16px; overflow: hidden; border: 1px solid #3a3550;
    box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 0 6px rgba(124,106,255,.08); transform: perspective(1800px) rotateY(-9deg) rotateX(2deg); }
  .shot img { display: block; width: 100%; }
</style></head><body><div class="grid"></div>
  <div class="left">
    <div class="brand"><img src="data:image/png;base64,${icon}"><div><h1>Kompri</h1><div class="formerly">formerly MediaForge</div></div></div>
    <div class="tag">Local, fast &amp; private media converter</div>
    ${pills.map(([i, t, on]) => `<div class="pill${on ? " on" : ""}"><i>${i}</i>${t}</div>`).join("<br>")}
  </div>
  <div class="shot"><img src="data:image/png;base64,${shot}"></div>
</body></html>`;
const card = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await card.setContent(html, { waitUntil: "load" });
await card.screenshot({ path: out, type: "png" });
}

try {
  await run();
  console.log("Social preview written to docs/assets/social-preview.png");
} finally {
  await browser.close();
  await server.close();
}
