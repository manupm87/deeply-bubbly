import { expect, test } from '@playwright/test';
import { bootGame, burY, collectErrors, holdAndRelease } from './helpers';

/** A launch must move Bur clearly further than the idle float does; 30 design px is well past noise. */
const MIN_LAUNCH_TRAVEL_PX = 30;

test('boots and runs three seconds without a console error', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await page.waitForTimeout(3_000);
  expect(errors).toEqual([]);
});

test('a hold-and-release launches Bur downward', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);

  const size = page.viewportSize();
  expect(size).not.toBeNull();
  const { width, height } = size ?? { width: 0, height: 0 };

  const before = await burY(page);
  // Pressing well below Bur is a straight-down aim (core measures the drag from Bur's frozen origin).
  await holdAndRelease(page, width / 2, height * 0.7, 400);

  await expect
    .poll(async () => (await burY(page)) - before, { timeout: 2_000, message: 'Bur travelled downward' })
    .toBeGreaterThan(MIN_LAUNCH_TRAVEL_PX);

  expect(errors).toEqual([]);
});
