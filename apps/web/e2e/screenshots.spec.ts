import { expect, test } from '@playwright/test';
import { OPEN_WATER_X, bootGame, collectErrors, minimapRect, pullReachPx, seedSave, waitForResting } from './helpers';

/**
 * Not an assertion suite: these six frames are committed artefacts a human looks at to judge the art
 * and the layout (boot, mid-pull, mid-flight, the open water of the wide D3 world, a held peek, and
 * the world map). They are tiny and they are the fastest review loop we have for the pixel work.
 */
const DIR = 'e2e/__screenshots__';

test('captures boot, aiming, flight and open-water frames', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await page.screenshot({ path: `${DIR}/boot.png` });

  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  const point = { x: Math.round(viewport.width / 2), y: Math.round(viewport.height * 0.7) };
  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  // D2: the sling has to be DRAWN before there is anything to photograph — a press that never moved
  // is the cancel zone, where the ring is empty and the guide is not drawn at all.
  const reach = await pullReachPx(page);
  for (let k = 1; k <= 6; k++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x, y: Math.round(point.y - (reach * k) / 6) }],
    });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${DIR}/charging.png` });

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/flight.png` });
  await cdp.detach();

  // D3: the middle of a 540 px world — no reef wall on either side, only the far layers. This is the
  // frame that says whether "agua abierta con estructuras dispersas" reads, or whether it reads empty.
  await page.evaluate((x) => {
    const sn = window.__db?.world.snapshot();
    if (sn) sn.bubble.pos.x = x;
  }, OPEN_WATER_X);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/wide.png` });

  // D5: the minimap held down on its right edge. The map stays put, the white frame walks to the
  // right edge of the world and the view follows it — this is the frame that says whether a 54 px
  // map is legible enough to aim a look with.
  await page.reload();
  await bootGame(page);
  await waitForResting(page);
  const rect = await minimapRect(page);
  const peekCdp = await page.context().newCDPSession(page);
  await peekCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(rect.x + rect.w * 0.42), y: Math.round(rect.y), id: 1 }],
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/peek.png` });
  await peekCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await peekCdp.detach();

  expect(errors).toEqual([]);
});

/**
 * The world map at the zoom a Pixel 7 renders it (WORLD-MAP.md §2). The save is seeded two stations
 * in, so the frame carries all four node states at once: completed nodes with their conchas, the
 * glowing current one, the locked ones below it and the "?" of the levels that do not exist yet.
 */
test('captures the world map', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    version: 1,
    unlockedStation: 1,
    bestDepthM: 260,
    pearls: 14,
    shellsByImmersion: { 0: 3, 1: 2 },
    settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
    tutorialDone: true,
  });
  await bootGame(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/map.png` });
  expect(errors).toEqual([]);
});
