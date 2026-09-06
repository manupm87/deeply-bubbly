/**
 * Adversarial pass over the world map (v1.3, docs/design/WORLD-MAP.md). These are the promises the
 * map makes that `map.spec.ts` does not pin down: that the main menu READS (nothing on it is drawn
 * over anything else), that a level bubble owns the whole 44 pt target §8 gives it, and that going
 * in and out of a run through the map neither leaks a listener nor leaves the world stepping behind
 * the menu.
 *
 * Written by the review pass, so a failure here is a report, not a regression: two of them fail on
 * the build under review and are described in the review's findings.
 */
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { bootGame, collectErrors, holdAndRelease, onMap, seedSave, tapButton, visibleButtons } from './helpers';

interface Finger {
  x: number;
  y: number;
  id: number;
}

const ts = (cdp: CDPSession, points: Finger[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
const tm = (cdp: CDPSession, points: Finger[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
const te = (cdp: CDPSession, points: Finger[]): Promise<unknown> =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points });

const SAVE_AT_STATION_0 = {
  version: 1,
  unlockedStation: 0,
  bestDepthM: 120,
  pearls: 7,
  shellsByImmersion: { 0: 2 },
  settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
  tutorialDone: true,
};

/** Minimal view of the pieces of the running game this spec has to reach through `__db`. */
interface MapProbe {
  __db: {
    ctx: {
      scale: { zoom: number; offsetX: number };
      bus: { eventNames(): Array<string | symbol>; listenerCount(event: string | symbol): number };
    };
    game: { scene: { getScene(key: string): { children: { list: unknown[] } } } };
    world: { snapshot(): { timeMs: number } };
    scenes(): string[];
  };
}

/** The map's title as it is actually laid out, in CSS px of the page. */
async function titleRectCss(page: Page): Promise<{ left: number; right: number }> {
  return page.evaluate(() => {
    const db = (window as unknown as MapProbe).__db;
    const { zoom, offsetX } = db.ctx.scale;
    interface Node {
      type: string;
      text?: string;
      x: number;
      displayWidth: number;
      list?: Node[];
    }
    const found: Node[] = [];
    const walk = (list: Node[]): void => {
      for (const o of list) {
        if (o.type === 'Text' && o.text === 'Deeply Bubbly') found.push(o);
        if (o.list) walk(o.list);
      }
    };
    walk(db.game.scene.getScene('Map').children.list as Node[]);
    const title = found[0];
    if (!title) throw new Error('the map has no title');
    return {
      left: offsetX + (title.x - title.displayWidth / 2) * zoom,
      right: offsetX + (title.x + title.displayWidth / 2) * zoom,
    };
  });
}

/**
 * The game's name is the first thing on the main menu and the sound switch is fixed in the corner
 * beside it: neither may be drawn over the other, at any of the three zooms §8 can pick.
 */
test('the map title is not covered by the sound switch', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  expect(await onMap(page)).toBe(true);

  const title = await titleRectCss(page);
  const sound = (await visibleButtons(page)).find((b) => b.id === 'map.sound');
  expect(sound, 'the map has a sound switch').toBeTruthy();
  const soundLeft = (sound?.x ?? 0) - (sound?.w ?? 0) / 2;
  expect(title.right, `title ends at ${title.right} css px, the sound plate starts at ${soundLeft}`).toBeLessThanOrEqual(
    soundLeft,
  );
  expect(errors).toEqual([]);
});

/**
 * §8's 44 pt rule is about the target a FINGER hits, so it has to be the node's own: a touch inside
 * a level's target must press that level, not the one below it. The node bubbles are 34 design px
 * apart, so at the zoom-1 layout (a short window, or a desktop one) the 44 px targets of two
 * neighbours overlap and the deeper node, drawn later, takes the contact.
 */
test.describe('at the zoom-1 layout', () => {
  test.use({ viewport: { width: 200, height: 700 } });

  test('a touch inside an open node presses that node, not the locked one below it', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, SAVE_AT_STATION_0);
    await bootGame(page);
    expect(await onMap(page)).toBe(true);
    const zoom = await page.evaluate(() => (window as unknown as MapProbe).__db.ctx.scale.zoom);
    expect(zoom, 'this case only exists at zoom 1').toBe(1);

    const node = (await visibleButtons(page)).find((b) => b.id === 'map.level.2');
    expect(node, 'level 2 is on screen').toBeTruthy();
    // 12 design px below the centre: comfortably inside the 44 css pt target the node promises.
    await holdAndRelease(page, node?.x ?? 0, (node?.y ?? 0) + 12 * zoom, 90);

    await expect
      .poll(async () => onMap(page), {
        timeout: 3_000,
        message: "a touch 12 px below level 2's centre, inside its own 44 pt target, never opened level 2",
      })
      .toBe(false);
    expect(errors).toEqual([]);
  });

  // The title yields to the sound switch by measuring it, so the answer has to hold at this zoom too,
  // where a touch target is 44 DESIGN px and the switch reserves more room than its plate shows.
  test('the title still clears the sound switch', async ({ page }) => {
    await seedSave(page, SAVE_AT_STATION_0);
    await bootGame(page);
    const title = await titleRectCss(page);
    const sound = (await visibleButtons(page)).find((b) => b.id === 'map.sound');
    const soundLeft = (sound?.x ?? 0) - (sound?.w ?? 0) / 2;
    expect(title.right, `title ends at ${title.right} css px, the sound switch starts at ${soundLeft}`).toBeLessThanOrEqual(
      soundLeft,
    );
  });
});

