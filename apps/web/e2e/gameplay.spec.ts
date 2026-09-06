import { expect, test } from '@playwright/test';
import {
  PULL_CANCEL_DESIGN_PX,
  PULL_MAX_DESIGN_PX,
  bootGame,
  burX,
  burY,
  cameraState,
  cancelRadiusPx,
  collectErrors,
  gestureTuning,
  pullAndRelease,
  pullReachPx,
  recordEvents,
  spendAirLaunches,
  typesOf,
} from './helpers';

/**
 * A launch must move Bur clearly further than the idle float does. 15 design px, not the 30 of v1.1:
 * D4 halved the impulse (280 px/s instead of 430) and the Z1 chunks are still authored for the old
 * reach, so the opening shot bounces off the geometry under the raft after ~40 px instead of running
 * out its ≈195 px. What this test is really about is the `launch` event and its DIRECTION; the
 * distance goes back up when the re-authored content of stage B lands.
 */
const MIN_LAUNCH_TRAVEL_PX = 15;
/** How long the shot is watched, and how often. The peak of the arc is what counts, not the last frame. */
const WATCH_SAMPLES = 20;
const WATCH_STEP_MS = 60;

test('boots and runs three seconds without a console error', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await page.waitForTimeout(3_000);
  expect(errors).toEqual([]);
});

test('a slingshot pull launches Bur downward', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);

  const size = page.viewportSize();
  expect(size).not.toBeNull();
  const { width, height } = size ?? { width: 0, height: 0 };

  const events = await recordEvents(page);
  const before = await burY(page);
  // D2: the shot leaves the opposite way to the drag, so a full pull UP the screen is a straight-down
  // shot. Core measures it from the origin frozen at the pointerdown.
  const reach = await pullReachPx(page);
  await pullAndRelease(page, width / 2, height * 0.7, 0, -reach, 240);

  // The PEAK of the descent, sampled: she bounces back up off the legacy geometry within ~400 ms, so
  // a single reading after the fact says nothing about whether the shot happened.
  let travelled = 0;
  for (let i = 0; i < WATCH_SAMPLES; i++) {
    travelled = Math.max(travelled, (await burY(page)) - before);
    await page.waitForTimeout(WATCH_STEP_MS);
  }
  expect(travelled).toBeGreaterThan(MIN_LAUNCH_TRAVEL_PX);

  // The gesture reached the rules, and it reached them as a DOWNWARD shot at full power.
  const launch = (await events()).find((e) => e.type === 'launch');
  expect(launch).toBeDefined();
  expect((launch?.vel as { y: number } | undefined)?.y ?? 0).toBeGreaterThan(0);
  expect(launch?.power as number).toBeGreaterThan(0.9);
  expect(errors).toEqual([]);
});

/**
 * D2's cancel: "soltar con el dedo a menos de `PULL_CANCEL_PX` del origen cancela el tiro". The events
 * are what is asserted, not the distance travelled: Bur drifts a little on any ledge and a "she barely
 * moved" threshold would only be pinning the drift, whereas `aimCancel` with no `launch` is the rule.
 */
test('a release inside the cancel radius fires nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  const size = page.viewportSize() ?? { width: 412, height: 839 };

  const events = await recordEvents(page);
  const cancel = await cancelRadiusPx(page);
  // Half the cancel radius: unmistakably a drag, unmistakably inside the "no shot here" circle.
  await pullAndRelease(page, size.width / 2, size.height * 0.7, 0, -Math.round(cancel * 0.5), 200);
  await page.waitForTimeout(400);

  const seen = typesOf(await events());
  expect(seen).toContain('aimStart');
  expect(seen).toContain('aimCancel');
  expect(seen).not.toContain('launch');
  expect(errors).toEqual([]);
});

/**
 * D1: "un toque en el aire sin doble salto disponible no hace nada (ni evento ni castigo)". The budget
 * is spent by hand first, so the touch under test is the refused one and not the free double jump.
 */
test('a touch in the air with no double jump left does nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  const size = page.viewportSize() ?? { width: 412, height: 839 };

  await spendAirLaunches(page);
  const events = await recordEvents(page);
  const reach = await pullReachPx(page);
  await pullAndRelease(page, size.width / 2, size.height * 0.7, 0, -reach, 200);

  const seen = typesOf(await events());
  expect(seen).not.toContain('aimStart');
  expect(seen).not.toContain('launch');
  // "Ni castigo": refusing the shot must not cost a pip either.
  expect(seen).not.toContain('airLost');
  expect(errors).toEqual([]);
});

