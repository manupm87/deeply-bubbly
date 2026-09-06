import { expect, test } from '@playwright/test';
import { bootGame, collectErrors } from './helpers';

/**
 * Not an assertion suite: these three frames are committed artefacts a human looks at to judge the art
 * and the layout (boot, mid-charge, mid-flight). They are tiny and they are the fastest review loop we
 * have for the pixel work.
 */
const DIR = 'e2e/__screenshots__';

test('captures boot, charging and flight frames', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await page.screenshot({ path: `${DIR}/boot.png` });

  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  const point = { x: Math.round(viewport.width / 2), y: Math.round(viewport.height * 0.7) };
  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${DIR}/charging.png` });

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/flight.png` });
  await cdp.detach();

  expect(errors).toEqual([]);
});
