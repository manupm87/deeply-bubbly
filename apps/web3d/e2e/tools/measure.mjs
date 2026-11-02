/* global process, window, console */
/* eslint-disable no-console -- a command line tool: stdout is its output */
// Frame time and draw calls on a still world at the start of each station, with and without a 4x CPU
// throttle, on the given renderer. Needs `vite preview --port 4174` on a fresh build.
//
//   node e2e/tools/measure.mjs [--gpu] [--out=dir]
//
// `workMean` is what our frame costs on the main thread. WebGL submits asynchronously, so GPU time shows
// up only in `frameMean`, and only when the GPU can't keep up with vsync.
import { chromium, devices } from '@playwright/test';

const gpu = process.argv.includes('--gpu');
const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const args = gpu
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const executablePath = process.env.DB_CHROMIUM_PATH;
const browser = await chromium.launch({ args, ...(executablePath ? { executablePath } : {}) });

const rows = [];
for (const start of [0, 1, 2, 3]) {
  for (const throttle of gpu ? [1, 4] : [1]) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    await page.goto(`http://localhost:4174/?debug=1&start=${start}`);
    await page.waitForFunction(() => window.__db !== undefined);
    await page.evaluate(() => window.__db.models().ready);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    // Enough frames to fill the rolling window with this renderer and this throttle.
    const target = (await page.evaluate(() => window.__db.shell.frames)) + 240;
    await page.waitForFunction((n) => window.__db.shell.frames >= n, target, { timeout: 120000 });
    const row = await page.evaluate(() => {
      const db = window.__db;
      const s = db.world.snapshot();
      return { zone: s.zone, depthM: Math.round(s.hud.depthM), ...db.perf(), ...db.renderInfo() };
    });
    if (out && throttle === 1) await page.screenshot({ path: `${out}/start${start}.png` });
    rows.push({ start, throttle, ...row });
    await context.close();
  }
}
for (const r of rows) {
  console.log(
    `start=${r.start} cpu÷${r.throttle} z${r.zone} ${r.depthM}m frame ${r.frameMean.toFixed(1)}/${r.frameP95.toFixed(1)} ms, ` +
      `work ${r.workMean.toFixed(2)}/${r.workP95.toFixed(2)} ms, calls ${r.calls}, tris ${r.triangles}, geo ${r.geometries}`,
  );
}
await browser.close();
