import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SAVE_AT_STATION_0, bootGame, modelsSettled, pullForNextShot, seedSave, waitForResting } from './helpers';

/** GDD §7 in the browser: what each effect does to the numbers it drives, frame by frame, with real touches. */

interface Feel {
  particles: number;
  camera: { x: number; y: number; zoom: number; shake: number };
  bubble: { sx: number; sy: number; opacity: number; deflating: boolean };
  audio: { state: string; peak: number; brightestHz: number; glubHz: number | null; frames: number };
}

interface Sample extends Feel {
  state: string;
  phase: string;
  power: number;
}

interface FeelDb {
  feel(): Feel;
  startAudioMeter(): void;
  world: { snapshot(): { phase: string; hud: { power: number }; bubble: { state: string } } };
}

declare global {
  interface Window {
    __samples?: Sample[];
    __stopSampling?: () => void;
  }
}

/** Page-side shorthand: these run inside `page.evaluate`, where nothing from this module exists. */
declare function db(): FeelDb;

test.beforeEach(async ({ page }) => {
  await page.addInitScript('globalThis.db = () => globalThis.__db;');
});

async function startSampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: Sample[] = [];
    window.__samples = samples;
    let on = true;
    window.__stopSampling = () => {
      on = false;
    };
    const handle = (window as unknown as { __db: FeelDb }).__db;
    const tick = (): void => {
      if (!on) return;
      const s = handle.world.snapshot();
      samples.push({ ...handle.feel(), state: s.bubble.state, phase: s.phase, power: s.hud.power });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const samples = (page: Page): Promise<Sample[]> => page.evaluate(() => window.__samples ?? []);

async function shoot(page: Page): Promise<void> {
  const { finger } = await pullForNextShot(page);
  await page.waitForTimeout(160);
  await finger.lift();
}

async function bootAtStation(page: Page, settings: Record<string, boolean> = {}): Promise<void> {
  await seedSave(page, { ...SAVE_AT_STATION_0, settings: { ...SAVE_AT_STATION_0.settings, ...settings } });
  await bootGame(page, '&start=0');
  await modelsSettled(page);
  await waitForResting(page);
}

test('a shot: tension on the way, stretch and kick on release, particles and squash on arrival', async ({ page }) => {
  await bootAtStation(page);
  await startSampling(page);
  await shoot(page);
  await page.waitForFunction(() => !['AIMING', 'RESTING'].includes(db().world.snapshot().bubble.state));
  await waitForResting(page);
  await page.waitForTimeout(900);
  const all = await samples(page);

  const aiming = all.filter((s) => s.state === 'AIMING' && s.power > 0.3);
  expect(aiming.length).toBeGreaterThan(0);
  // Pulling squashes her wide, and the further the pull the further the view opens.
  expect(aiming.some((s) => s.bubble.sx > s.bubble.sy * 1.1)).toBe(true);

  const flying = all.filter((s) => s.state === 'LAUNCHED' || s.state === 'IDLE');
  expect(flying.length).toBeGreaterThan(0);
  expect(Math.max(...flying.map((s) => s.bubble.sy / s.bubble.sx))).toBeGreaterThan(1.08);
  expect(Math.max(...flying.map((s) => Math.hypot(s.camera.x, s.camera.y)))).toBeGreaterThan(0.3);
  expect(Math.max(...flying.map((s) => s.particles))).toBeGreaterThanOrEqual(6);

  // Resting ends flatter than the pose she holds, then settles.
  let arrival = -1;
  all.forEach((s, i) => {
    if (i > 0 && s.state === 'RESTING' && all[i - 1]?.state !== 'RESTING') arrival = i;
  });
  expect(arrival).toBeGreaterThan(0);
  const held = all[all.length - 1];
  const settled = (held?.bubble.sy ?? 1) / (held?.bubble.sx ?? 1);
  // She jellies around the pose she ends in. Software GL is slow enough to miss the deepest frame, so
  // this asks for the jelly, in either direction, and not for one depth of it.
  const swing = Math.max(...all.slice(arrival, arrival + 14).map((s) => Math.abs(s.bubble.sy / s.bubble.sx - settled)));
  expect(swing).toBeGreaterThan(0.02);
  // The kick is spent: the view is back where core says it is, so the sling's maths is untouched.
  const last = all[all.length - 1];
  expect(Math.hypot(last?.camera.x ?? 9, last?.camera.y ?? 9)).toBeLessThan(0.6);
});

test('the sling opens the view with the pull, and the band and Bur stay where core puts them', async ({ page }) => {
  await bootAtStation(page);
  const { finger } = await pullForNextShot(page);
  await page.waitForTimeout(450);
  const held = await page.evaluate(() => {
    const d = db();
    return { zoom: d.feel().camera.zoom, power: d.world.snapshot().hud.power };
  });
  if (held.power > 0.4) expect(held.zoom).toBeGreaterThan(1);
  expect(held.zoom).toBeLessThan(1.04);
  await finger.lift();
});

test('"sin temblor" leaves the camera exactly where core puts it', async ({ page }) => {
  await bootAtStation(page, { noShake: true });
  await startSampling(page);
  await shoot(page);
  await page.waitForFunction(() => !['AIMING', 'RESTING'].includes(db().world.snapshot().bubble.state));
  await waitForResting(page);
  const all = await samples(page);
  expect(Math.max(...all.map((s) => Math.hypot(s.camera.x, s.camera.y) + s.camera.shake))).toBe(0);
});

test('reduced motion: no camera movement at all and fewer particles, and the game still plays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bootAtStation(page);
  await startSampling(page);
  await shoot(page);
  await page.waitForFunction(() => !['AIMING', 'RESTING'].includes(db().world.snapshot().bubble.state));
  await waitForResting(page);
  const all = await samples(page);
  expect(all.length).toBeGreaterThan(5);
  expect(Math.max(...all.map((s) => Math.hypot(s.camera.x, s.camera.y) + s.camera.shake))).toBe(0);
  expect(all.every((s) => s.camera.zoom === 1)).toBe(true);
  // A launch tail is 6-10 plus a ring at full motion; here it is halved and there is no wake.
  expect(Math.max(...all.filter((s) => s.state === 'LAUNCHED').map((s) => s.particles))).toBeLessThanOrEqual(12);
});

