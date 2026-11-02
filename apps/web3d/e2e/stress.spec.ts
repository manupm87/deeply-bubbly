import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Finger, SAVE_AT_STATION_0, SAVE_KEY, bootGame, collectErrors, modelsSettled, pullForNextShot, readSave, scenes, seedSave, tapButton, visibleButtons, waitForResting } from './helpers';

/**
 * Trying to break the shell: tab hiding, audio coming back, context loss, a screen under the curtain, bad
 * saves, a full store, run after run, a descent of the whole column, and a storm of everything at once.
 */

interface StressDb {
  world: {
    snapshot(): { phase: string; timeMs: number; bubble: Record<string, unknown> & { pos: { x: number; y: number } }; camera: { y: number; renderX: number; renderY: number; viewH: number } };
    campaign: { bottomY: number };
  };
  ctx: { pointer: { down: boolean }; applyTuning(t: unknown): void; settings: Record<string, boolean>; campaign: { bottomY: number; immersions: unknown[] } };
  tuning: Record<string, unknown>;
  renderInfo(): { calls: number; triangles: number; geometries: number; textures: number };
  feel(): { audio: { state: string }; bubble: { sx: number; opacity: number; deflating: boolean } };
  shell: { frames: number; route: string; fx: { audio: { synth: { ctx: AudioContext; out: { gain: AudioParam } } | null } } };
  stage: { renderer: { getContext(): WebGL2RenderingContext } };
}

declare global {
  interface Window {
    __listeners?: number;
    __hide?: (hidden: boolean) => void;
  }
}

/** No test can hide a headless tab: this answers like one, and rAF really stops while it is hidden. */
async function installHider(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let hidden = false;
    const raf = window.requestAnimationFrame.bind(window);
    let parked: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb) => {
      if (!hidden) return raf(cb);
      parked.push(cb);
      return 0;
    };
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible') });
    window.__hide = (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
      if (!value) {
        const again = parked;
        parked = [];
        for (const cb of again) raf(cb);
      }
    };
  });
}

async function frameAfter(page: Page, count = 2): Promise<void> {
  const n = await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.shell.frames);
  await page.waitForFunction(([from, more]) => ((window as unknown as { __db: StressDb }).__db.shell.frames ?? 0) >= (from ?? 0) + (more ?? 0), [n, count] as const, { timeout: 30_000 });
}

/** The first touch of a session: it is what boots the AudioContext. */
async function touchToUnlockAudio(page: Page): Promise<void> {
  const finger = await Finger.press(page, 195, 700);
  await page.waitForTimeout(40);
  await finger.lift();
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.feel().audio.state === 'running');
}

async function killBur(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sn = (window as unknown as { __db: StressDb }).__db.world.snapshot();
    Object.assign(sn.bubble, { air: 0, state: 'DEAD', deadMs: 0, restingOnId: null });
  });
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().phase === 'dead', undefined, { timeout: 30_000 });
}

test('a hidden tab silences everything, a held pull included, and coming back brings the sea back', async ({ page }) => {
  await installHider(page);
  await bootGame(page, '&start=0');
  await waitForResting(page);
  await touchToUnlockAudio(page);
  await waitForResting(page);
  const { finger } = await pullForNextShot(page);
  await page.evaluate(() => window.__hide?.(true));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __db: StressDb }).__db.feel().audio.state)).toBe('suspended');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__hide?.(false));
  await finger.lift();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __db: StressDb }).__db.feel().audio.state)).toBe('running');
  await expect(page.getByRole('button', { name: 'Reiniciar Inmersión' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().bubble['state'])).not.toBe('LAUNCHED');
});

test('hiding and showing the tab on the map leaves the sea asleep', async ({ page }) => {
  await installHider(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  const finger = await Finger.press(page, 20, 400);
  await finger.lift();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __db: StressDb }).__db.feel().audio.state)).toBe('suspended');
  await page.evaluate(() => window.__hide?.(true));
  await page.evaluate(() => window.__hide?.(false));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.feel().audio.state)).toBe('suspended');
});

