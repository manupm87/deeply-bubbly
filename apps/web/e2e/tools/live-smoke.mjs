import { chromium, devices } from '@playwright/test';
const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'] }); const p = await c.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('https://manupm87.github.io/deeply-bubbly/?debug=1', { waitUntil: 'load' });
await p.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 30000 });
await p.waitForTimeout(2000);
const s = await p.evaluate(() => { const s = window.__db.world.snapshot(); return { phase: s.phase, y: s.bubble.pos.y, zoom: window.__db.ctx.scale.zoom }; });
await p.screenshot({ path: process.argv[2] });
console.log(JSON.stringify({ s, errs })); await b.close();
