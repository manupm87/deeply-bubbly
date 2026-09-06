import type { Page } from '@playwright/test';

/**
 * Shape of the debug handle `main.ts` installs on `window` under `?debug=1`.
 * Declared here rather than in `src/` so the shipped bundle keeps no test-only types.
 */
/** One HUD button as the debug handle reports it: centre and size in CSS px of the page. */
export interface DebugButtonRect {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

declare global {
  interface Window {
    __db?: {
      world: {
        snapshot(): {
          timeMs: number;
          bubble: {
            pos: { x: number; y: number };
            state: string;
            restingOnId: string | null;
            /** D2: the frozen origin of a live gesture; null when no pull is in flight. */
            aimOrigin: { x: number; y: number } | null;
          };
          camera: {
            x: number;
            y: number;
            /** D5: the camera as DRAWN — `x + peekX` / `y + lookaheadPx + peekY`. */
            renderX: number;
            renderY: number;
            peekX: number;
            peekY: number;
            viewW: number;
            viewH: number;
          };
          phase: string;
          /** Streamed entities, as `WorldSnapshot.entities`; a spec only ever reads shape and position. */
          entities: Array<{ type: string; id: string; pos?: { x: number; y: number } }>;
        };
        onEvent(listener: (e: { type: string }) => void): () => void;
      };
      ctx: {
        scale: { zoom: number; viewW: number; viewH: number; offsetX: number; offsetY: number };
        save: { unlockedStation: number };
      };
      buttons(): DebugButtonRect[];
      /** The shot core would take from here (`game/autoPlayer.pickShot`); used by `e2e/tools/bot.mjs`. */
      nextShot?(): { power: number; thetaDeg: number } | null;
      /** The LIVE tuning; `gestureTuning` reads the gesture constants the drags below assume. */
      tuning: { PULL_MAX_PX: number; PULL_CANCEL_PX: number; PEEK_DOWN_PX: number; WORLD_W: number };
      /** D5: the streamed chunk window (`?debug=1` only); `peek.spec.ts` asserts the view stays in it. */
      streamWindow?(): { topY: number; bottomY: number };
    };
  }
}

/** The save slot core reads at boot (`SAVE_KEY` in `packages/core/src/run/save.ts`). */
export const SAVE_KEY = 'deeply-bubbly.save.v1';

/** Loads the game with the debug handle and waits until the first simulated frame is on screen. */
export async function bootGame(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => window.__db !== undefined, undefined, { timeout: 15_000 });
  // The Boot scene builds every procedural texture before Game/Hud exist; give it a few frames.
  await page.waitForFunction(() => (window.__db?.world.snapshot().phase ?? '') !== '', undefined, { timeout: 15_000 });
  await page.waitForTimeout(500);
}

/**
 * Writes a save BEFORE the page loads, so the shell boots as a returning player would. `addInitScript`
 * runs on the target origin before any of the app's own code, which is the only moment `localStorage`
 * is guaranteed to be seeded ahead of `loadSave()`.
 */
export async function seedSave(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, json]) => {
      window.localStorage.setItem(key, json);
    },
    [SAVE_KEY, JSON.stringify(save)] as const,
  );
}

/** The save as it stands in the browser right now, or null when there is none. */
export async function readSave(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  }, SAVE_KEY);
}

/** Buttons currently on screen (a hidden overlay's buttons are reported, and filtered out here). */
export async function visibleButtons(page: Page): Promise<DebugButtonRect[]> {
  return page.evaluate(() => (window.__db?.buttons() ?? []).filter((b) => b.visible));
}

/**
 * Presses a real HUD button with a real touch at the rect it occupies, instead of calling the callback
 * behind it: the hit area, the overlay stacking and the pointer swallowing are part of what is tested.
 */
export async function tapButton(page: Page, id: string): Promise<void> {
  const button = (await visibleButtons(page)).find((b) => b.id === id);
  if (!button) {
    const seen = (await visibleButtons(page)).map((b) => b.id).join(', ');
    throw new Error(`no visible button '${id}' (on screen: ${seen || 'none'})`);
  }
  await holdAndRelease(page, button.x, button.y, 80);
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
 * A finger that presses, holds and lifts, without moving. Uses the CDP touch input so the run
 * exercises the same path a phone does (Phaser reads pointer events either way, but touch is what the
 * game ships for). Since DECISIONS-v1.2 D2 this is a TAP, not a shot: a press that never leaves the
 * cancel radius cancels. Use it for HUD buttons; use `pullAndRelease` to make Bur move.
 */
export async function holdAndRelease(page: Page, x: number, y: number, holdMs: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touchPoints = [{ x: Math.round(x), y: Math.round(y) }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Design px of a full pull (`PULL_MAX_PX`); the page renders at an integer zoom, so scale by it. */
export const PULL_MAX_DESIGN_PX = 70;
/** Design px of the cancel radius (`PULL_CANCEL_PX`): a release inside it fires nothing (D2). */
export const PULL_CANCEL_DESIGN_PX = 12;

/**
 * The two constants above, read out of the running game. They are duplicated as module constants
 * because every drag helper needs them synchronously, so one spec asserts the copies against this —
 * without it a `PULL_MAX_PX` that moved would turn every drag in the suite into a wrong-power gesture
 * that still passed.
 */
export async function gestureTuning(page: Page): Promise<{ pullMaxPx: number; pullCancelPx: number }> {
  return page.evaluate(() => ({
    pullMaxPx: window.__db?.tuning.PULL_MAX_PX ?? 0,
    pullCancelPx: window.__db?.tuning.PULL_CANCEL_PX ?? 0,
  }));
}
/**
 * A world x with nothing in it. D3 widened the world to `WORLD_W = 540` while the authored content
 * still lives in the left 180 px, so this is the deep end of the pool: a test that needs Bur adrift
 * and ungrabbable puts her here.
 */
export const OPEN_WATER_X = 480;

/**
 * The D2 slingshot: press at (x, y), draw the sling by (dx, dy) over a few moves, lift. The shot
 * leaves in the direction OPPOSITE to the drag, so a downward shot is a finger travelling UP.
 * `moveMs` is the whole drag; the release happens as soon as it ends.
 */
export async function pullAndRelease(
  page: Page,
  x: number,
  y: number,
  dx: number,
  dy: number,
  moveMs = 240,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(x), y: Math.round(y) }],
  });
  for (let k = 1; k <= steps; k++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(x + (dx * k) / steps), y: Math.round(y + (dy * k) / steps) }],
    });
    await page.waitForTimeout(Math.max(1, Math.round(moveMs / steps)));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** CSS px of a full pull at the page's current integer zoom. */