test('audio the system took away (a call, iOS "interrupted") comes back with the next touch, without piling up automation', async ({ page }) => {
  await bootGame(page, '&start=0');
  await waitForResting(page);
  await touchToUnlockAudio(page);
  await page.evaluate(async () => {
    const synth = (window as unknown as { __db: StressDb }).__db.shell.fx.audio.synth;
    await synth?.ctx.suspend();
  });
  // Stuck in a state only a gesture can leave, the frame loop keeps running and must not keep scheduling.
  const scheduled = await page.evaluate(async () => {
    const handle = (window as unknown as { __db: StressDb }).__db;
    const gain = handle.shell.fx.audio.synth?.out.gain;
    if (!gain) return -1;
    let calls = 0;
    const original = gain.setTargetAtTime.bind(gain);
    gain.setTargetAtTime = (...args: Parameters<AudioParam['setTargetAtTime']>) => {
      calls++;
      return original(...args);
    };
    const from = handle.shell.frames;
    await new Promise<void>((resolve) => {
      const wait = (): void => {
        if (handle.shell.frames >= from + 20) resolve();
        else requestAnimationFrame(wait);
      };
      wait();
    });
    return calls;
  });
  expect(scheduled).toBeLessThan(3);
  const finger = await Finger.press(page, 195, 700);
  await finger.lift();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __db: StressDb }).__db.feel().audio.state)).toBe('running');
});

test('a release during a hitstop still fires when the freeze ends', async ({ page }) => {
  await bootGame(page, '&start=0');
  await waitForResting(page);
  const { finger } = await pullForNextShot(page);
  await page.evaluate(() => (window as unknown as { __db: { ctx: { bus: { emit(e: string, ms: number): void } } } }).__db.ctx.bus.emit('hitstop', 400));
  await finger.lift();
  const during = await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().bubble['state']);
  expect(during).toBe('AIMING');
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().bubble['state'] === 'LAUNCHED', undefined, { timeout: 10_000 });
});

test('a double tap at every door: map node, pause, retry and quit each act once', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  const doubleTap = async (id: string): Promise<void> => {
    const button = (await visibleButtons(page)).find((b) => b.id === id);
    if (!button) throw new Error(`no visible '${id}'`);
    for (let i = 0; i < 2; i++) {
      const f = await Finger.press(page, button.x, button.y);
      await f.lift();
    }
  };
  const route = (): Promise<string> => page.evaluate(() => (window as unknown as { __db: StressDb }).__db.shell.route);
  await doubleTap('map.level.2');
  await expect.poll(route).toBe('run');
  await waitForResting(page);
  await killBur(page);
  await doubleTap('dead.giant');
  await waitForResting(page);
  expect(await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().phase)).toBe('playing');
  await tapButton(page, 'pause.open');
  await doubleTap('pause.resume');
  await frameAfter(page, 2);
  await expect(page.getByRole('button', { name: 'Reiniciar Inmersión' })).toBeHidden();
  await tapButton(page, 'pause.open');
  await doubleTap('pause.quit');
  await expect.poll(route).toBe('map');
  expect(await page.evaluate(() => document.querySelectorAll('.map').length)).toBe(1);
  expect(await page.evaluate(() => document.querySelectorAll('.run-ui').length)).toBe(0);
  expect(errors).toEqual([]);
});

test('a lost WebGL context comes back with the picture, and the game never stopped being playable', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page, '&start=0');
  await modelsSettled(page);
  await waitForResting(page);
  const before = await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.renderInfo());
  await page.evaluate(() => {
    const gl = (window as unknown as { __db: StressDb }).__db.stage.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    (window as unknown as { __ext: unknown }).__ext = ext;
    ext?.loseContext();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as unknown as { __ext: { restoreContext(): void } }).__ext.restoreContext());
  await page.waitForFunction(() => !(window as unknown as { __db: StressDb }).__db.stage.renderer.getContext().isContextLost());
  await frameAfter(page, 5);
  await page.waitForFunction((calls) => (window as unknown as { __db: StressDb }).__db.renderInfo().calls >= calls * 0.7, before.calls);
  const painted = await page.evaluate(() => {
    const gl = (window as unknown as { __db: StressDb }).__db.stage.renderer.getContext();
    return gl.getError();
  });
  expect(painted).toBe(0);
  expect(errors.filter((e) => !e.includes('Context Lost'))).toEqual([]);
});

test('the curtain rises over an end screen: its idle restart must not start the game behind it', async ({ page }) => {
  await bootGame(page, '&start=0');
  await waitForResting(page);
  await page.evaluate(() => {
    const handle = (window as unknown as { __db: StressDb }).__db;
    handle.ctx.applyTuning({ ...handle.tuning, DEAD_IDLE_AUTO_MS: 600 });
  });
  await killBur(page);
  await page.setViewportSize({ width: 900, height: 412 });
  await expect(page.locator('#rotate')).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().phase === 'playing', undefined, { timeout: 15_000 });
  await frameAfter(page, 3);
  const time = await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().timeMs);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().timeMs)).toBe(time);
  await page.setViewportSize({ width: 412, height: 839 });
  await expect(page.getByRole('button', { name: 'Reiniciar Inmersión' })).toBeVisible();
});

