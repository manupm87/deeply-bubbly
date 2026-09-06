import type { Page } from '@playwright/test';

/**
 * Shape of the debug handle `main.ts` installs on `window` under `?debug=1`.
 * Declared here rather than in `src/` so the shipped bundle keeps no test-only types.
 */
declare global {
  interface Window {
    __db?: {
      world: { snapshot(): { bubble: { pos: { x: number; y: number } }; phase: string } };
      ctx: { scale: { zoom: number; viewW: number; viewH: number; offsetX: number; offsetY: number } };
    };
  }
}

/** Loads the game with the debug handle and waits until the first simulated frame is on screen. */
export async function bootGame(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => window.__db !== undefined, undefined, { timeout: 15_000 });
  // The Boot scene builds every procedural texture before Game/Hud exist; give it a few frames.
  await page.waitForFunction(() => (window.__db?.world.snapshot().phase ?? '') !== '', undefined, { timeout: 15_000 });
  await page.waitForTimeout(500);
}

export async function burY(page: Page): Promise<number> {
  return page.evaluate(() => window.__db?.world.snapshot().bubble.pos.y ?? Number.NaN);
}

export async function scaleState(page: Page): Promise<{ zoom: number; viewW: number; viewH: number }> {
  return page.evaluate(() => {
    const s = window.__db?.ctx.scale;
    return { zoom: s?.zoom ?? 0, viewW: s?.viewW ?? 0, viewH: s?.viewH ?? 0 };
  });
}

/** Collects page errors and `console.error` output for a "no errors on screen" assertion. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * A finger that presses, holds and lifts. Uses the CDP touch input so the run exercises the same path
 * a phone does (Phaser reads pointer events either way, but touch is what the game ships for).
 */
export async function holdAndRelease(page: Page, x: number, y: number, holdMs: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touchPoints = [{ x: Math.round(x), y: Math.round(y) }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * Spends Bur's last pip through the resaca: one pip, teleported above the view, rising. Clears the rest
 * bookkeeping too — by ~800 ms after boot Bur is already RESTING under the foam raft, and a forced
 * `LAUNCHED` that still points at a ceiling is re-pinned by the state machine (that is what made this
 * flake on slow CI runners). Waits until the fail screen phase is reached.
 */
export async function forceResacaDeath(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = window.__db?.world as unknown as {
      snapshot(): {
        bubble: Record<string, unknown> & { pos: { y: number }; vel: { x: number; y: number } };
        camera: { y: number };
      };
    };
    const sn = world.snapshot();
    sn.bubble.air = 1;
    sn.bubble.pos.y = sn.camera.y - 120;
    sn.bubble.vel.x = 0;
    sn.bubble.vel.y = -160;
    sn.bubble.state = 'LAUNCHED';
    sn.bubble.restingOnId = null;
    sn.bubble.restMs = 0;
    sn.bubble.launchedMs = 0;
  });
  await page.waitForFunction(() => window.__db?.world.snapshot().phase === 'dead', undefined, { timeout: 15_000 });
}
