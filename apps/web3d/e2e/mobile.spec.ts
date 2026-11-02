/**
 * Phone-shaped regressions: the safe area at fractional zooms, HUD geometry across viewports and rotation,
 * GPU objects over a long descent, models against their collision boxes all the way down, and the station
 * band's edge. Real viewports and a real inset override; the dive itself teleports Bur to save wall clock.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SAVE_AT_STATION_0, bootGame, collectErrors, modelsSettled, seedSave, waitForResting } from './helpers';

const NOTCH_CSS = 47;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function emulateNotch(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { top: NOTCH_CSS, bottom: 34, left: 0, right: 0 } } as never);
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  return page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.checkVisibility());
    if (!el) throw new Error(`nothing visible matches ${sel}`);
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return { left, top, right, bottom };
  }, selector);
}

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function expectHudClean(page: Page, label: string): Promise<void> {
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const names = ['.pips', '.pause-open', '.depth-text', '.minimap', '.ribbon'];
  const boxes = await Promise.all(names.map((n) => boxOf(page, n)));
  boxes.forEach((box, i) => {
    expect(box.left, `${label}: ${names[i]} left`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${label}: ${names[i]} right`).toBeLessThanOrEqual(size.w + 0.5);
    expect(box.top, `${label}: ${names[i]} below the notch`).toBeGreaterThanOrEqual(NOTCH_CSS);
    expect(box.bottom, `${label}: ${names[i]} bottom`).toBeLessThanOrEqual(size.h);
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      if (a && b) expect(overlaps(a, b), `${label}: ${names[i]} over ${names[j]}`).toBe(false);
    }
  }
}

/** Fractional zooms either side of a rounding boundary, a letterboxed tall phone and a tablet. */
const PHONES: ReadonlyArray<readonly [string, number, number]> = [
  ['fold cover', 280, 653],
  ['small', 320, 568],
  ['iphone', 393, 852],
  ['large', 480, 1040],
  ['tall', 360, 900],
  ['tablet', 768, 1024],
];