/**
 * Five round trips between the menu and a run. The map is a scene that is started and stopped over
 * and over, and every one of those stops has to take its listeners, its tweens and its debug
 * registrations with it — and leave the world it was showing frozen, not stepping behind the menu.
 */
test('going in and out of a run five times leaks nothing and never runs the world behind the map', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  const probe = async (): Promise<{ listeners: number; registered: number }> =>
    page.evaluate(() => {
      const db = (window as unknown as MapProbe).__db;
      const bus = db.ctx.bus;
      let listeners = 0;
      for (const name of bus.eventNames()) listeners += bus.listenerCount(name);
      return { listeners, registered: (window.__db?.buttons() ?? []).length };
    });

  const first = await probe();
  for (let i = 0; i < 5; i++) {
    await tapButton(page, 'map.level.2');
    await expect.poll(async () => onMap(page), { timeout: 5_000, message: `run ${i} started` }).toBe(false);
    await page.waitForTimeout(400);
    await tapButton(page, 'pause.open');
    await expect.poll(async () => (await visibleButtons(page)).map((b) => b.id), { timeout: 3_000 }).toContain(
      'pause.quit',
    );
    await tapButton(page, 'pause.quit');
    await expect.poll(async () => onMap(page), { timeout: 5_000, message: `back on the map, round ${i}` }).toBe(true);
    await page.waitForTimeout(300);

    const now = await probe();
    expect(now.listeners, `bus listeners after ${i + 1} round trips`).toBe(first.listeners);
    expect(now.registered, `registered buttons after ${i + 1} round trips`).toBe(first.registered);
  }

  // Nothing may simulate behind the menu: the run is over, the world is only waiting to be replaced.
  const before = await page.evaluate(() => (window as unknown as MapProbe).__db.world.snapshot().timeMs);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => (window as unknown as MapProbe).__db.world.snapshot().timeMs);
  expect(Math.abs(after - before), 'the world does not step while the map is up').toBeLessThan(100);
  expect(errors).toEqual([]);
});

/**
 * The game runs with two active pointers on purpose (D5), and a child holding a phone scrolls with
 * one thumb while the other lands on the node they want. The scroll belongs to the finger that made
 * it: a contact that never moved is a tap, whatever the other finger is doing.
 */
test('a second finger taps a node while the first one is still scrolling the map', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  expect(await onMap(page)).toBe(true);

  const cdp = await page.context().newCDPSession(page);
  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  // Down the left edge, clear of the nodes: this finger only ever scrolls.
  const from: Finger = { x: 8, y: Math.round(viewport.height * 0.7), id: 1 };
  await ts(cdp, [from]);
  let scroller = from;
  for (let k = 1; k <= 4; k++) {
    scroller = { ...from, y: from.y - 20 * k };
    await tm(cdp, [scroller]);
    await page.waitForTimeout(40);
  }

  // Read the node AFTER the scroll: the map moved under it.
  const node = (await visibleButtons(page)).find((b) => b.id === 'map.level.2');
  expect(node, 'level 2 is on screen while the map is being dragged').toBeTruthy();
  const tap: Finger = { x: Math.round(node?.x ?? 0), y: Math.round(node?.y ?? 0), id: 2 };
  await ts(cdp, [scroller, tap]);
  await page.waitForTimeout(80);
  await te(cdp, [tap]);
  await te(cdp, [scroller]);
  await cdp.detach();

  await expect
    .poll(async () => onMap(page), { timeout: 3_000, message: 'the tap of the second finger was refused' })
    .toBe(false);
  expect(errors).toEqual([]);
});
