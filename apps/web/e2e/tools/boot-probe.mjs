import { chromium, devices } from '@playwright/test';
const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'] }); const p = await c.newPage();
await p.goto('http://localhost:4173/?debug=1'); await p.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 30000 });
const rows = [];
for (let i = 0; i < 12; i++) { rows.push(await p.evaluate(() => { const s = window.__db.world.snapshot(); return `${Math.round(s.timeMs)}ms ${s.bubble.state} y=${s.bubble.pos.y.toFixed(0)} rest=${s.bubble.restingOnId}`; })); await p.waitForTimeout(150); }
console.log(rows.join('\n')); await b.close();
