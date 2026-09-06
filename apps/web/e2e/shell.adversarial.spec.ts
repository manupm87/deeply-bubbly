/**
 * Adversarial runtime checks. Each test pins a defect found by driving the built game in a real
 * browser; all of them now pass, and they are here so none of them can come back.
 *
 * The debug handle is re-declared locally (a wider view than `helpers.ts` needs) so this file can
 * reach the world API and the Phaser scenes without changing shared types.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootGame, collectErrors, holdAndRelease } from './helpers';

interface DisplayObject {
  type: string;
  visible: boolean;
  alpha: number;
  x: number;
  y: number;
  texture?: { key: string };
  list?: DisplayObject[];
}

interface Db {
  world: {
    snapshot(): {
      timeMs: number;
      phase: string;
      bubble: { air: number; state: string; pos: { x: number; y: number }; vel: { x: number; y: number } };
      camera: { y: number; viewH: number };
    };
    restart(): void;
    restartImmersion(): void;
    onEvent(listener: (e: { type: string }) => void): () => void;
  };
  game: {
    scene: {
      getScene(key: string): { children: { list: DisplayObject[] }; cameras: { main: { zoom: number } } };
    };
  };
}

async function evalInPage<T>(page: Page, fn: (handle: () => Db) => T): Promise<T> {
  return page.evaluate(
    ([source]) => {
      const get = new Function(`return ${source}`)() as (h: () => Db) => T;
      return get(() => (window as unknown as { __db: Db }).__db);
    },
    [fn.toString()] as const,
  ) as Promise<T>;
}

/** SHELL.md "Escalado" and GDD §8: `blur` (incoming call, app switch) must pause the game. */
test('window blur pauses the simulation', async ({ page }) => {
  await bootGame(page);
  const before = await evalInPage(page, (h) => h().world.snapshot().timeMs);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(1200);
  const after = await evalInPage(page, (h) => h().world.snapshot().timeMs);
  expect(after - before).toBeLessThan(100);
});

/**
 * GDD §8 pause menu: "Reiniciar Inmersión" must actually restart the immersion.
 *
 * The original version of this test called `world.restart()`, which core deliberately ignores outside
 * 'dead'/'gameOver' (a contract pinned by `GameWorld.test.ts`, "ignores restart() while the run is
 * alive"). Restarting a LIVING immersion is a different rule and it was simply missing from core, so
 * it was added there as `restartImmersion()`; this test now calls what the button calls.
 *
 * It used to assert `camera.y` went UP, on the premise that "camera.y is a ratchet". That premise is
 * false: `restartImmersion()` restarts from the LAST CHECKPOINT (GameWorld.respawnAtCheckpoint), and
 * since 7fb6ea8 starts the campaign under the first entry anchor, a checkpoint can sit either side of
 * where Bur got to — the assertion was reading a content decision, not the rule. What the rule really
 * promises is checked instead: the whole restart is a TELEPORT inside one synchronous call, with no
 * simulation step in between to explain it, and it leaves Bur inside her own camera.
 */
test('the pause menu "restart dive" option restarts the run', async ({ page }) => {
  await bootGame(page);
  const size = page.viewportSize() ?? { width: 412, height: 839 };
  for (let i = 0; i < 3; i++) {
    await holdAndRelease(page, size.width / 2, size.height * 0.8, 500);
    await page.waitForTimeout(800);
  }
  const restart = await evalInPage(page, (h) => {
    const events: string[] = [];
    const before = h().world.snapshot();
    const from = { burY: before.bubble.pos.y, camY: before.camera.y };
    const off = h().world.onEvent((e) => events.push(e.type));
    h().world.restartImmersion();
    off();
    const after = h().world.snapshot();
    return { events, from, burY: after.bubble.pos.y, camY: after.camera.y, viewH: after.camera.viewH };
  });
  expect(restart.events).toContain('respawn');
  expect(Math.abs(restart.burY - restart.from.burY)).toBeGreaterThan(20);
  expect(Math.abs(restart.camY - restart.from.camY)).toBeGreaterThan(20);
  expect(restart.burY).toBeGreaterThanOrEqual(restart.camY);
  expect(restart.burY).toBeLessThanOrEqual(restart.camY + restart.viewH);
});

