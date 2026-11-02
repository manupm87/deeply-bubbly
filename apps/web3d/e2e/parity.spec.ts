/**
 * Gameplay parity with `apps/web`: gesture edge cases, resaca, the save and the map. Every state read goes
 * through `ctx.snapshot`, the copy the shell took this frame: `world.snapshot()` DRAINS the event queue,
 * and a test polling it would eat the events the shell is supposed to react to.
 */
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { SAVE_AT_STATION_0, SAVE_KEY, bootGame, readSave, scenes, seedSave, tapButton, visibleButtons } from './helpers';

const FIRST_RUN = { ...SAVE_AT_STATION_0, unlockedStation: -1, bestDepthM: 0, pearls: 0, shellsByImmersion: {} };

interface Read {
  phase: string;
  state: string;
  air: number;
  aim: boolean;
  aimValid: boolean;
  down: boolean;
  timeMs: number;
  velX: number;
  velY: number;
}

interface LiveBubble {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  state: string;
  restingOnId: string | null;
  restMs: number;
  launchedMs: number;
  air: number;
  aimOrigin: unknown;
  aimValid: boolean;
}

/** The parts of the debug handle only this file needs; `helpers.ts` declares the common ones. */
interface Probe {
  __db: {
    ctx: {
      snapshot: { phase: string; timeMs: number; bubble: LiveBubble; camera: { y: number } } | null;
      pointer: { down: boolean };
      scale: { zoom: number; offsetX: number };
      settings: Record<string, boolean>;
    };
    tuning: { AIM_MAX_MS: number };
    shell: { aim: { trajectory: { dots: Array<{ visible: boolean }> } } };
    world: { onEvent(listener: (e: { type: string; airLaunch?: boolean }) => void): () => void };
  };
  __log: string[];
  __contexts: AudioContext[];
}

const read = (page: Page): Promise<Read> =>
  page.evaluate(() => {
    const db = (window as unknown as Probe).__db;
    const sn = db.ctx.snapshot;
    if (!sn) throw new Error('no snapshot yet');
    const b = sn.bubble;
    return {
      phase: sn.phase,
      state: b.state,
      air: b.air,
      aim: b.aimOrigin !== null,
      aimValid: b.aimValid,
      down: db.ctx.pointer.down,
      timeMs: sn.timeMs,
      velX: b.vel.x,
      velY: b.vel.y,
    };
  });

const resting = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.state === 'RESTING', undefined, { timeout: 30_000 });

const log = async (page: Page): Promise<() => Promise<string[]>> => {
  await page.evaluate(() => {
    const w = window as unknown as Probe;
    w.__log = [];
    w.__db.world.onEvent((e) => w.__log.push(e.type + (e.airLaunch ? ':air' : '')));
  });
  return () => page.evaluate(() => (window as unknown as Probe).__log);
};

/** Several fingers at once over CDP; `touchEnd` lifts exactly the points it lists (HANDOFF §5). */
class Hand {
  private readonly points = new Map<number, { x: number; y: number }>();
  private constructor(private readonly cdp: CDPSession) {}

  static async open(page: Page): Promise<Hand> {
    return new Hand(await page.context().newCDPSession(page));
  }

  private list(): Array<{ id: number; x: number; y: number }> {
    return [...this.points].map(([id, p]) => ({ id, x: Math.round(p.x), y: Math.round(p.y) }));
  }

  async down(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.list() });
  }

  async move(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.list() });
  }

  async up(id: number): Promise<void> {
    const p = this.points.get(id);
    if (!p) return;
    this.points.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ id, x: Math.round(p.x), y: Math.round(p.y) }],
    });
  }

  /** A press low on the screen, then a drag of (dx, dy) design px; the finger stays down. */
  async pull(page: Page, id: number, dx: number, dy: number): Promise<{ x: number; y: number }> {
    const { w, h, zoom } = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
      zoom: (window as unknown as Probe).__db.ctx.scale.zoom,
    }));
    const start = { x: w / 2, y: h * 0.7 };
    await this.down(id, start.x, start.y);
    await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.aimOrigin !== null);
    for (let k = 1; k <= 4; k++) {
      await this.move(id, start.x + (dx * zoom * k) / 4, start.y + (dy * zoom * k) / 4);
      await page.waitForTimeout(30);
    }
    return { x: start.x + dx * zoom, y: start.y + dy * zoom };
  }
}