for (const [name, raw] of [
  ['garbage', '{not json'],
  ['a station past the campaign', JSON.stringify({ ...SAVE_AT_STATION_0, unlockedStation: 9999 })],
  ['wrong types', JSON.stringify({ version: 1, unlockedStation: 'x', pearls: null, shellsByImmersion: [1], settings: 3, tutorialDone: 'yes' })],
  ['a fraction and NaN-like numbers', JSON.stringify({ ...SAVE_AT_STATION_0, unlockedStation: 1.5, pearls: 1e308, bestDepthM: -5 })],
  ['a future version', JSON.stringify({ ...SAVE_AT_STATION_0, version: 99 })],
] as const) {
  test(`a save with ${name} boots and plays`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(([key, text]) => window.localStorage.setItem(key ?? '', text ?? ''), [SAVE_KEY, raw] as const);
    await bootGame(page);
    if ((await scenes(page)).includes('Map')) {
      const node = (await visibleButtons(page)).find((b) => b.id.startsWith('map.level.') && (b.state === 'available' || b.state === 'completed'));
      expect(node, 'an open level on the map').toBeTruthy();
      const finger = await Finger.press(page, node?.x ?? 0, node?.y ?? 0);
      await finger.lift();
    }
    await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.shell.route === 'run');
    await waitForResting(page);
    expect(errors).toEqual([]);
  });
}

test('a full store loses the telemetry mirror, not the save: the map keeps its progress', async ({ page }) => {
  await page.addInitScript(([key]) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string): void {
      if (k.includes('telemetry')) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, k, v);
    };
    void key;
  }, [SAVE_KEY] as const);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  await tapButton(page, 'map.level.2');
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.shell.route === 'run');
  await waitForResting(page);
  // Enough telemetry for the mirror to be attempted, whichever event writes first.
  await page.evaluate(() => (window as unknown as { __db: { ctx: { world: unknown } } }).__db.ctx);
  await page.evaluate(() => {
    const handle = window.__db as unknown as { world: { telemetry?: { track(e: unknown): void; flush?(): void } } };
    handle.world.telemetry?.track({ name: 'stress', timeMs: 0 });
    handle.world.telemetry?.flush?.();
  });
  await tapButton(page, 'pause.open');
  await tapButton(page, 'pause.quit');
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.shell.route === 'map');
  const buttons = await visibleButtons(page);
  expect(buttons.find((b) => b.id === 'map.level.2')?.state).toBe('available');
  expect((await readSave(page))?.['unlockedStation']).toBe(0);
});

test('a setting changed mid-run survives a reload on the end-of-campaign screen', async ({ page }) => {
  await bootGame(page, '&start=0');
  await waitForResting(page);
  await tapButton(page, 'pause.open');
  await tapButton(page, 'pause.noShake');
  await tapButton(page, 'pause.resume');
  await page.evaluate(() => {
    const handle = (window as unknown as { __db: StressDb }).__db;
    const sn = handle.world.snapshot();
    sn.bubble.pos.y = handle.ctx.campaign.bottomY + 5;
    (handle.world as unknown as { checkCampaignEnd(): void }).checkCampaignEnd();
  });
  await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.world.snapshot().phase === 'campaignComplete', undefined, { timeout: 30_000 });
  await frameAfter(page, 3);
  await page.reload();
  await page.waitForFunction(() => window.__db !== undefined);
  expect(((await readSave(page))?.['settings'] as Record<string, boolean>)['noShake']).toBe(true);
});

