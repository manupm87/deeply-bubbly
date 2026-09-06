import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import {
  bootGame,
  cameraState,
  collectErrors,
  minimapRect,
  pullReachPx,
  recordEvents,
  typesOf,
  visibleButtons,
  waitForResting,
} from './helpers';

/**
 * Adversarial half of D5 "ojeo". `peek.spec.ts` proves the feature works when the fingers arrive in
 * the order the design imagined (map first, sling second). These are the orders a real thumb produces
 * — the sling FIRST, the second finger landing on the HUD afterwards — plus the touches on the map
 * that must never cost the player anything.
 */

interface Finger {
  x: number;
  y: number;
  id: number;
}

const ts = (cdp: CDPSession, points: Finger[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
const tm = (cdp: CDPSession, points: Finger[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
const te = (cdp: CDPSession, points: Finger[] = []): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points });

async function gestureState(page: Page): Promise<{ state: string; aiming: boolean }> {
  return page.evaluate(() => {
    const b = window.__db?.world.snapshot().bubble;
    return { state: b?.state ?? '', aiming: (b?.aimOrigin ?? null) !== null };
  });
}

/**
 * The pull the player is in the middle of when the second finger lands. Half a full pull, so a shot
 * fired by accident is unmistakable in the event log AND in Bur's state.
 */
async function halfPull(page: Page, cdp: CDPSession, id: number): Promise<Finger> {
  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  const reach = await pullReachPx(page);
  const origin: Finger = { x: Math.round(viewport.width / 2), y: Math.round(viewport.height * 0.72), id };
  await ts(cdp, [origin]);
  let sling = origin;
  for (let k = 1; k <= 3; k++) {
    sling = { ...origin, y: Math.round(origin.y - (reach * 0.9 * k) / 6) };
    await tm(cdp, [sling]);
    await page.waitForTimeout(45);
  }
  return sling;
}

test('a finger landing on the minimap mid-pull does not fire the shot', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await waitForResting(page);
  const rect = await minimapRect(page);
  const readEvents = await recordEvents(page);
  const cdp = await page.context().newCDPSession(page);

  // The SLING goes down first, so `PointerAdapter` owns it; the map finger is the second contact.
  const sling = await halfPull(page, cdp, 2);
  expect((await gestureState(page)).aiming).toBe(true);

  const map: Finger = { x: Math.round(rect.x + rect.w * 0.35), y: Math.round(rect.y), id: 1 };
  await ts(cdp, [sling, map]);
  await page.waitForTimeout(150);

  const mid = await gestureState(page);
  const events = typesOf(await readEvents());
  await te(cdp, [sling]);
  await te(cdp, [map]);
  await cdp.detach();

  // The pull is still the player's: the second finger steers the view, it does not pull the trigger.
  expect(events).not.toContain('launch');
  expect(mid.aiming).toBe(true);
  expect(mid.state).toBe('AIMING');
  expect(errors).toEqual([]);
});

test('a finger landing on the pause button mid-pull does not fire the shot', async ({ page }) => {
  await bootGame(page);
  await waitForResting(page);
  const pause = (await visibleButtons(page)).find((b) => b.id === 'pause.open');
  expect(pause).toBeDefined();
  const readEvents = await recordEvents(page);
  const cdp = await page.context().newCDPSession(page);

  const sling = await halfPull(page, cdp, 2);
  await ts(cdp, [sling, { x: Math.round(pause?.x ?? 0), y: Math.round(pause?.y ?? 0), id: 1 }]);
  await page.waitForTimeout(150);
  const events = typesOf(await readEvents());
  const mid = await gestureState(page);
  await te(cdp, [{ x: Math.round(pause?.x ?? 0), y: Math.round(pause?.y ?? 0), id: 1 }]);
  await te(cdp, [sling]);
  await cdp.detach();

  // Whatever the second finger meant, it was not "let go of the sling".
  expect(events).not.toContain('launch');
  expect(mid.state).not.toBe('LAUNCHED');
});

test('a tap and a drag on the minimap never aim, launch or cost air', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await waitForResting(page);
  const rect = await minimapRect(page);
  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  const readEvents = await recordEvents(page);
  const cdp = await page.context().newCDPSession(page);

  // A tap that never moves.
  const p: Finger = { x: Math.round(rect.x), y: Math.round(rect.y), id: 1 };
  await ts(cdp, [p]);
  await page.waitForTimeout(300);
  expect((await gestureState(page)).aiming).toBe(false);
  await te(cdp);
  await page.waitForTimeout(200);

  // A drag that leaves the map and ends far outside the canvas.
  await ts(cdp, [p]);
  for (let k = 1; k <= 8; k++) {
    await tm(cdp, [{ ...p, x: p.x + k * 12, y: p.y + k * 110 }]);
    await page.waitForTimeout(30);
  }
  await te(cdp, [{ ...p, x: p.x + 96, y: viewport.height + 200 }]);
  await page.waitForTimeout(300);
  await cdp.detach();

  const events = typesOf(await readEvents());
  expect(events).not.toContain('launch');
  expect(events).not.toContain('aimStart');
  expect((await gestureState(page)).aiming).toBe(false);
  // The view came home on its own once the finger was gone.
  await page.waitForTimeout(1500);
  const cam = await cameraState(page);
  expect(Math.abs(cam.renderX - cam.x)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('a peek drag that crosses the edge of the canvas keeps steering when it comes back', async ({ page }) => {
  await bootGame(page);
  await waitForResting(page);
  const rect = await minimapRect(page);
  const cdp = await page.context().newCDPSession(page);

  const p: Finger = { x: Math.round(rect.x), y: Math.round(rect.y), id: 1 };
  await ts(cdp, [p]);
  await page.waitForTimeout(500);
  const peeked = await cameraState(page);
  expect(peeked.renderX).toBeGreaterThan(peeked.x + 50);

  // The map sits ~55 design px from the top of the view, so a finger peeking UP leaves the canvas
  // long before it runs out of gesture. It has NOT been lifted: the peek is still the player's.
  await tm(cdp, [{ ...p, x: p.x + 200, y: -50 }]);
  await page.waitForTimeout(700);
  // …and it comes back onto the map, still the same contact.
  await tm(cdp, [{ ...p, x: Math.round(rect.x + rect.w * 0.45), y: Math.round(rect.y) }]);
  await page.waitForTimeout(700);
  const back = await cameraState(page);
  await te(cdp, [{ ...p, x: Math.round(rect.x + rect.w * 0.45), y: Math.round(rect.y) }]);
  await cdp.detach();

  expect(back.renderX).toBeGreaterThan(back.x + 50);
});