const sinkToStation = (page: Page): Promise<unknown> =>
  page.waitForFunction(
    () => {
      const sn = (window as unknown as Probe).__db.ctx.snapshot;
      if (!sn) return false;
      if (sn.phase !== 'playing') return sn.phase === 'station';
      const b = sn.bubble;
      b.air = 5;
      b.state = 'LAUNCHED';
      b.restingOnId = null;
      b.restMs = 0;
      b.launchedMs = 0;
      b.vel.x = 0;
      b.vel.y = 0;
      b.pos.y += 60;
      return false;
    },
    undefined,
    { timeout: 60_000, polling: 60 },
  );

test.beforeEach(async ({ page }) => {
  await page.route('**/models/**', (route) => route.fulfill({ status: 404, body: 'none' }));
});

// --- Gestures --------------------------------------------------------------------------------------

test('a second finger on the canvas neither steers nor fires, and does not take over from the first', async ({ page }) => {
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  const events = await log(page);
  const hand = await Hand.open(page);
  const { w, h } = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

  await hand.pull(page, 0, 0, -50);
  await hand.down(1, w * 0.25, h * 0.6);
  await page.waitForTimeout(60);
  await hand.move(1, w * 0.8, h * 0.3);
  await page.waitForTimeout(60);
  await hand.up(1);
  await page.waitForTimeout(100);
  expect((await read(page)).aim).toBe(true);
  expect(await events()).not.toContain('launch');

  await hand.down(1, w * 0.25, h * 0.6);
  await page.waitForTimeout(60);
  await hand.up(0);
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.state !== 'AIMING');
  const launched = await read(page);
  // Straight down: the second finger's far-off position never entered the pull.
  expect(Math.abs(launched.velX)).toBeLessThan(1);
  expect(launched.velY).toBeGreaterThan(0);
  await hand.move(1, w * 0.25, h * 0.2);
  await page.waitForTimeout(100);
  expect((await read(page)).aim).toBe(false);
  await hand.up(1);
  await page.waitForTimeout(100);
  expect((await events()).filter((t) => t === 'launch')).toHaveLength(1);
});

test('a pull that asks for up is flagged and leaves flat, and a held pull times out without a shot', async ({ page }) => {
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  let events = await log(page);
  const hand = await Hand.open(page);

  await hand.pull(page, 0, 30, 40);
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.aimValid === false);
  await hand.up(0);
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.state !== 'AIMING');
  expect(await events()).toContain('launch');
  await resting(page);

  events = await log(page);
  const end = await hand.pull(page, 0, 0, -50);
  const aimMax = await page.evaluate(() => (window as unknown as Probe).__db.tuning.AIM_MAX_MS);
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.aimOrigin === null, undefined, {
    timeout: aimMax + 30_000,
  });
  await hand.move(0, end.x + 20, end.y - 30);
  await page.waitForTimeout(100);
  await hand.up(0);
  await page.waitForTimeout(200);
  const types = await events();
  expect(types).toContain('aimCancel');
  expect(types).not.toContain('launch');
  expect((await read(page)).aim).toBe(false);
});

test('the double jump costs what tuning says (D6: free), once, and a third press in the air does nothing', async ({ page }) => {
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  const events = await log(page);
  const hand = await Hand.open(page);
  const startAir = (await read(page)).air;

  await hand.pull(page, 0, 0, -60);
  await hand.up(0);
  await page.waitForFunction(() => (window as unknown as Probe).__log.includes('launch'));
  await hand.pull(page, 0, 0, -60);
  await hand.up(0);
  await page.waitForFunction(() => (window as unknown as Probe).__log.includes('launch:air'), undefined, { timeout: 15_000 });
  const cost = await page.evaluate(() => (window.__db?.tuning as unknown as { AIR_LAUNCH_COST: number }).AIR_LAUNCH_COST);
  expect((await read(page)).air).toBe(startAir - cost);

  // Spent: this press must open no aim while she is still falling.
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.state !== 'AIMING');
  const { w, h } = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await hand.down(0, w / 2, h * 0.7);
  await page.waitForTimeout(80);
  const third = await read(page);
  await hand.up(0);
  expect(third.state === 'RESTING' || !third.aim).toBe(true);
  expect((await events()).filter((t) => t === 'launch:air')).toHaveLength(1);
});

