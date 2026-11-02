/**
 * What a stranger needs from the first minute: the tutorial shows a shot that works and survives a shot
 * that does not, the next ledge can be found, and the landing marker keeps its promise.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Finger, SAVE_AT_STATION_0, SAVE_KEY, bootGame, modelsSettled, pullForNextShot, readSave } from './helpers';

const FIRST_RUN = { ...SAVE_AT_STATION_0, unlockedStation: -1, bestDepthM: 0, pearls: 0, shellsByImmersion: {}, tutorialDone: false };

interface Live {
  bubble: { state: string; restingOnId: string | null; pos: { x: number; y: number }; aimOrigin: unknown };
  phase: string;
}
const live = (page: Page): Promise<Live> =>
  page.evaluate(() => (window.__db as unknown as { ctx: { snapshot: Live } }).ctx.snapshot);
const landing = (page: Page): Promise<{ ceilingId: string | null; progress: boolean; hazard: boolean } | null> =>
  page.evaluate(() => (window.__db as unknown as { landing(): { ceilingId: string | null; progress: boolean; hazard: boolean } | null }).landing());

async function resting(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window.__db as unknown as { ctx: { snapshot: Live } }).ctx.snapshot.bubble.state === 'RESTING',
    undefined,
    { timeout: 40_000 },
  );
}

async function firstRun(page: Page): Promise<void> {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [SAVE_KEY, JSON.stringify(FIRST_RUN)] as const);
  await bootGame(page);
  await modelsSettled(page);
  await resting(page);
}

test('the tutorial survives a tap and a shot back to the same ledge, and ends on the first real hop', async ({ page }) => {
  await firstRun(page);
  const tutorial = page.locator('[data-testid=tutorial]');
  await expect(tutorial).toBeVisible();
  // The ghost plays out: the hand appears, then the ghost of Bur flies an arc.
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.tutorial-hand') as Element).opacity) > 0.5);
  await page.locator('.tutorial-ghost:not([hidden])').waitFor({ state: 'attached', timeout: 20_000 });

  const tap = await Finger.press(page, 206, 600);
  await page.waitForTimeout(100);
  await tap.lift();
  await expect(tutorial).toBeVisible();
  expect((await readSave(page))?.['tutorialDone']).toBe(false);

  // A short pull straight back: Bur dips and floats straight back under the same raft.
  const start = (await live(page)).bubble.restingOnId;
  const dud = await Finger.press(page, 206, 600);
  await dud.move(206, 540);
  await page.waitForFunction(() => (window.__db as unknown as { landing(): unknown }).landing() !== null);
  expect(await landing(page)).toMatchObject({ ceilingId: start, progress: false });
  await dud.lift();
  await page.waitForFunction(() => window.__db?.world !== undefined && (window.__db as unknown as { ctx: { snapshot: Live } }).ctx.snapshot.bubble.state !== 'RESTING');
  await resting(page);
  expect((await live(page)).bubble.restingOnId).toBe(start);
  await expect(tutorial).toBeVisible();

  const { finger } = await pullForNextShot(page);
  await finger.lift();
  await page.waitForFunction(
    (id) => {
      const b = (window.__db as unknown as { ctx: { snapshot: Live } }).ctx.snapshot.bubble;
      return b.state === 'RESTING' && b.restingOnId !== id;
    },
    start,
    { timeout: 40_000 },
  );
  await expect(tutorial).toBeHidden();
  await expect.poll(async () => (await readSave(page))?.['tutorialDone']).toBe(true);
});

test('a newcomer watching the tutorial is not kicked off the first ledge', async ({ page }) => {
  await firstRun(page);
  const rest = await page.evaluate(() => window.__db?.tuning as unknown as { REST_MAX_MS: { posadero: number } });
  expect(rest.REST_MAX_MS.posadero).toBeGreaterThan(60_000);
});

test('the marker keeps its promise: every shot it lights rests on that ledge, and the next ledge is always shown', async ({ page }) => {
  await firstRun(page);
  const ring = page.locator('[data-testid=target-ring]');
  const arrow = page.locator('[data-testid=target-arrow]');
  for (let hop = 0; hop < 4; hop++) {
    await resting(page);
    await expect.poll(async () => (await ring.isVisible()) !== (await arrow.isVisible())).toBe(true);
    const { finger } = await pullForNextShot(page);
    // A slow software frame may still be showing the forecast of the pull's first steps.
    await page.waitForFunction(() => (window.__db as unknown as { landing(): { ceilingId: string | null } | null }).landing()?.ceilingId, undefined, { timeout: 5_000 });
    const promise = await landing(page);
    expect(promise?.progress, `hop ${hop}`).toBe(true);
    await finger.lift();
    await page.waitForFunction(
      (id) => (window.__db as unknown as { ctx: { snapshot: Live } }).ctx.snapshot.bubble.restingOnId === id,
      promise?.ceilingId,
      { timeout: 40_000 },
    );
  }
});

test('the first target is in view when the game starts', async ({ page }) => {
  await firstRun(page);
  await expect(page.locator('[data-testid=target-ring]')).toBeVisible();
  await expect(page.locator('[data-testid=target-arrow]')).toBeHidden();
});