for (const [name, width, height] of PHONES) {
  test(`${name} ${width}x${height}: map and HUD clear the notch, nothing overlaps, no errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height });
    await seedSave(page, SAVE_AT_STATION_0);
    await emulateNotch(page);
    await bootGame(page);
    const sound = await boxOf(page, '.map-sound');
    expect(sound.top).toBeGreaterThanOrEqual(NOTCH_CSS);
    expect((await boxOf(page, '.map-title')).top).toBeGreaterThanOrEqual(NOTCH_CSS);
    await page.evaluate(() => {
      const db = window.__db as unknown as { ctx: { bus: { emit(e: string, a: unknown): void } } };
      db.ctx.bus.emit('newRun', { startStationIndex: 0 });
    });
    await waitForResting(page);
    await expectHudClean(page, name);
    expect(errors).toEqual([]);
  });
}

test('rotation there and back keeps the HUD clear of the notch and the frame on the design view', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await seedSave(page, SAVE_AT_STATION_0);
  await emulateNotch(page);
  await bootGame(page, '&start=0');
  await waitForResting(page);
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(page.locator('#rotate')).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.locator('#rotate')).toBeHidden();
  await page.getByRole('button', { name: 'Seguir', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.minimap')?.checkVisibility() === true);
  await expectHudClean(page, 'after rotation');
  const frame = await page.evaluate(() => {
    const db = window.__db;
    const cam = db?.world.snapshot().camera;
    if (!db || !cam) throw new Error('no debug handle');
    return { at: db.project(cam.renderX + cam.viewW, cam.renderY + cam.viewH), w: window.innerWidth, h: db.ctx.scale.viewH * db.ctx.scale.zoom };
  });
  expect(Math.abs(frame.at.x - frame.w)).toBeLessThan(1.5);
  expect(Math.abs(frame.at.y - frame.h)).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

/** One poll of the dive: keeps Bur falling through the world, and past any screen that would stop her. */
async function diveStep(page: Page): Promise<{ y: number; textures: number; rows: Array<{ tag: string; error: number | null }> }> {
  return page.evaluate(() => {
    const db = window.__db as unknown as NonNullable<Window['__db']> & {
      world: { continueDescent(): void };
      ctx: { bus: { emit(e: string): void } };
      renderInfo(): { textures: number };
    };
    const s = db.world.snapshot();
    if (s.phase === 'station') {
      db.world.continueDescent();
      db.ctx.bus.emit('continue');
    } else if (s.phase === 'playing') {
      const b = s.bubble as Record<string, unknown> & { pos: { y: number }; vel: { x: number; y: number } };
      Object.assign(b, { air: 5, state: 'LAUNCHED', restingOnId: null, restMs: 0, launchedMs: 0 });
      b.vel.x = 0;
      b.vel.y = 0;
      b.pos.y += 45;
    }
    return { y: s.bubble.pos.y, textures: db.renderInfo().textures, rows: db.audit() };
  });
}

test('a long descent: GPU objects stay bounded, and models sit on their boxes all the way down', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await bootGame(page, '&start=0');
  expect((await modelsSettled(page)).failed).toEqual([]);
  await page.waitForFunction(() => (window.__db?.renderInfo().calls ?? 0) > 0);
  const worst = new Map<string, number>();
  let peak = 0;
  let first = -1;
  let y = 0;
  for (let i = 0; i < 200 && y < 6000; i++) {
    const step = await diveStep(page);
    y = step.y;
    if (y > 2000) {
      // After the first chunks: every kind of view exists once and the window is full.
      if (first < 0) first = step.textures;
      peak = Math.max(peak, step.textures);
    }
    for (const row of step.rows) {
      if (row.error !== null) worst.set(row.tag, Math.max(worst.get(row.tag) ?? 0, row.error));
    }
    await page.waitForTimeout(100);
  }
  expect(y).toBeGreaterThan(5000);
  // A live window holds a bounded number of skinned creatures; a leak adds some 20 per 1000 px.
  expect(peak - first).toBeLessThan(25);
  // A clip moves a creature's edges by up to ~4 px. Don Hinchón deflates on purpose: his box is the inflated one.
  const off = [...worst].filter(([tag, error]) => tag !== 'cat5' && error > 4);
  expect(off).toEqual([]);
  expect(errors).toEqual([]);
});

test('the station band has no hard bottom edge: it fades instead of reading as a UI panel', async ({ page }) => {
  await bootGame(page, '&start=0');
  await modelsSettled(page);
  await waitForResting(page);
  const edge = await page.evaluate(() => {
    const db = window.__db as unknown as NonNullable<Window['__db']> & { tuning: { CHUNK_H: number } };
    const s = db.world.snapshot() as unknown as { entities: Array<{ type: string; worldY: number }> };
    const station = s.entities.find((e) => e.type === 'station');
    if (!station) throw new Error('no station in the window');
    return db.project(0, station.worldY + db.tuning.CHUNK_H).y;
  });
  const png = (await page.screenshot({ type: 'png' })).toString('base64');
  const step = await page.evaluate(
    async ({ data, y }) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext('2d');
      if (!g) throw new Error('no 2d context');
      g.drawImage(bitmap, 0, 0);
      const ratio = bitmap.width / window.innerWidth;
      const row = (cssY: number): Uint8ClampedArray => g.getImageData(0, Math.round(cssY * ratio), bitmap.width, 1).data;
      // The band sits behind the play plane, so perspective draws its edge some px off the projected line:
      // the sharpest step in a strip around it. The median column, because a ledge or a creature crossing
      // the strip says nothing about the band.
      let sharpest = 0;
      for (let cssY = y - 30; cssY < y + 12; cssY += 2) {
        const above = row(cssY);
        const below = row(cssY + 3);
        const diffs: number[] = [];
        for (let x = 0; x < bitmap.width; x += 4) {
          const k = x * 4;
          diffs.push(Math.abs((above[k + 1] ?? 0) - (below[k + 1] ?? 0)));
        }
        diffs.sort((a, b) => a - b);
        sharpest = Math.max(sharpest, diffs[diffs.length >> 1] ?? 0);
      }
      return sharpest;
    },
    { data: png, y: edge },
  );
  expect(step).toBeLessThan(5);
});
