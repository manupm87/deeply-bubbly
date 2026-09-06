import { chromium, devices } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto('http://localhost:4173/?debug=1');
await page.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 20000 });
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const snap = () => page.evaluate(() => { const s = window.__db.world.snapshot(); return { t: Math.round(s.timeMs), st: s.bubble.state, y: Math.round(s.bubble.pos.y), x: Math.round(s.bubble.pos.x), air: s.bubble.air, m: Math.round(s.hud.depthM), ph: s.phase, camY: Math.round(s.camera.y), ents: s.entities.length }; });
const vp = page.viewportSize();
let shots = 0; const log = [];
const hold = async (x, y, ms) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const start = Date.now();
let i = 0;
while (Date.now() - start < 75000) {
  const s = await snap();
  log.push(s);
  if (s.ph === 'dead') { await page.screenshot({ path: `${out}/dead-${shots++}.png` }); await page.evaluate(() => window.__db.world.restart()); await page.waitForTimeout(300); continue; }
  if (s.ph === 'station') { await page.screenshot({ path: `${out}/station-${shots++}.png` }); await page.waitForTimeout(1500); await page.evaluate(() => window.__db.world.continueDescent()); await page.waitForTimeout(300); continue; }
  // aim: alternate slightly left/right, mostly down
  const dx = [0, -40, 40, 0, 20, -20][i % 6];
  const ms = [420, 300, 500, 380][i % 4];
  await hold(vp.width / 2 + dx, vp.height * 0.72, ms);
  if (i % 3 === 1) await page.screenshot({ path: `${out}/play-${String(shots++).padStart(2,'0')}.png` });
  await page.waitForTimeout(900);
  i++;
}
console.log(JSON.stringify({ errors: errors.slice(0, 10), last: log.at(-1), maxY: Math.max(...log.map(l => l.y)), states: [...new Set(log.map(l => l.st))], phases: [...new Set(log.map(l => l.ph))], minAir: Math.min(...log.map(l => l.air)) }));
console.log(log.filter((_, k) => k % 6 === 0).map(l => `${l.t}ms ${l.st} y=${l.y} x=${l.x} air=${l.air} ${l.m}m ${l.ph}`).join('\n'));
await browser.close();
