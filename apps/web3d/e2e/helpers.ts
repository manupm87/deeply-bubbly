import type { CDPSession, Page } from '@playwright/test';

/** Shape of the debug handle `main.ts` installs under `?debug=1`; test-only, never shipped. */
export interface DebugButtonRect {
  id: string;
  label: string;
  state?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

interface SnapshotShape {
  timeMs: number;
  phase: string;
  bubble: Record<string, unknown> & {
    pos: { x: number; y: number };
    vel: { x: number; y: number };
    state: string;
    restingOnId: string | null;
    aimOrigin: { x: number; y: number } | null;
    air: number;
  };
  camera: { x: number; y: number; renderX: number; renderY: number; peekX: number; peekY: number; viewW: number; viewH: number };
  hud: { depthM: number; air: number };
  trajectory: Array<{ x: number; y: number }>;
}

declare global {
  interface Window {
    __db?: {
      world: { snapshot(): SnapshotShape; onEvent(listener: (e: { type: string }) => void): () => void };
      ctx: {
        scale: { zoom: number; viewW: number; viewH: number; offsetX: number; offsetY: number };
        save: { unlockedStation: number; tutorialDone: boolean };
      };
      tuning: { PULL_MAX_PX: number; PULL_CANCEL_PX: number };
      buttons(): DebugButtonRect[];
      scenes(): string[];
      nextShot(): { power: number; thetaDeg: number } | null;
      renderInfo(): { calls: number; triangles: number; textures: number };
      audit(): Array<{ id: string; tag: string; model: boolean; error: number | null }>;
      project(x: number, y: number): { x: number; y: number };
      models(): { loaded: number; failed: string[]; burUsesModel: boolean; ready: Promise<void> };
      shell: { frames: number };
    };
    __evts?: string[];
    __off?: () => void;
  }
}

export const SAVE_KEY = 'deeply-bubbly.save.v1';

export const SAVE_AT_STATION_0 = {
  version: 1,
  unlockedStation: 0,
  bestDepthM: 120,
  pearls: 7,
  shellsByImmersion: { 0: 2 },
  settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
  tutorialDone: true,
};

export async function bootGame(page: Page, query = ''): Promise<void> {
  await page.goto(`/?debug=1${query}`);
  await page.waitForFunction(() => window.__db !== undefined, undefined, { timeout: 30_000 });
}

/** Waits until every listed model has been tried, so a screenshot shows what the player ends up with. */
export async function modelsSettled(page: Page): Promise<{ loaded: number; failed: string[]; burUsesModel: boolean }> {
  await page.evaluate(() => window.__db?.models().ready);
  const frames = await page.evaluate(() => window.__db?.shell.frames ?? 0);
  await page.waitForFunction((n) => (window.__db?.shell.frames ?? 0) > n + 1, frames, { timeout: 30_000 });
  return page.evaluate(() => {
    const m = window.__db?.models();
    return { loaded: m?.loaded ?? 0, failed: m?.failed ?? [], burUsesModel: m?.burUsesModel ?? false };
  });
}

export async function seedSave(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, json]) => {
      window.localStorage.setItem(key, json);
    },
    [SAVE_KEY, JSON.stringify(save)] as const,
  );
}

export async function readSave(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  }, SAVE_KEY);
}

export async function visibleButtons(page: Page): Promise<DebugButtonRect[]> {
  return page.evaluate(() => (window.__db?.buttons() ?? []).filter((b) => b.visible));
}

export async function scenes(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__db?.scenes() ?? []);
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

/** Real touches over CDP: the same path a phone takes, with no hook into the shell. */
export class Finger {
  private constructor(
    private readonly cdp: CDPSession,
    private readonly id: number,
    private x: number,
    private y: number,
  ) {}

  static async press(page: Page, x: number, y: number, id = 0): Promise<Finger> {
    const cdp = await page.context().newCDPSession(page);
    const finger = new Finger(cdp, id, Math.round(x), Math.round(y));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger.point] });
    return finger;
  }

  get point(): { x: number; y: number; id: number } {
    return { x: this.x, y: this.y, id: this.id };
  }

  async move(x: number, y: number): Promise<void> {
    this.x = Math.round(x);
    this.y = Math.round(y);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [this.point] });
  }

  async lift(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await this.cdp.detach();
  }
}

export async function tapButton(page: Page, id: string): Promise<void> {
  const button = (await visibleButtons(page)).find((b) => b.id === id);
  if (!button) {
    const seen = (await visibleButtons(page)).map((b) => b.id).join(', ');
    throw new Error(`no visible button '${id}' (on screen: ${seen || 'none'})`);
  }
  const finger = await Finger.press(page, button.x, button.y);
  await page.waitForTimeout(80);
  await finger.lift();
}

export async function waitForResting(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => window.__db?.world.snapshot().bubble.state === 'RESTING', undefined, { timeout });
}

/** Records every `GameEvent` type the world dispatches from here on. */
export async function recordEvents(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    window.__off?.();
    window.__evts = [];
    const off = window.__db?.world.onEvent((e) => window.__evts?.push(e.type));
    if (off) window.__off = off;
  });
  return () => page.evaluate(() => window.__evts ?? []);
}

/**
 * The pull that takes core's own best shot from where Bur stands (`pickShot`), as a real drag: the shot
 * leaves opposite to the drag, so power and angle become a finger offset from the press point.
 * Returns the press and release points, and leaves the finger DOWN so the caller decides how it ends.
 */
export async function pullForNextShot(page: Page): Promise<{ finger: Finger; dx: number; dy: number }> {
  const plan = await page.evaluate(() => {
    const db = window.__db;
    const shot = db?.nextShot() ?? { power: 0.6, thetaDeg: 0 };
    const zoom = db?.ctx.scale.zoom ?? 2;
    const reach = (db?.tuning.PULL_MAX_PX ?? 70) * shot.power * zoom;
    const theta = (shot.thetaDeg * Math.PI) / 180;
    return { dx: -Math.sin(theta) * reach, dy: -Math.cos(theta) * reach, w: window.innerWidth, h: window.innerHeight };
  });
  // Pressed low and centred, far from every HUD control, with room to pull up and sideways.
  const x0 = plan.w / 2;
  const y0 = plan.h * 0.86;
  const finger = await Finger.press(page, x0, y0);
  const steps = 6;
  for (let k = 1; k <= steps; k++) {
    await finger.move(x0 + (plan.dx * k) / steps, y0 + (plan.dy * k) / steps);
    await page.waitForTimeout(40);
  }
  return { finger, dx: plan.dx, dy: plan.dy };
}
