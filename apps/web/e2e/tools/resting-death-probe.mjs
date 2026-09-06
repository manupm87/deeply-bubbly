import { chromium, devices } from '@playwright/test';
const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'] }); const p = await c.newPage();
await p.goto('http://localhost:4173/?debug=1'); await p.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 30000 });
await p.waitForTimeout(1500);
const before = await p.evaluate(() => window.__db.world.snapshot().bubble.state);
await p.evaluate(() => { const sn = window.__db.world.snapshot(); sn.bubble.air = 1; sn.bubble.pos.y = sn.camera.y - 120; sn.bubble.vel.x = 0; sn.bubble.vel.y = -160; sn.bubble.state = 'LAUNCHED'; sn.bubble.restingOnId = null; sn.bubble.restMs = 0; sn.bubble.launchedMs = 0; });
const t0 = Date.now();
await p.waitForFunction(() => window.__db.world.snapshot().phase === 'dead', undefined, { timeout: 15000 }).then(() => console.log('before:', before, 'dead after', Date.now() - t0, 'ms')).catch(async () => console.log('before:', before, 'NOT dead; state now', await p.evaluate(() => JSON.stringify({s: window.__db.world.snapshot().bubble.state, y: window.__db.world.snapshot().bubble.pos.y, air: window.__db.world.snapshot().bubble.air}))));
await b.close();
