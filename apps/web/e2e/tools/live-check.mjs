import { chromium, devices } from '@playwright/test';
const url = process.argv[2];
const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'] }); const p = await c.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto(url + '?debug=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 30000 });
await p.waitForTimeout(1500);
const s = await p.evaluate(() => { const s = window.__db.world.snapshot(); return { phase: s.phase, state: s.bubble.state, y: Math.round(s.bubble.pos.y), camX: s.camera.x, tuningWorldW: window.__db.ctx.tuning?.WORLD_W }; });
console.log(url, JSON.stringify({ s, errs })); await b.close();