/**
 * D3: the world is `WORLD_W` wide and the camera follows in X, clamped to `[0, WORLD_W - viewW]`. The
 * shell's job is to PLACE that camera, so the assertion is that the Phaser camera's world view lands
 * exactly on the x core published — the bug this pins is a shell that still scrolls Y only.
 */
test('the camera follows Bur across the wide world', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);

  // Far right of a 540 px world: past the deadzone, and past anything a 180 px view could show from 0.
  // She has to be let go of first: since D1/D3 the first thing that happens on boot is that Bur comes
  // to rest under the foam raft, and a resting Bur is PINNED to her anchor — the teleport would be
  // undone on the very next step (§11.3, "attached poses do not integrate at all").
  await page.evaluate(() => {
    const sn = window.__db?.world.snapshot();
    if (!sn) return;
    sn.bubble.restingOnId = null;
    sn.bubble.state = 'IDLE';
    sn.bubble.pos.x = 480;
  });
  await page.waitForTimeout(700);

  const cam = await cameraState(page);
  expect(await burX(page)).toBeGreaterThan(400);
  expect(cam.x).toBeGreaterThan(120);

  const view = await page.evaluate(() => {
    const scene = (
      window as unknown as {
        __db: { game: { scene: { getScene(k: string): { cameras: { main: { worldView: { x: number } } } } } } };
      }
    ).__db.game.scene.getScene('Game');
    return scene.cameras.main.worldView.x;
  });
  expect(Math.abs(view - cam.x)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

/**
 * The drag helpers and the screenshot bot measure their gestures in design px off two constants of
 * their own. This is the one place that checks they are still the game's: a `PULL_MAX_PX` that moved
 * — or a "goma larga" left on — would otherwise turn every pull in this suite into a wrong-power
 * gesture that still passed.
 */
test('the drag helpers measure with the tuning the game is running', async ({ page }) => {
  await bootGame(page);
  const t = await gestureTuning(page);
  expect(t.pullMaxPx).toBe(PULL_MAX_DESIGN_PX);
  expect(t.pullCancelPx).toBe(PULL_CANCEL_DESIGN_PX);
});

/**
 * D2 gives a gesture three endings and all of them are the player's. An automatic pause is not one:
 * the shell freezes the world with the finger still on the glass, and handing core a plain pointer-up
 * would make the first step after "Seguir" read it as a RELEASE and fire the pull at full power. The
 * player comes back from a phone call to a shot she never took.
 */
test('a pause in the middle of a pull cancels the shot instead of firing it', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  const reach = await pullReachPx(page);
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height * 0.7);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i++) {
    const ty = Math.round(y - (reach * i) / 6);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: ty }] });
    await page.waitForTimeout(16);
  }

  const events = await recordEvents(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(400);

  const seen = typesOf(await events());
  expect(seen).toContain('aimCancel');
  expect(seen).not.toContain('launch');
  expect(errors).toEqual([]);
});

/**
 * The other half of the same rule. A 70 design px pull is ~140 css px, so on a phone a drag that
 * starts anywhere near an edge walks off the canvas — which is also what the Android back-swipe and
 * the notification shade do. Phaser reports that as GAME_OUT with the finger still down, and reading
 * it as a release fires the shot mid-drag, at whatever power happened to be drawn.
 */
test('a drag that walks off the canvas cancels instead of firing mid-pull', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const x = Math.round(box.x + 30);
  const y = Math.round(box.y + box.height * 0.7);
  const events = await recordEvents(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 20, y }] });
  await page.waitForTimeout(50);
  // Off the left edge of the window entirely, with the finger still on the glass.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 0, y }] });
  await page.evaluate(() => window.dispatchEvent(new Event('pointercancel')));
  await page.waitForTimeout(300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(200);

  const seen = typesOf(await events());
  expect(seen).toContain('aimStart');
  expect(seen).toContain('aimCancel');
  expect(seen).not.toContain('launch');
  expect(errors).toEqual([]);
});
