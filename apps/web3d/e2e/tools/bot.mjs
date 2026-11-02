/* global process, window, console */
/* eslint-disable no-console -- a command line tool: stdout is its output */
// Plays the real game with real touches on a Pixel 7 profile, using core's own shot search, and takes
// screenshots at varied moments: mid pull, in flight, landed, near each kind of entity, on zone changes.
//
//   node e2e/tools/bot.mjs <outdir> [--start=N] [--seconds=240] [--gpu] [--overlay] [--port=4174]
//
// Needs `vite preview --port 4174` running on a fresh build (HANDOFF §5: never a stale dist).
// Without --gpu it renders in software, like the e2e suite: fine for pictures, meaningless for frame time.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = rest.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=')[1] : true;
};
const start = flag('start', null);
const seconds = Number(flag('seconds', 240));
const gpu = flag('gpu', false);
const overlay = flag('overlay', false);
const port = flag('port', 4174);
mkdirSync(outDir, { recursive: true });

const args = gpu
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// Headed-class Chromium when a GPU is asked for: the old headless shell has no GPU process.
const executablePath = process.env.DB_CHROMIUM_PATH;
const browser = await chromium.launch({ args, ...(executablePath ? { executablePath } : {}), ...(gpu ? { headless: true } : {}) });
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
const query = start === null ? '' : `&start=${start}`;
await page.addInitScript(() => {
  if (window.localStorage.getItem('deeply-bubbly.save.v1')) return;
  window.localStorage.setItem('deeply-bubbly.save.v1', JSON.stringify({
    version: 1, unlockedStation: -1, bestDepthM: 0, pearls: 0, shellsByImmersion: {},
    settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: false },
    tutorialDone: true,
  }));
});
await page.goto(`http://localhost:${port}/?debug=1${query}`);
await page.waitForFunction(() => window.__db !== undefined, undefined, { timeout: 30000 });
const loadT0 = Date.now();
await page.evaluate(() => window.__db.models().ready);
const modelsLoadMs = Date.now() - loadT0;
await page.waitForTimeout(300); // The views swap to models on the next frame after they settle.
const models = await page.evaluate(() => {
  const m = window.__db.models();
  return { loaded: m.loaded, failed: m.failed, bur: m.burUsesModel };
});
console.log('models', JSON.stringify(models), `settled ${modelsLoadMs} ms after boot`);
if (overlay) await page.evaluate(() => window.__db.shell.setCollisionOverlay(true));
const glInfo = await page.evaluate(() => {
  const gl = window.__db.stage.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log('renderer', glInfo);

const cdp = await context.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const read = () => page.evaluate(() => {
  const db = window.__db;
  const s = db.world.snapshot();
  const cam = s.camera;
  const inView = (y0, y1, x0, x1) => y1 > cam.renderY && y0 < cam.renderY + cam.viewH && x1 > cam.renderX && x0 < cam.renderX + cam.viewW;
  const seen = [];
  for (const e of s.entities) {
    let tag = null;
    let on = false;
    if (e.type === 'ceiling' || e.type === 'wall' || e.type === 'forcefield') {
      on = inView(e.rect.y, e.rect.y + e.rect.h, e.rect.x, e.rect.x + e.rect.w);
      if (e.type === 'ceiling') tag = e.catalogId !== undefined ? `cat${e.catalogId}` : `ledge-${e.material}`;
      else tag = e.type === 'wall' ? 'wall' : `field-${e.fieldType}`;
    } else if (e.type === 'hazard') {
      tag = `cat${e.catalogId}`;
      on = inView(e.shape.y, e.shape.y + e.shape.h, e.shape.x, e.shape.x + e.shape.w);
    } else if (e.type === 'pickup') {
      tag = e.pickupType;
      on = inView(e.pos.y, e.pos.y, e.pos.x, e.pos.x);
    } else if (e.type === 'boya' || e.type === 'station') {
      tag = e.type;
      on = e.worldY > cam.renderY && e.worldY < cam.renderY + cam.viewH;
    }
    if (tag && on) seen.push(tag);
  }
  const b = s.bubble;
  const info = db.renderInfo();
  return {
    t: s.timeMs, st: b.state, x: Math.round(b.pos.x), y: Math.round(b.pos.y), air: b.air, ph: s.phase, zone: s.zone,
    m: Math.round(s.hud.depthM), seen: [...new Set(seen)], calls: info.calls, tris: info.triangles,
    audit: db.audit(),
    hinchon: (() => {
      const h = s.entities.find((e) => e.type === 'hazard' && e.catalogId === 5);
      if (!h || Math.abs(h.shape.y + h.shape.h / 2 - cam.y) > 260) return null;
      const raw = ((s.timeMs + (h.phaseMs ?? 0)) % h.periodMs + h.periodMs) % h.periodMs;
      return raw;
    })(),
  };
});
let n = 0;
const taken = new Set();
const samples = [];
const primitives = new Set();
const alignment = {};
const snap = async (why, s) => {
  const name = `${String(n++).padStart(3, '0')}-z${s.zone}-${s.m}m-${why}.png`;
  await page.screenshot({ path: `${outDir}/${name}` });
  console.log(name, `calls=${s.calls} tris=${s.tris} seen=${s.seen.join(',')}`);
};
const pressButton = async (id) => {
  const b = await page.evaluate((i) => window.__db.buttons().find((x) => x.id === i && x.visible) ?? null, id);
  if (!b) return false;
  await touch('touchStart', [{ x: b.x, y: b.y }]);
  await page.waitForTimeout(80);
  await touch('touchEnd', []);
  return true;
};

const deadline = Date.now() + seconds * 1000;
let shots = 0;
let lastZone = -1;
let deaths = 0;
let stations = 0;
let noShot = 0;
let maxY = 0;
while (Date.now() < deadline) {
  const s = await read();
  samples.push({ calls: s.calls, tris: s.tris, zone: s.zone });
  for (const row of s.audit) {
    if (!row.model) primitives.add(row.tag);
    if (row.error !== null) {
      const worst = alignment[row.tag] ?? { worst: 0, samples: 0 };
      alignment[row.tag] = { worst: Math.max(worst.worst, Number(row.error.toFixed(2))), samples: worst.samples + 1 };
    }
  }
  maxY = Math.max(maxY, s.y);
  if (s.zone !== lastZone) {
    await snap('zone', s);
    lastZone = s.zone;
  }
  for (const tag of s.seen) {
    if (taken.has(tag)) continue;
    taken.add(tag);
    await snap(`first-${tag}`, s);
  }
  if (s.ph === 'dead') {
    deaths++;
    await snap('dead', s);
    await pressButton('dead.giant');
    await page.waitForTimeout(500);
    continue;
  }
  if (s.ph === 'station') {
    stations++;
    await page.waitForTimeout(500);
    await snap('station', s);
    await pressButton('station.giant');
    await page.waitForTimeout(800);
    continue;
  }
  if (s.st !== 'RESTING') {
    if (shots % 4 === 2 && s.st === 'LAUNCHED' && !taken.has(`fly${shots}`)) {
      taken.add(`fly${shots}`);
      await snap('flight', s);
    }
    await page.waitForTimeout(100);
    continue;
  }
  // Don Hinchón: a blind shot dies to him (§5, nº 5), so let go at the top of his deflated window.
  if (s.hinchon !== null) {
    await page.waitForFunction(() => {
      const w = window.__db.world.snapshot();
      const h = w.entities.find((e) => e.type === 'hazard' && e.catalogId === 5);
      if (!h) return true;
      const raw = (w.timeMs + (h.phaseMs ?? 0)) % h.periodMs;
      return raw >= 1500 && raw < 1600;
    }, undefined, { timeout: 8000, polling: 16 }).catch(() => undefined);
    if ((await read()).st !== 'RESTING') continue;
  }
  const plan = await page.evaluate(() => {
    const db = window.__db;
    const shot = db.nextShot();
    const reach = db.tuning.PULL_MAX_PX * (shot?.power ?? 0.7) * db.ctx.scale.zoom;
    const theta = ((shot?.thetaDeg ?? 0) * Math.PI) / 180;
    return { found: shot !== null, dx: -Math.sin(theta) * reach, dy: -Math.cos(theta) * reach, w: window.innerWidth, h: window.innerHeight };
  });
  if (!plan.found) noShot++;
  const x0 = plan.w / 2;
  const y0 = plan.h * 0.86;
  await touch('touchStart', [{ x: x0, y: y0 }]);
  for (let k = 1; k <= 6; k++) {
    await touch('touchMove', [{ x: x0 + (plan.dx * k) / 6, y: y0 + (plan.dy * k) / 6 }]);
    await page.waitForTimeout(30);
  }
  if (shots % 7 === 0) await snap('aim', await read());
  await touch('touchEnd', []);
  shots++;
  if (shots % 6 === 3) {
    await page.waitForTimeout(350);
    await snap('after', await read());
  }
  await page.waitForTimeout(250);
}

// Frame time where the bot stopped, over the last ~240 frames it played.
const perf = await page.evaluate(() => window.__db.perf());
const last = await read();
const stat = (list) => {
  const v = [...list].sort((a, b) => a - b);
  return { mean: Math.round(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)), p95: v[Math.floor(v.length * 0.95)] ?? 0, max: v.at(-1) ?? 0 };
};
const byZone = {};
for (const z of new Set(samples.map((x) => x.zone))) {
  const zs = samples.filter((x) => x.zone === z);
  byZone[z] = { samples: zs.length, calls: stat(zs.map((x) => x.calls)), tris: stat(zs.map((x) => x.tris)) };
}
const report = {
  renderer: glInfo, models, modelsLoadMs, shots, deaths, stations, noShot, maxY, lastPhase: last.ph, lastZone: last.zone, depthM: last.m,
  seen: [...taken].filter((t) => !t.startsWith('fly')), primitives: [...primitives], alignment, perf, byZone, errors: errors.slice(0, 20), errorCount: errors.length,
};
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
