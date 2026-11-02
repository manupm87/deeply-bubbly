/* global process, window, console, setInterval, clearInterval */
/* eslint-disable no-console -- a command line tool: stdout is its output */
// Game-feel review: screenshots of the moments of GDD §7, each taken a few frames after its event, plus
// the draw calls of that frame. Moments the bot may not reach on its own are forced through the world.
//
//   node e2e/tools/feel.mjs <outdir> [--gpu] [--port=4174] [--reduced]
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
const port = flag('port', 4174);
mkdirSync(outDir, { recursive: true });
const args = flag('gpu', false)
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const executablePath = process.env.DB_CHROMIUM_PATH;
const browser = await chromium.launch({ args, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ ...devices['Pixel 7'], ...(flag('reduced', false) ? { reducedMotion: 'reduce' } : {}) });
await context.addInitScript(() => {
  window.localStorage.setItem(
    'deeply-bubbly.save.v1',
    JSON.stringify({
      version: 1,
      unlockedStation: 1,
      bestDepthM: 0,
      pearls: 0,
      shellsByImmersion: {},
      settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
      tutorialDone: true,
    }),
  );
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console', m.text());
});

let maxCalls = 0;
const snap = async (name) => {
  const info = await page.evaluate(() => {
    const d = window.__db;
    const s = d.world.snapshot();
    return { calls: d.renderInfo().calls, tris: d.renderInfo().triangles, state: s.bubble.state, phase: s.phase, ...d.feel() };
  });
  maxCalls = Math.max(maxCalls, info.calls);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, JSON.stringify({ calls: info.calls, tris: info.tris, state: info.state, particles: info.particles, camera: info.camera, bubble: info.bubble }));
};

const boot = async (start) => {
  await page.goto(`http://localhost:${port}/?debug=1&start=${start}`);
  await page.waitForFunction(() => window.__db !== undefined, undefined, { timeout: 30000 });
  await page.evaluate(() => window.__db.models().ready);
  await page.waitForFunction(() => window.__db.world.snapshot().bubble.state === 'RESTING', undefined, { timeout: 30000 });
  await page.waitForTimeout(500);
};

/** Fires when the world emits this event, and a few frames later leaves the page ready to be shot. */
const armEvent = (type) =>
  page.evaluate((t) => {
    window.__hit = false;
    const off = window.__db.world.onEvent((e) => {
      if (e.type === t) {
        window.__hit = true;
        off();
      }
    });
  }, type);
const waitEvent = (ms = 40000) => page.waitForFunction(() => window.__hit === true, undefined, { timeout: ms });

const pull = async (fraction = 1) => {
  const plan = await page.evaluate((f) => {
    const db = window.__db;
    const shot = db.nextShot() ?? { power: 0.7, thetaDeg: 0 };
    const reach = db.tuning.PULL_MAX_PX * Math.max(shot.power, 0.5) * f * db.ctx.scale.zoom;
    const theta = (shot.thetaDeg * Math.PI) / 180;
    return { dx: -Math.sin(theta) * reach, dy: -Math.cos(theta) * reach, w: window.innerWidth, h: window.innerHeight };
  }, fraction);
  const cdp = await context.newCDPSession(page);
  const x0 = Math.round(plan.w / 2);
  const y0 = Math.round(plan.h * 0.86);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 0 }] });
  for (let k = 1; k <= 6; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + (plan.dx * k) / 6), y: Math.round(y0 + (plan.dy * k) / 6), id: 0 }] });
    await page.waitForTimeout(30);
  }
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
};

// The sling at low and at full pull, launch and flight.
await boot(0);
await snap('00_rest_ambient');
let release = await pull(0.45);
await page.waitForTimeout(250);
await snap('01_pull_low');
await release();
await page.waitForFunction(() => window.__db.world.snapshot().bubble.state === 'RESTING', undefined, { timeout: 15000 }).catch(() => undefined);
await page.waitForTimeout(300);
release = await pull(1.4);
await page.waitForTimeout(450);
await snap('02_pull_full');
await armEvent('launch');
await release();
await waitEvent();
await page.waitForTimeout(50);
await snap('03_launch');
await page.waitForTimeout(160);
await snap('04_flight');

// A rest from real play. Bounce, pickup and buoy are forced: real shots rarely bring them in a short run.
await armEvent('rest');
if (await waitEvent(15000).then(() => true, () => false)) await snap('06_rest');
else console.log('SKIPPED 06_rest: she did not reach a ledge in time');

// Holds Bur at a point for a moment, so the camera is on her when the thing happens.
const holdAt = async (x, y, ms = 900) => {
  await page.evaluate(
    ([hx, hy]) => {
      clearInterval(window.__hold);
      window.__hold = setInterval(() => {
        const b = window.__db.world.snapshot().bubble;
        b.state = 'LAUNCHED';
        b.restingOnId = null;
        b.restMs = 0;
        b.launchedMs = 0;
        b.air = 5;
        b.vel.x = 0;
        b.vel.y = 0;
        b.pos.x = hx;
        b.pos.y = hy;
      }, 16);
    },
    [x, y],
  );
  await page.waitForTimeout(ms);
};
const letGo = () => page.evaluate(() => clearInterval(window.__hold));

