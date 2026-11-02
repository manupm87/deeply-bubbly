/* global process, window, console */
/* eslint-disable no-console -- a command line tool: stdout is its output */
// Art review: phone portrait screenshots at each station, at rest and peeking down, plus the numbers that
// keep the picture honest (draw calls). No bot, so it is quick and every run shows the same frames.
//
//   node e2e/tools/shots.mjs <outdir> [--stations=0,3,6] [--gpu] [--port=4174] [--w=412 --h=915]
//
// Needs `vite preview --port 4174` running on a fresh build (HANDOFF §5).
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = rest.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=')[1] : true;
};
const gpu = flag('gpu', false);
const port = flag('port', 4174);
const peeks = flag('peeks', '0,240').split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const args = gpu
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const executablePath = process.env.DB_CHROMIUM_PATH;
const browser = await chromium.launch({ args, ...(executablePath ? { executablePath } : {}) });
const device = devices['Pixel 7'];
const viewport = { width: Number(flag('w', device.viewport.width)), height: Number(flag('h', device.viewport.height)) };
const context = await browser.newContext({ ...device, viewport });
await context.addInitScript(() => {
  // No ?start: the first screen a new player gets, so no save either.
  if (!window.location.search.includes('start=')) return;
  window.localStorage.setItem('deeply-bubbly.save.v1', JSON.stringify({
    version: 1, unlockedStation: -1, bestDepthM: 0, pearls: 0, shellsByImmersion: {},
    settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: false },
    tutorialDone: true,
  }));
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console', m.text());
});

const stations = flag('stations', '0,1,2,3,4,5,6,7').split(',').map(Number);
for (const station of stations) {
  await page.goto(`http://localhost:${port}/?debug=1${station < 0 ? '' : `&start=${station}`}`);
  await page.waitForFunction(() => window.__db !== undefined, undefined, { timeout: 30000 });
  await page.evaluate(() => window.__db.models().ready);
  await page.waitForFunction(() => window.__db.world.snapshot().bubble.state === 'RESTING', undefined, { timeout: 30000 }).catch(() => console.log('not resting', station));
  await page.waitForTimeout(800);
  for (const peek of peeks) {
    await page.evaluate((dy) => {
      const b = window.__db.world.snapshot().bubble.pos;
      window.__db.world.setPeek(dy === 0 ? null : { x: b.x, y: b.y + dy });
    }, peek);
    await page.waitForTimeout(peek === 0 ? 100 : 900);
    const info = await page.evaluate(() => {
      const s = window.__db.world.snapshot();
      return { y: Math.round(s.camera.renderY), zone: s.zone, calls: window.__db.renderInfo().calls, tris: window.__db.renderInfo().triangles, state: s.bubble.state };
    });
    const name = `s${station}_p${peek}_y${info.y}.png`;
    await page.screenshot({ path: `${outDir}/${name}` });
    console.log(name, JSON.stringify(info));
  }
}
await browser.close();
