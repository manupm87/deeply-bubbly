import { chromium, devices } from '@playwright/test';
const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'] }); const p = await c.newPage();
await p.goto('http://localhost:4173/?debug=1'); await p.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 30000 });
const rows = [];
for (let i = 0; i < 16; i++) { await p.waitForTimeout(500); rows.push(await p.evaluate(() => { const s = window.__db.world.snapshot(); return `${Math.round(s.timeMs)}ms ${s.bubble.state} y=${s.bubble.pos.y.toFixed(0)} camY=${s.camera.y.toFixed(0)} air=${s.bubble.air} resaca=${s.bubble.flags.resacaUntil} ${s.phase}`; })); }
console.log(rows.join('\n')); await b.close();
