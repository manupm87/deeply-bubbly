/**
 * The Three.js shell end to end, on a Pixel 7 profile with real touches: boot, framing, a real shot and
 * its landing, release vs abort (D2), the peek on a second finger, pause and the end screens, the world
 * map into a level, and the model registry with and without models.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  Finger,
  SAVE_AT_STATION_0,
  bootGame,
  cameraSettled,
  collectErrors,
  modelsSettled,
  pullForNextShot,
  readSave,
  recordEvents,
  scenes,
  seedSave,
  tapButton,
  visibleButtons,
  waitForResting,
} from './helpers';

const SHOTS = 'test-results/shots';

async function shot(page: Page, name: string): Promise<void> {
  // Past the overlays' CSS fade, so the picture shows the screen and not its first frames.
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The manifest answers 404: this is what a build with an empty `public/models` does. */
async function withoutModels(page: Page): Promise<void> {
  await page.route('**/models/manifest.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
}

const ignoringModel404 = (errors: readonly string[]): string[] =>
  errors.filter((e) => !e.includes('Failed to load resource'));

test('boots into a first run: canvas, HUD, tutorial, draw calls in budget, no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  const models = await modelsSettled(page);
  expect(await scenes(page)).toEqual(['Game', 'Hud']);
  await expect(page.locator('#stage')).toBeVisible();
  await expect(page.locator('[data-testid=tutorial]')).toBeVisible();
  await expect(page.locator('[data-testid=depth]')).toContainText('m');
  await page.waitForFunction(() => (window.__db?.world.snapshot().timeMs ?? 0) > 200);
  const info = await page.evaluate(() => window.__db?.renderInfo());
  expect(info?.calls ?? 0).toBeGreaterThan(0);
  expect(info?.calls ?? 999).toBeLessThan(150);
  await shot(page, models.loaded > 0 ? 'boot-models' : 'boot');
  expect(errors).toEqual([]);
});

test('the camera frames exactly the design view at renderX/renderY', async ({ page }) => {
  await withoutModels(page);
  await bootGame(page);
  await waitForResting(page);
  await cameraSettled(page);
  const frame = await page.evaluate(() => {
    const db = window.__db;
    const cam = db?.world.snapshot().camera;
    const s = db?.ctx.scale;
    if (!db || !cam || !s) throw new Error('no debug handle');
    return {
      topLeft: db.project(cam.renderX, cam.renderY),
      bottomRight: db.project(cam.renderX + cam.viewW, cam.renderY + cam.viewH),
      expectedLeft: s.offsetX,
      expectedTop: s.offsetY,
      expectedW: s.viewW * s.zoom,
      expectedH: s.viewH * s.zoom,
      viewW: cam.viewW,
      viewH: cam.viewH,
    };
  });
  expect(frame.viewW).toBe(180);
  expect(frame.viewH).toBeGreaterThanOrEqual(320);
  expect(frame.viewH).toBeLessThanOrEqual(420);
  expect(Math.abs(frame.topLeft.x - frame.expectedLeft)).toBeLessThan(1);
  expect(Math.abs(frame.topLeft.y - frame.expectedTop)).toBeLessThan(1);
  expect(Math.abs(frame.bottomRight.x - (frame.expectedLeft + frame.expectedW))).toBeLessThan(1);
  expect(Math.abs(frame.bottomRight.y - (frame.expectedTop + frame.expectedH))).toBeLessThan(1);
});

test('a real shot: the pull draws the guide, the release launches, Bur lands lower', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await modelsSettled(page);
  await waitForResting(page);
  const startY = await page.evaluate(() => window.__db?.world.snapshot().bubble.pos.y ?? 0);
  const events = await recordEvents(page);

  const { finger } = await pullForNextShot(page);
  await page.waitForFunction(() => {
    const sn = window.__db?.world.snapshot();
    return sn !== undefined && sn.bubble.aimOrigin !== null && sn.trajectory.length > 1;
  });
  await shot(page, 'aiming');
  await finger.lift();

  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.state === 'LAUNCHED', undefined, { timeout: 15_000 });
  await page.waitForTimeout(250);
  await shot(page, 'flight');
  await waitForResting(page, 60_000);
  await shot(page, 'landed');

  const types = await events();
  expect(types).toContain('aimStart');
  expect(types).toContain('launch');
  expect(types).toContain('rest');
  const endY = await page.evaluate(() => window.__db?.world.snapshot().bubble.pos.y ?? 0);
  expect(endY).toBeGreaterThan(startY + 20);
  // The first launch ends the tutorial for good, through the same save contract as apps/web.
  await expect(page.locator('[data-testid=tutorial]')).toBeHidden();
  expect((await readSave(page))?.['tutorialDone']).toBe(true);
  expect(errors).toEqual([]);
});

