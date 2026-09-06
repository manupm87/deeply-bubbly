import { chromium, devices } from '@playwright/test';
const out = process.argv[2];
// Optional extra query string, e.g. '&start=1' to boot at a station checkpoint (main.ts `?start=`).
const extraQuery = process.argv[3] ?? '';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(`http://localhost:4173/?debug=1${extraQuery}`);
await page.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 20000 });
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const snap = () => page.evaluate(() => { const s = window.__db.world.snapshot(); return { t: Math.round(s.timeMs), st: s.bubble.state, y: Math.round(s.bubble.pos.y), x: Math.round(s.bubble.pos.x), air: s.bubble.air, m: Math.round(s.hud.depthM), ph: s.phase, camY: Math.round(s.camera.y), camX: Math.round(s.camera.x), rx: Math.round(s.camera.renderX), ry: Math.round(s.camera.renderY), ents: s.entities.length }; });
const vp = page.viewportSize();
let shots = 0; const log = [];
// DECISIONS-v1.2 D2: the shot is a SLINGSHOT. Press, drag the sling BACKWARDS (up the screen for a
// downward shot) over a few frames, then lift. A press that never moves is a cancel, not a shot.
const sling = async (x, y, dx, dy, ms) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 6;
  for (let k = 1; k <= steps; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / steps, y: y + (dy * k) / steps }] });
    await page.waitForTimeout(Math.max(1, Math.round(ms / steps)));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const start = Date.now();
let i = 0;
while (Date.now() - start < 75000) {
  const s = await snap();
  log.push(s);
  if (s.ph === 'dead') { await page.screenshot({ path: `${out}/dead-${shots++}.png` }); await page.evaluate(() => window.__db.world.restart()); await page.waitForTimeout(300); continue; }
  if (s.ph === 'station') { await page.screenshot({ path: `${out}/station-${shots++}.png` }); await page.waitForTimeout(1500); await page.evaluate(() => window.__db.world.continueDescent()); await page.waitForTimeout(300); continue; }
  // A shot only exists from a rest surface, or with the one D1 double jump in hand: pressing while
  // adrift and out of budget does nothing at all, so the bot waits for a ledge instead of drumming.
  if (s.st !== 'RESTING') { await page.waitForTimeout(120); continue; }
  // Pull length in CSS px: the design pull is 70 px and the page renders at an integer zoom.
  const zoom = await page.evaluate(() => window.__db.ctx.scale.zoom ?? 2);
  const reach = 70 * zoom;
  // Aim with core's own reach search (`game/autoPlayer.pickShot`, read through the debug handle).
  // DECISIONS-v1.2 D1 made the game reward CALCULATING the shot and D3/D4 replaced the 180 px chute
  // with 540 px of open water: a fixed cadence misses every hop by design, so a blind bot photographs
  // the first ledge and nothing else. The fallback keeps it moving when there is no rung below.
  const shot = await page.evaluate(() => window.__db.nextShot?.() ?? null);
  const theta = ((shot?.thetaDeg ?? [0, 25, -25, 0, 20, -20][i % 6]) * Math.PI) / 180;
  const power = shot?.power ?? [1, 0.8, 1, 0.6, 0.9, 1][i % 6];
  const ms = [220, 180, 300, 240][i % 4];
  // The drag is the OPPOSITE of the shot (D2): straight down is a finger that travels UP the screen.
  await sling(vp.width / 2, vp.height * 0.72, reach * power * Math.sin(theta) * -1, -reach * power * Math.cos(theta), ms);
  if (i % 3 === 1) await page.screenshot({ path: `${out}/play-${String(shots++).padStart(2,'0')}.png` });
  await page.waitForTimeout(900);
  i++;
}
console.log(JSON.stringify({ errors: errors.slice(0, 10), last: log.at(-1), maxY: Math.max(...log.map(l => l.y)), xRange: [Math.min(...log.map(l => l.x)), Math.max(...log.map(l => l.x))], camXRange: [Math.min(...log.map(l => l.camX)), Math.max(...log.map(l => l.camX))], states: [...new Set(log.map(l => l.st))], phases: [...new Set(log.map(l => l.ph))], minAir: Math.min(...log.map(l => l.air)) }));
console.log(log.filter((_, k) => k % 6 === 0).map(l => `${l.t}ms ${l.st} y=${l.y} x=${l.x} camX=${l.camX} rx=${l.rx} ry=${l.ry} air=${l.air} ${l.m}m ${l.ph}`).join('\n'));
await browser.close();