/**
 * The blocking one: the shell's event source. `restartImmersion()`/`restart()` push their `respawn`
 * OUTSIDE a simulation step, and `GameWorld.update` only dispatches what a step produced — so a shell
 * listening on `onEvent` alone never saw it, `BubbleView.reform()` never ran, and the alpha-0 tween of
 * the deflate was never undone: Bur stayed invisible for the rest of the session.
 */
test('Bur is visible again after a death and a restart', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  await evalInPage(page, (h) => {
    const sn = h().world.snapshot();
    sn.bubble.air = 1;
    sn.bubble.pos.y = sn.camera.y - 120;
    sn.bubble.vel.x = 0;
    sn.bubble.vel.y = -160;
    sn.bubble.state = 'LAUNCHED';
  });
  await page.waitForFunction(() => window.__db?.world.snapshot().phase === 'dead', undefined, { timeout: 15_000 });
  await page.waitForTimeout(400);
  await evalInPage(page, (h) => h().world.restart());
  await page.waitForTimeout(600);

  const alpha = await evalInPage(page, (h) => {
    const bur = h()
      .game.scene.getScene('Game')
      .children.list.find((o) => o.texture?.key === 'bur');
    return bur ? bur.alpha : -1;
  });
  expect(alpha).toBeGreaterThan(0.9);
  expect(errors).toEqual([]);
});

/** §8's revised scaling decision: the world is never sampled at a fractional zoom, not for a frame. */
test('the camera zoom stays an integer through a whole charge', async ({ page }) => {
  await bootGame(page);
  const size = page.viewportSize() ?? { width: 412, height: 839 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(size.width / 2), y: Math.round(size.height * 0.8) }],
  });
  const zooms: number[] = [];
  for (let i = 0; i < 12; i++) {
    zooms.push(await evalInPage(page, (h) => h().game.scene.getScene('Game').cameras.main.zoom));
    await page.waitForTimeout(60);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect(zooms.every((z) => Number.isInteger(z))).toBe(true);
});

/** GDD §8: the dotted guide is one of the three redundant charge channels; every dot must count. */
test('the trajectory guide draws no duplicated dot', async ({ page }) => {
  await bootGame(page);
  const size = page.viewportSize() ?? { width: 412, height: 839 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(size.width / 2), y: Math.round(size.height * 0.75) }],
  });
  await page.waitForTimeout(350);
  const dots = await evalInPage(page, (h) =>
    h()
      .game.scene.getScene('Game')
      .children.list.filter((o) => o.visible && o.texture?.key === 'dot')
      .map((o) => `${o.x}:${o.y}`),
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(dots.length).toBeGreaterThan(2);
  expect(new Set(dots).size).toBe(dots.length);
});

/** GDD §8: the fail screen owns the screen; the first-run tutorial must not draw over it. */
test('the tutorial hand is hidden while the fail screen is up', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);
  // Force the last pip and push Bur off the top of the view: resaca spends it and Bur deflates.
  await evalInPage(page, (h) => {
    const sn = h().world.snapshot();
    sn.bubble.air = 1;
    sn.bubble.pos.y = sn.camera.y - 120;
    sn.bubble.vel.x = 0;
    sn.bubble.vel.y = -160;
    sn.bubble.state = 'LAUNCHED';
  });
  await page.waitForFunction(() => window.__db?.world.snapshot().phase === 'dead', undefined, { timeout: 15_000 });
  await page.waitForTimeout(600);
  const handVisible = await evalInPage(page, (h) =>
    h()
      .game.scene.getScene('Hud')
      .children.list.some(
        (o) => o.type === 'Container' && o.visible && (o.list ?? []).some((c) => c.texture?.key === 'ui.hand' && c.visible),
      ),
  );
  expect(handVisible).toBe(false);
  expect(errors).toEqual([]);
});