test('release vs abort: pointercancel, pause and a release inside the cancel radius fire nothing', async ({ page }) => {
  await withoutModels(page);
  await page.addInitScript(() => {
    window.addEventListener('pointerdown', (e) => ((window as unknown as { __lastTouchId: number }).__lastTouchId = e.pointerId), true);
  });
  await bootGame(page);
  await waitForResting(page);
  const events = await recordEvents(page);

  // pointercancel mid-pull is an ABORT, whatever the pull was worth.
  let pull = await pullForNextShot(page);
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin !== null);
  await page.evaluate(() => {
    const canvas = document.getElementById('stage');
    const pointerId = (window as unknown as { __lastTouchId: number }).__lastTouchId;
    canvas?.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }));
  });
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin === null);
  await pull.finger.lift();
  await page.waitForTimeout(200);
  let types = await events();
  expect(types).toContain('aimCancel');
  expect(types).not.toContain('launch');

  // A press that comes back inside the cancel radius and lifts is a cancel with reason 'zone'.
  const x = await page.evaluate(() => window.innerWidth / 2);
  const y = await page.evaluate(() => window.innerHeight * 0.86);
  const tap = await Finger.press(page, x, y);
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin !== null);
  await tap.lift();
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin === null);
  types = await events();
  expect(types).toContain('aimCancel');
  expect(types).not.toContain('launch');

  // Pausing mid-pull aborts too, and "Seguir" must not fire it.
  pull = await pullForNextShot(page);
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin !== null);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin === null);
  await expect(page.getByRole('button', { name: 'Reiniciar Inmersión' })).toBeVisible();
  await shot(page, 'pause');
  await pull.finger.lift();
  await tapButton(page, 'pause.resume');
  await page.waitForTimeout(200);
  types = await events();
  expect(types).not.toContain('launch');
});

test('the minimap peeks on a second finger without touching the pull', async ({ page }) => {
  await withoutModels(page);
  await bootGame(page);
  await waitForResting(page);
  const events = await recordEvents(page);
  const map = (await visibleButtons(page)).find((b) => b.id === 'minimap');
  if (!map) throw new Error('no minimap on screen');

  // One finger on the map alone: a peek, and no aim.
  const alone = await Finger.press(page, map.x + map.w * 0.45, map.y + map.h * 0.45, 7);
  await page.waitForFunction(() => Math.hypot(window.__db?.world.snapshot().camera.peekX ?? 0, window.__db?.world.snapshot().camera.peekY ?? 0) > 2);
  expect(await page.evaluate(() => window.__db?.world.snapshot().bubble.aimOrigin ?? null)).toBeNull();
  await shot(page, 'peek');
  await alone.lift();
  await page.waitForFunction(() => Math.hypot(window.__db?.world.snapshot().camera.peekX ?? 9, window.__db?.world.snapshot().camera.peekY ?? 9) < 1, undefined, { timeout: 20_000 });

  // A pull held while a second finger comes and goes on the map: never fires, and survives the lift.
  const pull = await pullForNextShot(page);
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.aimOrigin !== null);
  const pullPoint = pull.finger.point;
  const cdp = await page.context().newCDPSession(page);
  const second = { x: Math.round(map.x), y: Math.round(map.y), id: 9 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pullPoint, second] });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  await cdp.detach();
  await page.waitForTimeout(100);
  expect(await events()).not.toContain('launch');
  expect(await page.evaluate(() => window.__db?.world.snapshot().bubble.aimOrigin ?? null)).not.toBeNull();
  await pull.finger.lift();
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.state === 'LAUNCHED', undefined, { timeout: 15_000 });
  expect(await events()).toContain('launch');
});

