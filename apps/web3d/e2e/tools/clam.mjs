/* global process, window, console */
/* eslint-disable no-console -- a command line tool: stdout is its output */
// almeja_porton has no entity in core yet, so nothing in a run shows it. This puts the real glb through the
// real registry and mixer in the running game and screenshots each pose, large, in Three.js.
//
//   node e2e/tools/clam.mjs <outdir> [--port=4174]
//
// Needs `vite preview --port 4174` running on a fresh build (HANDOFF §5).
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const executablePath = process.env.DB_CHROMIUM_PATH;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ ...devices['Pixel 7'] });
await context.addInitScript(() => {
  window.localStorage.setItem('deeply-bubbly.save.v1', JSON.stringify({
    version: 1, unlockedStation: -1, bestDepthM: 0, pearls: 0, shellsByImmersion: {},
    settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: false },
    tutorialDone: true,
  }));
});
const page = await context.newPage();
await page.goto('http://localhost:4174/?debug=1&start=2');
await page.waitForFunction(() => window.__db !== undefined);
await page.evaluate(() => window.__db.models().ready);
await page.waitForTimeout(800);

const box = { x: 40, y: 320, width: 340, height: 300 };
// Each pose: a clip, and how far into it to stop. The mixer is ticked by hand, so the frame is exact.
const POSES = [['bind', null, 0], ['Open_end', 'Open', 0.6], ['Tell_1', 'Tell', 0.12], ['Tell_2', 'Tell', 0.21], ['Close_end', 'Close', 0.4]];
for (const [name, clip, seconds] of POSES) {
  await page.evaluate(([c, s]) => {
    const db = window.__db;
    const b = db.world.snapshot().bubble.pos;
    const models = db.shell.worldView.deps.models;
    window.__clam?.object.parent?.remove(window.__clam.object);
    const m = models.create('almeja_porton', 40, 24, 'none');
    m.object.position.set(b.x * 0.1, -(b.y + 60) * 0.1, 8);
    m.object.scale.setScalar(1.6);
    db.stage.scene.add(m.object);
    window.__clam = m;
    if (c) {
      m.hold(c);
      for (let t = 0; t < s; t += 1 / 120) m.tick(1 / 120);
    } else m.tick(0);
  }, [clip, seconds]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${POSES.findIndex((p) => p[0] === name)}_${name}.png`, clip: box });
  console.log(name);
}
await browser.close();