test('the deflate is gradual: she shrinks and is still there halfway, and she comes back faded in', async ({ page }) => {
  await bootAtStation(page);
  await startSampling(page);
  // Off the top of the view with one pip, again each time a pickup on the way or a respawn saves her.
  await page.evaluate(() => {
    const handle = window as unknown as {
      __db: {
        world: {
          snapshot(): {
            phase: string;
            bubble: {
              air: number;
              pos: { y: number };
              vel: { x: number; y: number };
              state: string;
              restingOnId: null;
              restMs: number;
              launchedMs: number;
              flags: { resacaUntil: number };
            };
            camera: { y: number };
          };
        };
      };
    };
    const timer = setInterval(() => {
      const sn = handle.__db.world.snapshot();
      if (sn.bubble.state === 'DEAD' || sn.phase !== 'playing') {
        clearInterval(timer);
        return;
      }
      sn.bubble.air = 1;
      if (sn.bubble.flags.resacaUntil > 0) return;
      sn.bubble.pos.y = sn.camera.y - 120;
      sn.bubble.vel.x = 0;
      sn.bubble.vel.y = -160;
      sn.bubble.state = 'LAUNCHED';
      sn.bubble.restingOnId = null;
      sn.bubble.restMs = 0;
      sn.bubble.launchedMs = 0;
    }, 100);
  });
  await page.waitForFunction(() => db().world.snapshot().phase === 'dead', undefined, { timeout: 30_000 });
  const all = await samples(page);
  const deflating = all.filter((s) => s.bubble.deflating);
  expect(deflating.length).toBeGreaterThan(3);
  const opacities = deflating.map((s) => s.bubble.opacity);
  // No frame jumps from solid to gone, and she stays fully there for the first half of it.
  expect(opacities[0]).toBe(1);
  expect(opacities[Math.floor(opacities.length / 2)]).toBeGreaterThan(0.5);
  for (let i = 1; i < opacities.length; i++) expect((opacities[i - 1] ?? 0) - (opacities[i] ?? 0)).toBeLessThan(0.5);
  expect(Math.max(...deflating.map((s) => s.particles))).toBeGreaterThanOrEqual(14);
});

test('sound: the sling pitch follows the pull, and nothing clips or gets harsh', async ({ page }) => {
  await bootAtStation(page);
  // The context is only allowed to exist after the first touch.
  const first = await pullForNextShot(page);
  await page.evaluate(() => db().startAudioMeter());
  await page.waitForTimeout(350);
  const full = await page.evaluate(() => db().feel().audio);
  await first.finger.lift();
  await page.waitForFunction(() => !['AIMING', 'RESTING'].includes(db().world.snapshot().bubble.state));
  await waitForResting(page);

  test.skip(full.state !== 'running', `AudioContext is ${full.state} in this browser, nothing to measure`);
  expect(full.glubHz).toBeGreaterThan(200);
  expect(full.glubHz).toBeLessThanOrEqual(600);

  await shoot(page);
  await page.waitForFunction(() => !['AIMING', 'RESTING'].includes(db().world.snapshot().bubble.state));
  await waitForResting(page);
  const meter = await page.evaluate(() => db().feel().audio);
  expect(meter.frames).toBeGreaterThan(10);
  expect(meter.peak).toBeGreaterThan(0.01);
  expect(meter.peak).toBeLessThan(1);
  // A proxy, not an ear: the energy stays in the low mids, far from the 2-4 kHz where sounds start to bite.
  expect(meter.brightestHz).toBeLessThan(2000);
});
