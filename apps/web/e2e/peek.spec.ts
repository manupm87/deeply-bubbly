import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import type { DebugButtonRect } from './helpers';
import {
  bootGame,
  cameraState,
  collectErrors,
  minimapRect,
  pullReachPx,
  recordEvents,
  tapButton,
  typesOf,
  waitForResting,
} from './helpers';

/**
 * D5 "ojeo": the minimap in the HUD is the camera control. A finger on it asks core to CENTRE the
 * view on that world point (`camera.renderX/renderY`), while the rules — `camera.x/y`, the ratchet,
 * Bur's state — carry on as if nobody had touched anything. These are the shell's half of that: the
 * touch is swallowed so no slingshot starts, the second finger can still shoot, and the peek never
 * shows water the streamer has not built.
 */

/**
 * A finger, in CSS px of the page. The `id` is what makes two of them independent: CDP identifies
 * touch points by it, and a `touchEnd` lists the points being LIFTED — so lifting the sling while the
 * minimap stays held is `touchEnd([sling])`, and an id-less point would silently be finger 0 instead.
 */
interface Finger {
  x: number;
  y: number;
  id: number;
}

/** A point inside the minimap rect: `f` is a fraction of its half-size from the centre. */
const inside = (r: DebugButtonRect, fx: number, fy: number, id = 1): Finger => ({
  x: Math.round(r.x + (r.w / 2) * fx),
  y: Math.round(r.y + (r.h / 2) * fy),
  id,
});

const touchStart = async (cdp: CDPSession, points: Finger[]): Promise<void> => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
};
const touchMove = async (cdp: CDPSession, points: Finger[]): Promise<void> => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
};
const touchEnd = async (cdp: CDPSession, points: Finger[] = []): Promise<void> => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points });
};

/** Bur's state and whether a pull is live, in one round trip. */
async function gestureState(page: Page): Promise<{ state: string; aiming: boolean }> {
  return page.evaluate(() => {
    const b = window.__db?.world.snapshot().bubble;
    return { state: b?.state ?? '', aiming: (b?.aimOrigin ?? null) !== null };
  });
}

test('holding the right of the minimap peeks the view without moving the camera or starting an aim', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await waitForResting(page);

  const rect = await minimapRect(page);
  const before = await cameraState(page);
  const cdp = await page.context().newCDPSession(page);
  await touchStart(cdp, [inside(rect, 0.85, 0)]);
  await page.waitForTimeout(700);
  const peeked = await cameraState(page);
  const gesture = await gestureState(page);
  await touchEnd(cdp);
  await cdp.detach();

  // The DRAWN view walked right, all the way to the world's right edge (`WORLD_W - viewW` = 360).
  expect(peeked.renderX).toBeGreaterThan(before.renderX + 100);
  expect(peeked.renderX).toBeGreaterThan(340);
  // …and the camera the RULES read never moved: the peek is presentation, nothing else.
  expect(Math.abs(peeked.x - before.x)).toBeLessThan(1);
  // The touch was swallowed like a HUD button's: no slingshot, and Bur is still on her ledge.
  expect(gesture.state).toBe('RESTING');
  expect(gesture.aiming).toBe(false);
  expect(errors).toEqual([]);
});

test('releasing the minimap glides the view back to the camera', async ({ page }) => {
  await bootGame(page);
  await waitForResting(page);

  const rect = await minimapRect(page);
  const cdp = await page.context().newCDPSession(page);
  await touchStart(cdp, [inside(rect, 0.85, 0)]);
  await page.waitForTimeout(600);
  expect((await cameraState(page)).renderX).toBeGreaterThan(100);

  await touchEnd(cdp);
  await cdp.detach();
  // PEEK_RETURN_LAMBDA = 5 /s and the offset snaps to zero once it is under a pixel: ~1.3 s of
  // SIMULATION. Polled rather than timed, because a loaded CI runner simulates slower than the wall
  // clock (the accumulator drops time on slow frames) and 1.5 s of waiting left ~12 px of glide.
  await page.waitForFunction(
    () => {
      const c = window.__db?.world.snapshot().camera;
      return c !== undefined && Math.abs(c.renderX - c.x) < 1;
    },
    undefined,
    { timeout: 8_000 },
  );
  const back = await cameraState(page);
  expect(Math.abs(back.renderX - back.x)).toBeLessThan(1);
});