test('a press on the bars beside the column is a gesture, and the pause closes that door too', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  const events = await log(page);
  const offset = await page.evaluate(() => (window as unknown as Probe).__db.ctx.scale.offsetX);
  expect(offset).toBeGreaterThan(100);
  const hand = await Hand.open(page);

  await hand.down(0, offset / 2, 600);
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.aimOrigin !== null);
  await hand.move(0, offset / 2, 480);
  await page.waitForTimeout(60);
  await hand.up(0);
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.state !== 'AIMING');
  expect(await events()).toContain('launch');
  await resting(page);

  await tapButton(page, 'pause.open');
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible();
  await hand.down(0, offset / 2, 600);
  await page.waitForTimeout(60);
  expect((await read(page)).down).toBe(false);
  // "Seguir" taken with the bar still pressed: that contact belongs to the pause, not to a new aim.
  await tapButton(page, 'pause.resume');
  await page.waitForTimeout(150);
  expect((await read(page)).aim).toBe(false);
  await hand.up(0);
});

test('a mouse press dragged off a button leaves it clean, and a later pull released over it is a shot', async ({ page }) => {
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  const events = await log(page);
  const pause = (await visibleButtons(page)).find((b) => b.id === 'pause.open');
  if (!pause) throw new Error('no pause button');
  const { w, h } = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

  await page.mouse.move(pause.x, pause.y);
  await page.mouse.down();
  await page.mouse.move(w / 2, h * 0.7, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('.pause-open')).not.toHaveClass(/pressed/);
  expect((await read(page)).aim).toBe(false);

  await page.mouse.move(w / 2, h * 0.8);
  await page.mouse.down();
  await page.waitForFunction(() => (window as unknown as Probe).__db.ctx.snapshot?.bubble.aimOrigin !== null);
  await page.mouse.move(pause.x, pause.y, { steps: 4 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown as Probe).__log.includes('launch'), undefined, { timeout: 10_000 });
  expect(await events()).not.toContain('aimCancel');
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeHidden();
});

test('the guide of an aborted pull does not stay drawn under the pause menu', async ({ page }) => {
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  const dots = (): Promise<number> =>
    page.evaluate(() => (window as unknown as Probe).__db.shell.aim.trajectory.dots.filter((d) => d.visible).length);
  const hand = await Hand.open(page);
  await hand.pull(page, 0, 0, -50);
  await expect.poll(dots).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible();
  await expect.poll(dots).toBe(0);
  await hand.up(0);
});

// --- Resaca ------------------------------------------------------------------------------------------

test('resaca: the arrow shows, steps aside for the pause and the clock stops, then a pip goes and Bur returns', async ({ page }) => {
  await seedSave(page, FIRST_RUN);
  await bootGame(page);
  await resting(page);
  await log(page);
  const startAir = (await read(page)).air;
  await page.evaluate(() => {
    const sn = (window as unknown as Probe).__db.ctx.snapshot;
    if (!sn) return;
    const b = sn.bubble;
    b.pos.y = sn.camera.y - 60;
    b.vel.x = 0;
    b.vel.y = -5;
    b.state = 'LAUNCHED';
    b.restingOnId = null;
    b.restMs = 0;
    b.launchedMs = 0;
  });
  await page.waitForFunction(() => (window as unknown as Probe).__log.includes('resacaWarning'), undefined, { timeout: 15_000 });
  const arrow = page.locator('.resaca');
  await expect(arrow).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(arrow).toBeHidden();
  const frozen = (await read(page)).timeMs;
  await page.waitForTimeout(250);
  expect((await read(page)).timeMs).toBe(frozen);
  expect((await read(page)).air).toBe(startAir);
  await tapButton(page, 'pause.resume');

  await page.waitForFunction(() => (window as unknown as Probe).__log.includes('respawn'), undefined, { timeout: 15_000 });
  await expect(arrow).toBeHidden();
  const after = await read(page);
  expect(after.air).toBe(startAir - 1);
  expect(after.phase).toBe('playing');
});

// --- Save --------------------------------------------------------------------------------------------

