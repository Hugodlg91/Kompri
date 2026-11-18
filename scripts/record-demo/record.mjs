#!/usr/bin/env node
// Records the README demo GIF/MP4 from the real MediaForge UI running in a browser
// with a simulated Tauri backend (see demo-main.ts for where the numbers come from).
//
// Usage:  npm run record-demo
// Needs:  ffmpeg on PATH. Browser: Playwright's Chromium (npx playwright install chromium)
//         or set CHROME_PATH to an installed Chrome/Edge.
// Output: docs/assets/mediaforge-demo.gif and docs/assets/mediaforge-demo.mp4
import { createServer } from "vite";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "docs", "assets");
const W = 1000, H = 760;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function center(loc) {
  const bb = await loc.boundingBox();
  return [bb.x + bb.width / 2, bb.y + bb.height / 2];
}

const server = await createServer({ root, configFile: join(root, "vite.config.ts"), server: { port: 5179, strictPort: false }, logLevel: "error" });
await server.listen();
const url = `${server.resolvedUrls.local[0]}scripts/record-demo/index.html`;

const videoDir = mkdtempSync(join(tmpdir(), "mf-demo-"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-proxy-server"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: videoDir, size: { width: W, height: H } } });
await ctx.addInitScript({ path: join(root, "scripts", "record-demo", "cursor.js") });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const t0 = Date.now();
await page.goto(url);
await page.getByText(/drop files here/i).first().waitFor();
await sleep(800);
const m = page.mouse;
await m.move(560, 520);
const start = (Date.now() - t0) / 1000;
await sleep(500);

const click = async (loc, steps = 15) => {
  const [x, y] = await center(loc);
  await m.move(x, y, { steps }); await sleep(150);
  await m.down(); await m.up();
  return [x, y];
};

// 1. Video tab
await click(page.getByRole("button", { name: /^\s*video\s*$/i }).first(), 16);
await sleep(700);
// 2. Drag a file in from the bottom-right corner
await m.move(980, 740, { steps: 10 });
await page.evaluate(() => window.__ghost(true));
await sleep(150);
await m.move(700, 330, { steps: 14 });
await page.evaluate(() => window.__demo.dragOver(500, 250));
await m.move(540, 240, { steps: 14 });
await sleep(250);
await page.evaluate(() => window.__ghost(false));
await page.evaluate(() => window.__demo.drop(540, 240));
await sleep(1300);
// 3. Discord preset
await click(page.getByRole("button", { name: /discord/i }).first());
await sleep(1700);
// 4. Convert
const [cx, cy] = await click(page.getByRole("button", { name: /^\s*convert\s*$/i }).first(), 14);
await m.move(cx + 140, cy - 120, { steps: 12 });
await page.getByText(/conversion complete/i).first().waitFor({ timeout: 20000 });
await sleep(1600);
// 5. History
await click(page.getByRole("button", { name: /^\s*hist/i }).first(), 16);
await sleep(700);
const [hx, hy] = await center(page.getByText("9.1 MB").first());
await m.move(hx + 6, hy + 4, { steps: 15 });
await sleep(2400);
const duration = (Date.now() - t0) / 1000 - start;

await ctx.close();
await browser.close();
await server.close();
if (errors.length) { console.error("Page errors:\n" + errors.join("\n")); process.exit(1); }

const webm = join(videoDir, readdirSync(videoDir).find((f) => f.endsWith(".webm")));
mkdirSync(outDir, { recursive: true });
const trim = ["-ss", start.toFixed(2), "-t", duration.toFixed(2), "-i", webm];
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...trim,
  "-vf", "setpts=PTS/1.15,fps=12,scale=860:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
  "-loop", "0", join(outDir, "mediaforge-demo.gif")], { stdio: "inherit" });
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...trim,
  "-vf", "setpts=PTS/1.15,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
  "-movflags", "+faststart", "-an", join(outDir, "mediaforge-demo.mp4")], { stdio: "inherit" });
rmSync(videoDir, { recursive: true, force: true });
console.log("Demo written to docs/assets/mediaforge-demo.gif and .mp4");