test('a pause taken while peeked resumes on Bur, not on the peeked view', async ({ page }) => {
  // The world stops being stepped while the pause menu owns the glass, so `setPeek(null)` alone would
  // leave the offset frozen and glide it home only after the resume — a resume that starts 260 px off
  // Bur and slides. `Minimap.setVisible(false)` asks core to drop the offset outright instead.
  await bootGame(page);
  await waitForResting(page);

  const rect = await minimapRect(page);
  const cdp = await page.context().newCDPSession(page);
  await touchStart(cdp, [inside(rect, 0.85, 0)]);
  await page.waitForTimeout(700);
  expect((await cameraState(page)).renderX).toBeGreaterThan(300);

  // A second finger opens the pause menu while the map is still held.
  await tapButton(page, 'pause.open');
  await page.waitForTimeout(200);
  const paused = await cameraState(page);
  expect(paused.renderX).toBe(paused.x);

  await tapButton(page, 'pause.resume');
  await page.waitForTimeout(200);
  const resumed = await cameraState(page);
  expect(resumed.renderX).toBe(resumed.x);
  await touchEnd(cdp);
  await cdp.detach();
});

test('a second finger still shoots while the first one holds the minimap', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await waitForResting(page);
  const readEvents = await recordEvents(page);

  const rect = await minimapRect(page);
  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  const map = inside(rect, 0.85, 0);
  const cdp = await page.context().newCDPSession(page);

  await touchStart(cdp, [map]);
  await page.waitForTimeout(500);
  const peeked = await cameraState(page);
  expect(peeked.renderX).toBeGreaterThan(100);

  // Second finger: the D2 sling. The drag goes UP, so the shot leaves DOWNWARDS.
  const reach = await pullReachPx(page);
  const origin: Finger = { x: Math.round(viewport.width / 2), y: Math.round(viewport.height * 0.72), id: 2 };
  await touchStart(cdp, [map, origin]);
  let sling = origin;
  for (let k = 1; k <= 6; k++) {
    sling = { ...origin, y: Math.round(origin.y - (reach * 0.9 * k) / 6) };
    await touchMove(cdp, [map, sling]);
    await page.waitForTimeout(40);
  }
  const pulling = await gestureState(page);
  const duringPull = await cameraState(page);
  // Lift ONLY the sling finger: the minimap finger stays down, so the peek is still being steered.
  await touchEnd(cdp, [sling]);
  await page.waitForTimeout(400);
  const afterShot = await cameraState(page);
  await touchEnd(cdp, [map]);
  await cdp.detach();

  expect(pulling.aiming).toBe(true);
  // The finger on the minimap owns no gesture, and the one that pulls owns no peek.
  expect(duringPull.renderX).toBeGreaterThan(peeked.renderX - 5);
  expect(afterShot.renderX).toBeGreaterThan(peeked.renderX - 5);
  expect(typesOf(await readEvents())).toContain('launch');
  expect(errors).toEqual([]);
});

test('peeking down never shows past the streamed window', async ({ page }) => {
  await bootGame(page);
  await waitForResting(page);

  const rect = await minimapRect(page);
  const cdp = await page.context().newCDPSession(page);
  await touchStart(cdp, [inside(rect, 0, 0.95)]);
  await page.waitForTimeout(900);
  const peeked = await cameraState(page);
  const window_ = await page.evaluate(() => window.__db?.streamWindow?.() ?? null);
  await touchEnd(cdp);
  await cdp.detach();

  expect(window_).not.toBeNull();
  // It really did look down…
  expect(peeked.renderY).toBeGreaterThan(peeked.y + 10);
  // …and stopped at the bottom of what the streamer has built (`peekBounds`, core).
  expect(peeked.renderY + peeked.viewH).toBeLessThanOrEqual((window_?.bottomY ?? 0) + 0.001);
});