test('the end screen comes from the snapshot and "Otra vez" restarts', async ({ page }) => {
  await withoutModels(page);
  await bootGame(page);
  await waitForResting(page);
  await page.evaluate(() => {
    const sn = window.__db?.world.snapshot();
    if (!sn) return;
    sn.bubble.air = 1;
    sn.bubble.pos.y = sn.camera.y - 120;
    sn.bubble.vel.x = 0;
    sn.bubble.vel.y = -160;
    sn.bubble.state = 'LAUNCHED';
    sn.bubble.restingOnId = null;
    sn.bubble.restMs = 0;
    sn.bubble.launchedMs = 0;
  });
  await page.waitForFunction(() => window.__db?.world.snapshot().phase === 'dead', undefined, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Otra vez' })).toBeVisible();
  await shot(page, 'dead');
  await tapButton(page, 'dead.giant');
  await page.waitForFunction(() => window.__db?.world.snapshot().phase === 'playing');
  await expect(page.getByRole('button', { name: 'Otra vez' })).toBeHidden();
});

test('a station shows its screen, and "Seguir bajando" and "Mapa" both work', async ({ page }) => {
  await withoutModels(page);
  await bootGame(page);
  const toStation = async (): Promise<void> => {
    await page.waitForFunction(() => {
      const sn = window.__db?.world.snapshot();
      if (!sn) return false;
      if (sn.phase !== 'playing') return sn.phase === 'station';
      sn.bubble.air = 5;
      sn.bubble.state = 'LAUNCHED';
      sn.bubble.restingOnId = null;
      sn.bubble.restMs = 0;
      sn.bubble.launchedMs = 0;
      sn.bubble.vel.x = 0;
      sn.bubble.vel.y = 0;
      sn.bubble.pos.y += 60;
      return false;
    }, undefined, { timeout: 60_000, polling: 60 });
  };
  await toStation();
  await expect(page.getByRole('button', { name: 'Seguir bajando' })).toBeVisible();
  await shot(page, 'station');
  expect((await readSave(page))?.['unlockedStation']).toBe(0);
  await tapButton(page, 'station.giant');
  await page.waitForFunction(() => window.__db?.world.snapshot().phase === 'playing');
  await toStation();
  await tapButton(page, 'station.map');
  expect(await scenes(page)).toEqual(['Map']);
  const states = Object.fromEntries((await visibleButtons(page)).filter((b) => b.state !== undefined).map((b) => [b.id, b.state]));
  expect(states['map.level.1']).toBe('completed');
});

test('a returning player boots on the map, a locked node refuses and an open node starts the level', async ({ page }) => {
  await withoutModels(page);
  await seedSave(page, SAVE_AT_STATION_0);
  const errors = collectErrors(page);
  await bootGame(page);
  expect(await scenes(page)).toEqual(['Map']);
  await shot(page, 'map');

  const buttons = await visibleButtons(page);
  const byId = (id: string): string | undefined => buttons.find((b) => b.id === id)?.state;
  expect(byId('map.level.1')).toBe('completed');
  expect(byId('map.level.2')).toBe('available');
  expect(byId('map.level.3')).toBe('locked');

  await tapButton(page, 'map.level.3');
  await page.waitForTimeout(150);
  expect(await scenes(page)).toEqual(['Map']);

  await tapButton(page, 'map.level.2');
  await page.waitForFunction(() => window.__db?.scenes().includes('Game'));
  const y = await page.evaluate(() => window.__db?.world.snapshot().bubble.pos.y ?? 0);
  expect(y).toBeGreaterThan(1000); // station 0 of the MVP campaign sits at 1200 px
  await page.waitForFunction(() => (window.__db?.world.snapshot().timeMs ?? 0) > 100);
  await waitForResting(page);
  await shot(page, 'level-2');

  // "Salir" in the pause menu goes back to the map, and the save lost nothing.
  await tapButton(page, 'pause.open');
  await tapButton(page, 'pause.quit');
  expect(await scenes(page)).toEqual(['Map']);
  expect((await readSave(page))?.['unlockedStation']).toBe(0);
  expect(ignoringModel404(errors)).toEqual([]);
});

test('models: no manifest, a broken manifest and a missing file all fall back to primitives', async ({ page }) => {
  const errors = collectErrors(page);
  await withoutModels(page);
  await bootGame(page);
  let models = await modelsSettled(page);
  expect(models.loaded).toBe(0);
  expect(models.burUsesModel).toBe(false);
  await waitForResting(page);
  await shot(page, 'primitives');

  await page.unroute('**/models/manifest.json');
  await page.route('**/models/manifest.json', (route) => route.fulfill({ status: 200, body: '<!doctype html>not json' }));
  await bootGame(page);
  models = await modelsSettled(page);
  expect(models.loaded).toBe(0);

  await page.unroute('**/models/manifest.json');
  await page.route('**/models/manifest.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ assets: [{ name: 'bur', file: 'does-not-exist.glb', kind: 'player', size: { w: 14, h: 14 } }, { nonsense: true }] }),
    }),
  );
  await bootGame(page);
  models = await modelsSettled(page);
  expect(models.loaded).toBe(0);
  expect(models.failed).toEqual(['bur']);
  expect(models.burUsesModel).toBe(false);
  await waitForResting(page);
  expect(ignoringModel404(errors)).toEqual([]);
});