export async function pullReachPx(page: Page): Promise<number> {
  return PULL_MAX_DESIGN_PX * (await zoomOf(page));
}

/** CSS px of the cancel radius at the page's current integer zoom. */
export async function cancelRadiusPx(page: Page): Promise<number> {
  return PULL_CANCEL_DESIGN_PX * (await zoomOf(page));
}

async function zoomOf(page: Page): Promise<number> {
  const zoom = await page.evaluate(() => window.__db?.ctx.scale.zoom ?? 2);
  return zoom > 0 ? zoom : 2;
}

/** Bur's world x right now; since D3 the world is WORLD_W wide, so x is a real degree of freedom. */
export async function burX(page: Page): Promise<number> {
  return page.evaluate(() => window.__db?.world.snapshot().bubble.pos.x ?? Number.NaN);
}

/** The camera as core publishes it (the shell must place it, never compute it). */
export interface CameraState {
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  viewW: number;
  viewH: number;
}

export async function cameraState(page: Page): Promise<CameraState> {
  return page.evaluate(() => {
    const c = window.__db?.world.snapshot().camera;
    const n = Number.NaN;
    return {
      x: c?.x ?? n,
      y: c?.y ?? n,
      renderX: c?.renderX ?? n,
      renderY: c?.renderY ?? n,
      viewW: c?.viewW ?? n,
      viewH: c?.viewH ?? n,
    };
  });
}

/**
 * The minimap's rect in CSS px, from the same debug registry the HUD buttons use (`debug.ts`). It is
 * how a peek test knows where to put the finger: the map is the camera control (D5).
 */
export async function minimapRect(page: Page): Promise<DebugButtonRect> {
  const rect = (await visibleButtons(page)).find((b) => b.id === 'minimap');
  if (!rect) throw new Error('the minimap is not on screen');
  return rect;
}

/** Waits until Bur is resting on a ledge, the only state a shot can leave from (D1). */
export async function waitForResting(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.state === 'RESTING', undefined, { timeout });
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

/** A recorded `GameEvent`, JSON round-tripped out of the page. `type` is always there. */
export type RecordedEvent = { type: string } & Record<string, unknown>;

/** Names the page uses to park the event recorder on `window`; test-only, never shipped. */
interface EventRecorder {
  __evts?: RecordedEvent[];
  __off?: () => void;
}

/**
 * Starts recording the TYPE of every `GameEvent` the world dispatches, and hands back a reader.
 *
 * `world.onEvent` is the right channel here (and not `snapshot().events`, which the shell drains
 * every frame): a test must be able to watch the events a gesture produced without racing the render
 * loop for them. Calling it again replaces the previous recording.
 */
export async function recordEvents(page: Page): Promise<() => Promise<RecordedEvent[]>> {
  await page.evaluate(() => {
    const w = window as unknown as EventRecorder;
    w.__off?.();
    w.__evts = [];
    const off = window.__db?.world.onEvent((e) => {
      // Round-tripped so the payload survives the bridge as plain data (every GameEvent field is).
      w.__evts?.push(JSON.parse(JSON.stringify(e)) as RecordedEvent);
    });
    if (off) w.__off = off;
  });
  return async () => page.evaluate(() => (window as unknown as EventRecorder).__evts ?? []);
}

/** The type of every recorded event, in order. */
export function typesOf(events: readonly RecordedEvent[]): string[] {
  return events.map((e) => e.type);
}

/**
 * Puts Bur adrift in open water with her D1 double jump already spent, so the next touch is the one
 * the rules must refuse. It writes the live bubble the snapshot exposes — the same door
 * `forceResacaDeath` uses — and never touches the shell.
 *
 * She is moved to `OPEN_WATER_X` and given a downward velocity on purpose: dropped where she was, she
 * re-captured the ceiling she had just been pinned under and the gesture under test became an
 * ordinary aim from rest.
 */
export async function spendAirLaunches(page: Page): Promise<void> {
  await page.evaluate((x) => {
    const world = window.__db?.world as unknown as {
      snapshot(): {
        bubble: Record<string, unknown> & { pos: { x: number; y: number }; vel: { x: number; y: number } };
        camera: { renderY: number };
      };
    };
    const sn = world.snapshot();
    sn.bubble.state = 'LAUNCHED';
    sn.bubble.restingOnId = null;
    sn.bubble.restMs = 0;
    sn.bubble.launchedMs = 0;
    // One more than any sane AIR_LAUNCHES_MAX: the budget is spent whatever the tuning says.
    sn.bubble.airLaunchesUsed = 9;
    sn.bubble.pos.x = x;
    sn.bubble.pos.y = sn.camera.renderY + 60;
    sn.bubble.vel.x = 0;
    sn.bubble.vel.y = 60; // falling, away from anything she could grab
  }, OPEN_WATER_X);
}
