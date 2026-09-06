import { expect, test } from '@playwright/test';
import { bootGame, scaleState } from './helpers';

/** SHELL.md "Escalado": 180 design px wide, integer zoom, visible height clamped to 320–420. */
const DESIGN_W = 180;
const MIN_VIEW_H = 320;
const MAX_VIEW_H = 420;

test('the game area is an exact integer zoom of the 180 px design column', async ({ page }) => {
  await bootGame(page);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const { width, height } = viewport ?? { width: 0, height: 0 };

  const scale = await scaleState(page);
  const expectedZoom = Math.max(1, Math.min(Math.floor(width / DESIGN_W), Math.floor(height / MIN_VIEW_H)));
  expect(scale.zoom).toBe(expectedZoom);
  expect(scale.viewW).toBe(DESIGN_W);
  // Pixel 7 is 412 × 915 css px → zoom 2, so the world column is exactly 360 css px wide.
  expect(scale.viewW * scale.zoom).toBe(DESIGN_W * expectedZoom);
  expect(scale.viewH).toBeGreaterThanOrEqual(MIN_VIEW_H);
  expect(scale.viewH).toBeLessThanOrEqual(MAX_VIEW_H);
});

test('the canvas fills the viewport and nothing scrolls', async ({ page }) => {
  await bootGame(page);
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  expect(Math.round(box?.width ?? 0)).toBe(viewport.width);
  expect(Math.round(box?.height ?? 0)).toBe(viewport.height);

  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(0);
  expect(overflow.vertical).toBeLessThanOrEqual(0);
});

test('the landscape curtain stays hidden in portrait', async ({ page }) => {
  await bootGame(page);
  await expect(page.locator('#rotate')).toBeHidden();
});