test('run after run: GPU objects, listeners and DOM do not grow', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    window.__listeners = 0;
    for (const target of [window, document]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => {
        window.__listeners = (window.__listeners ?? 0) + 1;
        add(type, listener, options);
      };
      target.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions) => {
        window.__listeners = (window.__listeners ?? 0) - 1;
        remove(type, listener, options);
      };
    }
  });
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  await page.evaluate(() => (window as unknown as { __db: { models(): { ready: Promise<void> } } }).__db.models().ready);
  const measure = (): Promise<{ geometries: number; textures: number; listeners: number; nodes: number }> =>
    page.evaluate(() => {
      const info = (window as unknown as { __db: StressDb }).__db.renderInfo();
      return { geometries: info.geometries, textures: info.textures, listeners: window.__listeners ?? 0, nodes: document.querySelectorAll('*').length };
    });
  const loop = async (): Promise<void> => {
    await tapButton(page, 'map.level.1');
    await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.shell.route === 'run');
    await waitForResting(page);
    await tapButton(page, 'pause.open');
    await tapButton(page, 'pause.restartImmersion');
    await waitForResting(page);
    await killBur(page);
    await tapButton(page, 'dead.giant');
    await waitForResting(page);
    await tapButton(page, 'pause.open');
    await tapButton(page, 'pause.quit');
    await page.waitForFunction(() => (window as unknown as { __db: StressDb }).__db.shell.route === 'map');
  };
  await loop();
  const first = await measure();
  for (let i = 0; i < 6; i++) await loop();
  const last = await measure();
  expect(last.listeners - first.listeners).toBe(0);
  expect(last.nodes - first.nodes).toBeLessThanOrEqual(1);
  expect(last.geometries - first.geometries).toBeLessThan(8);
  expect(last.textures - first.textures).toBeLessThan(8);
  expect(errors).toEqual([]);
});

test('the whole column in one go: every zone, within budget, no growth, no error', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await bootGame(page, '&start=0');
  expect((await modelsSettled(page)).failed).toEqual([]);
  const bottom = await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.ctx.campaign.bottomY);
  const seen: Array<{ y: number; calls: number; textures: number; geometries: number; heap: number }> = [];
  for (let y = 600; y < bottom - 200; y += 300) {
    const row = await page.evaluate(async (at) => {
      const handle = (window as unknown as { __db: StressDb & { world: { continueDescent(): void; restart(): void } } }).__db;
      handle.world.continueDescent();
      handle.world.restart();
      const sn = handle.world.snapshot();
      sn.bubble.pos.y = at;
      Object.assign(sn.camera, { y: at - 150 });
      Object.assign(sn.bubble, { air: 8, state: 'LAUNCHED', restingOnId: null, restMs: 0, launchedMs: 0 });
      const from = handle.shell.frames;
      await new Promise<void>((resolve) => {
        const wait = (): void => {
          if (handle.shell.frames >= from + 3) resolve();
          else requestAnimationFrame(wait);
        };
        wait();
      });
      const info = handle.renderInfo();
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return { y: at, calls: info.calls, textures: info.textures, geometries: info.geometries, heap: memory?.usedJSHeapSize ?? 0 };
    }, y);
    seen.push(row);
  }
  const later = seen.slice(Math.floor(seen.length / 3));
  const textures = later.map((r) => r.textures);
  const geometries = later.map((r) => r.geometries);
  expect(Math.max(...textures) - Math.min(...textures)).toBeLessThan(40);
  expect(Math.max(...geometries) - Math.min(...geometries)).toBeLessThan(60);
  expect(seen.length).toBeGreaterThan(15);
  expect(Math.max(...seen.map((r) => r.calls))).toBeLessThan(200);
  expect(errors).toEqual([]);
});