test('a station does not undo the tutorial or a setting changed during the run', async ({ page }) => {
  // Seeded once, unlike `seedSave`: this test reloads, and the reload has to read what the game wrote.
  await page.addInitScript(
    ([key, json]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key, json);
    },
    [SAVE_KEY, JSON.stringify({ ...FIRST_RUN, tutorialDone: false })] as const,
  );
  await bootGame(page);
  await resting(page);
  const hand = await Hand.open(page);
  // The tutorial ends on a real hop, not on any launch: this is the pull that makes one.
  const shot = await page.evaluate(() => {
    const db = window.__db as unknown as { nextShot(): { power: number; thetaDeg: number }; tuning: { PULL_MAX_PX: number } };
    const s = db.nextShot();
    const reach = db.tuning.PULL_MAX_PX * s.power;
    const theta = (s.thetaDeg * Math.PI) / 180;
    return { dx: -Math.sin(theta) * reach, dy: -Math.cos(theta) * reach };
  });
  await hand.pull(page, 0, shot.dx, shot.dy);
  await hand.up(0);
  await expect(page.locator('[data-testid=tutorial]')).toBeHidden({ timeout: 30_000 });
  await resting(page);
  await tapButton(page, 'pause.open');
  await tapButton(page, 'pause.noShake');
  await tapButton(page, 'pause.resume');

  await sinkToStation(page);
  await expect
    .poll(async () => {
      const save = await readSave(page);
      const settings = save?.['settings'] as { noShake?: boolean } | undefined;
      return { unlocked: save?.['unlockedStation'], tutorial: save?.['tutorialDone'], noShake: settings?.noShake };
    })
    .toEqual({ unlocked: 0, tutorial: true, noShake: true });

  // The same answers after a reload: the map, and a run without the tutorial.
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__db !== undefined);
  expect(await scenes(page)).toEqual(['Map']);
  expect(await page.evaluate(() => (window as unknown as Probe).__db.ctx.settings['noShake'])).toBe(true);
  await tapButton(page, 'map.level.2');
  await page.waitForFunction(() => window.__db?.scenes().includes('Game'));
  await expect(page.locator('[data-testid=tutorial]')).toBeHidden();
});

// --- Map ---------------------------------------------------------------------------------------------

test('the map: a drag scrolls without entering, and a second finger taps a node while the first one scrolls', async ({ page }) => {
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  expect(await scenes(page)).toEqual(['Map']);
  const top = (): Promise<number> => page.evaluate(() => document.querySelector('.map-scroll')?.scrollTop ?? -1);
  const node = async (): Promise<{ x: number; y: number }> => {
    const found = (await visibleButtons(page)).find((b) => b.id === 'map.level.2');
    if (!found) throw new Error('no node 2');
    return found;
  };

  const hand = await Hand.open(page);
  const from = await node();
  const before = await top();
  await hand.down(0, from.x, from.y);
  for (let k = 1; k <= 5; k++) {
    await hand.move(0, from.x, from.y - 22 * k);
    await page.waitForTimeout(30);
  }
  await hand.up(0);
  await page.waitForTimeout(150);
  expect(await top()).toBeGreaterThan(before + 10);
  expect(await scenes(page)).toEqual(['Map']);

  const h = await page.evaluate(() => window.innerHeight);
  await hand.down(1, 8, h * 0.6);
  for (let k = 1; k <= 4; k++) {
    await hand.move(1, 8, h * 0.6 + 12 * k);
    await page.waitForTimeout(30);
  }
  const target = await node();
  await hand.down(2, target.x, target.y);
  await page.waitForTimeout(80);
  await hand.up(2);
  await expect.poll(() => scenes(page), { timeout: 3_000 }).toEqual(['Game', 'Hud']);
  await hand.up(1);
});

test('the sea goes quiet on the map and comes back with the run', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Probe;
    w.__contexts = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__contexts.push(this);
      }
    };
  });
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  const states = (): Promise<string[]> => page.evaluate(() => (window as unknown as Probe).__contexts.map((c) => c.state));

  // The first touch of the session lands on the map: it unlocks audio, and must not start the sea.
  await tapButton(page, 'map.level.2');
  await page.waitForFunction(() => window.__db?.scenes().includes('Game'));
  await expect.poll(states).toEqual(['running']);
  await tapButton(page, 'pause.open');
  await tapButton(page, 'pause.quit');
  await expect.poll(states).toEqual(['suspended']);
  await tapButton(page, 'map.level.1');
  await page.waitForFunction(() => window.__db?.scenes().includes('Game'));
  await expect.poll(states).toEqual(['running']);
});