test('models: a manifest swaps the primitives, and Bur is the glb', async ({ page }) => {
  const manifest = await page.request.get('/models/manifest.json');
  test.skip(!manifest.ok(), 'public/models has no manifest in this tree');
  await bootGame(page);
  const models = await modelsSettled(page);
  expect(models.failed).toEqual([]);
  expect(models.loaded).toBeGreaterThan(0);
  expect(models.burUsesModel).toBe(true);
  await waitForResting(page);
  const info = await page.evaluate(() => window.__db?.renderInfo());
  expect(info?.calls ?? 999).toBeLessThan(150);
  await shot(page, 'models');
});

test('models: every glb of the manifest loads, nothing falls back, and models sit on their collision boxes', async ({ page }) => {
  const manifest = await page.request.get('/models/manifest.json');
  test.skip(!manifest.ok(), 'public/models has no manifest in this tree');
  const { assets } = (await manifest.json()) as { assets: unknown[] };
  const errors = collectErrors(page);
  for (const start of [0, 1, 2, 3]) {
    await bootGame(page, `&start=${start}`);
    const models = await modelsSettled(page);
    expect(models.failed).toEqual([]);
    expect(models.loaded).toBe(assets.length);
    const rows = await page.evaluate(() => window.__db?.audit() ?? []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.model).map((r) => r.tag)).toEqual([]);
    // A clip moves a creature's edges by a px or two; Don Hinchón deflates on purpose, and his box is
    // the inflated one, so he has his own test in the bot's report rather than this bound.
    const off = rows.filter((r) => r.error !== null && r.error > 3 && r.tag !== 'cat5');
    expect(off).toEqual([]);
    const info = await page.evaluate(() => window.__db?.renderInfo());
    expect(info?.calls ?? 999).toBeLessThan(150);
    await shot(page, `scene-start-${start}`);
  }
  expect(errors).toEqual([]);
});

test('resizing keeps the framing, and a landscape phone gets the curtain and the pause', async ({ page }) => {
  await withoutModels(page);
  await bootGame(page);
  await waitForResting(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.waitForFunction(() => window.innerWidth === 360);
  await page.waitForTimeout(100);
  await cameraSettled(page);
  const framing = await page.evaluate(() => {
    const db = window.__db;
    const cam = db?.world.snapshot().camera;
    if (!db || !cam) throw new Error('no debug handle');
    const s = db.ctx.scale;
    return { at: db.project(cam.renderX, cam.renderY), left: s.offsetX, top: s.offsetY, viewH: cam.viewH, expectedH: s.viewH };
  });
  expect(framing.viewH).toBe(framing.expectedH);
  expect(Math.abs(framing.at.x - framing.left)).toBeLessThan(1.5);
  expect(Math.abs(framing.at.y - framing.top)).toBeLessThan(1.5);

  await page.setViewportSize({ width: 900, height: 412 });
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate')).toHaveText('Gira el móvil');
  const time = await page.evaluate(() => window.__db?.world.snapshot().timeMs ?? 0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__db?.world.snapshot().timeMs ?? -1)).toBe(time);
  await page.setViewportSize({ width: 412, height: 839 });
  await expect(page.locator('#rotate')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reiniciar Inmersión' })).toBeVisible();
});
