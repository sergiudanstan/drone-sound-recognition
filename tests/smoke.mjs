// Headless smoke test: serve the repo, load index.html in Chrome and fail on any
// uncaught page error, failed request or console error. Then drive the app:
//  1. "Simulated drone" (Web Audio oscillators, no microphone needed) must switch the
//     status from Idle and move the peak-frequency readout and the spectrogram canvas.
//  2. The microphone path is exercised WITHOUT real hardware or a permission prompt: the
//     browser context is granted the "microphone" permission and navigator.mediaDevices
//     .getUserMedia is replaced by a stub that returns a synthetic oscillator stream.
//     The test therefore never depends on a real microphone or on a human clicking Allow.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try {
    const file = join(root, path.endsWith("/") ? path + "index.html" : path);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL || "chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ permissions: ["microphone"] });
// Replace the microphone with a synthetic 180 Hz + harmonics source.
await context.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    for (const m of [1, 2, 3]) {
      const o = ctx.createOscillator();
      o.frequency.value = 180 * m;
      o.connect(dest);
      o.start();
    }
    return dest.stream;
  };
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
const ignored = (u) => new URL(u).pathname === "/favicon.ico";
page.on("console", (m) => { if (m.type() === "error" && !(m.location()?.url && ignored(m.location().url))) problems.push(`console.error: ${m.text()} (${m.location()?.url ?? ""})`); });
page.on("response", (r) => { if (r.status() >= 400 && !ignored(r.url())) problems.push(`http ${r.status()}: ${r.url()}`); });
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

const text = (sel) => page.locator(sel).innerText();
const specHash = () => page.evaluate(() => {
  const c = document.querySelector("#spectrogramCanvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
  return h;
});
const check = (ok, msg) => { if (!ok) problems.push(msg); };

await page.goto(`${origin}/index.html`, { waitUntil: "load" });
check((await text("#statusText")) === "Idle", "initial status is not Idle");
const idleSpec = await specHash();
const idlePeak = await text("#peakFrequency");

await page.click("#demoButton");
await page.waitForTimeout(2500);
const demoStatus = await text("#statusText");
check(demoStatus !== "Idle" && !/unsupported|blocked/i.test(demoStatus), `demo status: "${demoStatus}"`);
check((await specHash()) !== idleSpec, "spectrogram did not change after starting the simulated drone");
const demoPeak = await text("#peakFrequency");
check(demoPeak !== idlePeak, `peak frequency readout did not move (${idlePeak} -> ${demoPeak})`);
await page.click("#stopButton");
await page.waitForTimeout(300);

await page.click("#micButton");
await page.waitForTimeout(2000);
const micStatus = await text("#statusText");
check(micStatus === "Microphone live", `microphone path (stubbed stream) status: "${micStatus}"`);

await browser.close();
server.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`ok: demo status "${demoStatus}", peak ${idlePeak} -> ${demoPeak}, mic path "${micStatus}", no errors`);