await boot(0);
const wall = await page.evaluate(() => {
  const s = window.__db.world.snapshot();
  const y = s.camera.y + s.camera.viewH * 0.4;
  const w = s.entities.find((e) => e.type === 'wall' && e.rect.y < y && e.rect.y + e.rect.h > y);
  return w ? { x: w.rect.x, w: w.rect.w, y } : null;
});
if (wall) {
  const fromLeft = wall.x > 270;
  await holdAt(fromLeft ? wall.x - 24 : wall.x + wall.w + 24, wall.y);
  await armEvent('bounce');
  await letGo();
  await page.evaluate((v) => {
    window.__db.world.snapshot().bubble.vel.x = v;
  }, fromLeft ? 430 : -430);
  await waitEvent(5000).catch(() => console.log('no bounce event'));
  await snap('05_bounce');
} else {
  console.log('SKIPPED 05_bounce: no wall streamed in');
}

await boot(0);
const pickup = await page.evaluate(() => {
  const s = window.__db.world.snapshot();
  const air = (e) => e.type === 'pickup' && (e.pickupType === 'aire' || e.pickupType === 'aireGrande');
  const inView = (e) => e.pos.y > s.camera.y + 20;
  const p = s.entities.find((e) => air(e) && inView(e)) ?? s.entities.find((e) => e.type === 'pickup' && inView(e));
  return p ? { x: p.pos.x, y: p.pos.y, type: p.pickupType } : null;
});
if (pickup) {
  await holdAt(pickup.x - 30, pickup.y);
  await armEvent('pickup');
  await letGo();
  await page.evaluate(() => {
    window.__db.world.snapshot().bubble.vel.x = 240;
  });
  await waitEvent(5000).catch(() => console.log('no pickup event'));
  await snap(`07_pickup_${pickup.type}`);
  await page.waitForTimeout(120);
  await snap(`07_pickup_${pickup.type}_b`);
} else {
  console.log('SKIPPED 07_pickup: none streamed in');
}

// A buoy: pushed down until she crosses it.
await boot(0);
await armEvent('boya');
await page.waitForFunction(
  () => {
    if (window.__hit) return true;
    const b = window.__db.world.snapshot().bubble;
    b.air = 5;
    b.state = 'LAUNCHED';
    b.restingOnId = null;
    b.restMs = 0;
    b.launchedMs = 0;
    b.vel.x = 0;
    b.vel.y = 40;
    b.pos.y += 25;
    return false;
  },
  undefined,
  { timeout: 30000, polling: 40 },
);
await snap('08_boya');
await boot(0);
await armEvent('stationEnter');
await page.waitForFunction(
  () => {
    const sn = window.__db.world.snapshot();
    if (sn.phase !== 'playing') return true;
    sn.bubble.air = 5;
    sn.bubble.state = 'LAUNCHED';
    sn.bubble.restingOnId = null;
    sn.bubble.restMs = 0;
    sn.bubble.launchedMs = 0;
    sn.bubble.vel.x = 0;
    sn.bubble.vel.y = 40;
    sn.bubble.pos.y += 40;
    return false;
  },
  undefined,
  { timeout: 60000, polling: 40 },
);
await page.waitForTimeout(200);
await snap('09_station_moment');
await page.waitForTimeout(1500);
await snap('10_station_screen');

// A blow, and the last pip going.
for (const station of [0, 1, 2, 3, 4, 5, 6, 7]) {
  await boot(station);
  if (await page.evaluate(() => window.__db.world.snapshot().entities.some((e) => e.type === 'hazard'))) break;
}
// One pip, and a hazard brought onto her in the middle of the view, so the whole deflate is on screen.
const killBur = async () => {
  const at = await page.evaluate(() => {
    const c = window.__db.world.snapshot().camera;
    return { x: c.renderX + c.viewW / 2, y: c.renderY + c.viewH * 0.45 };
  });
  await holdAt(at.x, at.y, 500);
  await letGo();
  const moved = await page.evaluate((p) => {
    const first = window.__db.world.snapshot();
    const hazard = first.entities.find((e) => e.type === 'hazard');
    if (!hazard) return false;
    hazard.shape.x = p.x - hazard.shape.w / 2;
    hazard.shape.y = p.y - hazard.shape.h / 2;
    // Held there with one pip until its active window catches her.
    const timer = setInterval(() => {
      const sn = window.__db.world.snapshot();
      if (sn.bubble.state === 'DEAD' || sn.phase !== 'playing') {
        clearInterval(timer);
        return;
      }
      sn.bubble.air = 1;
      sn.bubble.vel.x = 0;
      sn.bubble.vel.y = 0;
      sn.bubble.pos.x = p.x;
      sn.bubble.pos.y = p.y;
      sn.bubble.state = 'LAUNCHED';
      sn.bubble.restingOnId = null;
      sn.bubble.flags.invulnUntil = 0;
    }, 16);
    return true;
  }, at);
  if (!moved) console.log('SKIPPED on-screen deflate: no hazard streamed in');
};
await armEvent('deflate');
await killBur();
await waitEvent();
await snap('11_deflate_a');
await page.waitForTimeout(220);
await snap('12_deflate_b');
await page.waitForTimeout(150);
await snap('13_deflate_c');
await page.waitForFunction(() => window.__db.world.snapshot().phase === 'dead');
await page.waitForTimeout(450);
await snap('14_dead_screen');
await armEvent('respawn');
await page.evaluate(() => window.__db.world.restart());
await waitEvent(5000).catch(() => console.log('no respawn event'));
await page.waitForTimeout(60);
await snap('15_respawn_a');
await page.waitForTimeout(240);
await snap('16_respawn_b');

console.log('max draw calls across these frames:', maxCalls);
await browser.close();