test('a storm: fingers, pause, hidden tab, rotation and restarts on top of each other break nothing', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await installHider(page);
  await bootGame(page, '&start=0');
  await waitForResting(page);
  let seed = 12345;
  const random = (n: number): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  const end = Date.now() + 75_000;
  let actions = 0;
  while (Date.now() < end) {
    actions++;
    const kind = random(9);
    const size = page.viewportSize() ?? { width: 412, height: 839 };
    if (kind <= 2) {
      const x = 40 + random(Math.max(1, size.width - 80));
      const y = 300 + random(Math.max(1, size.height - 340));
      const f = await Finger.press(page, x, y);
      await f.move(x + random(120) - 60, y - random(200));
      if (kind === 1) await page.waitForTimeout(random(120));
      await f.lift();
    } else if (kind === 3) {
      await page.evaluate(() => {
        window.__hide?.(true);
        window.__hide?.(false);
      });
    } else if (kind === 4) {
      await page.setViewportSize({ width: 900, height: 412 });
      await page.waitForTimeout(random(80));
      await page.setViewportSize({ width: 412, height: 839 });
    } else if (kind === 5) {
      await page.setViewportSize({ width: 320 + random(200), height: 560 + random(320) });
    } else {
      const buttons = (await visibleButtons(page)).filter((b) => b.id !== 'minimap' && b.id !== 'pause.quit' && b.id !== 'station.map' && b.id !== 'complete.map');
      const button = buttons[random(Math.max(1, buttons.length))];
      if (button) {
        const f = await Finger.press(page, button.x, button.y);
        await f.lift();
      }
    }
    const state = await page.evaluate(() => {
      const handle = (window as unknown as { __db: StressDb }).__db;
      const sn = handle.world.snapshot();
      return { x: sn.camera.renderX, y: sn.camera.renderY, px: sn.bubble.pos.x, py: sn.bubble.pos.y, route: handle.shell.route };
    });
    for (const v of [state.x, state.y, state.px, state.py]) expect(Number.isFinite(v)).toBe(true);
    expect(state.route).toBe('run');
  }
  expect(actions).toBeGreaterThan(20);
  await page.setViewportSize({ width: 412, height: 839 });
  await page.waitForTimeout(100);
  // It must still be a game: get out of whatever screen is up and take a real shot.
  for (let i = 0; i < 4; i++) {
    const ids = (await visibleButtons(page)).map((b) => b.id);
    const way = ['pause.resume', 'dead.giant', 'station.giant'].find((id) => ids.includes(id));
    if (!way) break;
    await tapButton(page, way);
    await page.waitForTimeout(100);
  }
  expect(await page.evaluate(() => (window as unknown as { __db: StressDb }).__db.ctx.pointer.down)).toBe(false);
  await waitForResting(page, 60_000);
  const { finger } = await pullForNextShot(page);
  await finger.lift();
  await page.waitForFunction(() => {
    const state = (window as unknown as { __db: StressDb }).__db.world.snapshot().bubble['state'];
    return state === 'LAUNCHED' || state === 'IDLE';
  }, undefined, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('the zone crossing has no visible pop: the picture changes smoothly through the boundary', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootGame(page, '&start=0');
  await modelsSettled(page);
  await waitForResting(page);
  const boundary = await page.evaluate(async () => {
    const manifest = (await (await fetch('backgrounds/manifest.json')).json()) as { zones: Record<string, { worldY: [number, number] }> };
    return manifest.zones['1']?.worldY[1] ?? 0;
  });
  expect(boundary).toBeGreaterThan(0);
  await page.evaluate(() => {
    const handle = (window as unknown as { __db: StressDb & { stage: { render(): void; renderer: { getContext(): WebGL2RenderingContext } } } }).__db;
    const world = handle.world as unknown as { snapshot(): { camera: Record<string, number> } };
    const original = world.snapshot.bind(world);
    const w = window as unknown as { __y: number; __mean: number[] };
    w.__y = 0;
    world.snapshot = () => {
      const s = original();
      if (w.__y > 0) s.camera = { ...s.camera, renderY: w.__y };
      return s;
    };
    const render = handle.stage.render.bind(handle.stage);
    handle.stage.render = () => {
      render();
      const gl = handle.stage.renderer.getContext();
      const px = new Uint8Array(4 * 64);
      const sums = [0, 0, 0];
      let at = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const x = Math.floor(((i + 0.5) / 8) * gl.drawingBufferWidth);
          const y = Math.floor(((j + 0.5) / 8) * gl.drawingBufferHeight);
          const one = new Uint8Array(4);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);
          px.set(one, at);
          at += 4;
          sums[0] = (sums[0] ?? 0) + (one[0] ?? 0);
          sums[1] = (sums[1] ?? 0) + (one[1] ?? 0);
          sums[2] = (sums[2] ?? 0) + (one[2] ?? 0);
        }
      }
      w.__mean = sums.map((v) => v / 64);
    };
  });
  const rows: Array<{ y: number; mean: number[]; calls: number }> = [];
  for (let offset = -500; offset <= 500; offset += 25) {
    const y = boundary - 200 + offset;
    const row = await page.evaluate(async (at) => {
      const handle = (window as unknown as { __db: StressDb }).__db;
      const w = window as unknown as { __y: number; __mean: number[] };
      w.__y = at;
      const from = handle.shell.frames;
      await new Promise<void>((resolve) => {
        const wait = (): void => {
          if (handle.shell.frames >= from + 3) resolve();
          else requestAnimationFrame(wait);
        };
        wait();
      });
      return { y: at, mean: w.__mean, calls: handle.renderInfo().calls };
    }, y);
    rows.push(row);
  }
  let worst = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]?.mean ?? [];
    const b = rows[i]?.mean ?? [];
    const jump = Math.max(...a.map((v, k) => Math.abs(v - (b[k] ?? 0))));
    worst = Math.max(worst, jump);
  }
  expect(worst).toBeLessThan(24);
  expect(errors).toEqual([]);
});
