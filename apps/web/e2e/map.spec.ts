/**
 * The world map is the main menu (docs/design/WORLD-MAP.md). It replaces the old start screen, and it
 * inherits its contracts:
 *   (a) a first-ever player sees NO menu at all — §8 forbids a modal before the wordless tutorial, and
 *       a menu is a modal with a nicer name;
 *   (b) a returning player boots ON the map, where every node's state is the one `levelStatuses`
 *       computed from the save, and nothing is simulated behind it;
 *   (c) tapping an open node starts the run at the checkpoint core says that level dives from, and
 *       never costs the player a checkpoint they own (§6.1: the save is monotonic);
 *   (d) a locked node says no and nothing else — no modal (WORLD-MAP.md §2);
 *   (e) the map is reachable back from a station, from the pause menu's "Salir", and the level just
 *       finished is drawn as completed when you get there.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  activeScenes,
  bootGame,
  burY,
  collectErrors,
  forceStationReached,
  immersionAnchors,
  onMap,
  readSave,
  seedSave,
  tapButton,
  visibleButtons,
  waitForResting,
} from './helpers';

/** A valid save (`SaveData`, version 1) for someone who has already banked the first station. */
const SAVE_AT_STATION_0 = {
  version: 1,
  unlockedStation: 0,
  bestDepthM: 120,
  pearls: 7,
  shellsByImmersion: { 0: 2 },
  settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
  tutorialDone: true,
};

/** Station 0 of the MVP campaign sits at y = 1200 px; a run that starts there is well past 1000. */
const STATION_0_MIN_Y = 1000;
/** The surface start is just under the first entry anchor (y ≈ 229) and Bur only rises from there. */
const SURFACE_MAX_Y = 300;

async function buttonIds(page: Page): Promise<string[]> {
  return (await visibleButtons(page)).map((b) => b.id);
}

async function nodeState(page: Page, id: string): Promise<string | undefined> {
  return (await visibleButtons(page)).find((b) => b.id === id)?.state;
}

async function simulationTimeMs(page: Page): Promise<number> {
  return page.evaluate(() => window.__db?.world.snapshot().timeMs ?? Number.NaN);
}

/** The wordless tutorial's ghost hand, found the way `shell.adversarial.spec.ts` finds it. */
async function tutorialHandVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    interface Node {
      type: string;
      visible: boolean;
      texture?: { key: string };
      list?: Node[];
    }
    const hud = (window as unknown as { __db: { game: { scene: { getScene(k: string): { children: { list: Node[] } } } } } })
      .__db.game.scene.getScene('Hud');
    return hud.children.list.some(
      (o) => o.type === 'Container' && o.visible && (o.list ?? []).some((c) => c.texture?.key === 'ui.hand' && c.visible),
    );
  });
}

/**
 * The world of a new run must actually STEP. Every route into one comes from a screen where nothing
 * was running, and Phaser reuses the scene instance across the stop/start, so a run that begins paused
 * looks perfect in a screenshot and never simulates a single frame.
 */
async function expectSimulationRunning(page: Page): Promise<void> {
  const before = await simulationTimeMs(page);
  await page.waitForTimeout(600);
  expect(await simulationTimeMs(page)).toBeGreaterThan(before + 300);
}

test('a first-ever player gets no map, just the game and the tutorial', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);

  expect(await activeScenes(page)).toContain('Game');
  expect(await onMap(page)).toBe(false);
  expect(await buttonIds(page)).not.toContain('map.level.1');
  expect(await tutorialHandVisible(page)).toBe(true);

  // The world is RUNNING from the first frame, which is the whole point of not showing a menu here.
  await waitForResting(page);
  await expectSimulationRunning(page);
  expect(errors).toEqual([]);
});

test('a returning player boots on the map, with every node in the state core computed', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  expect(await onMap(page)).toBe(true);
  const ids = await buttonIds(page);
  expect(ids).toContain('map.level.1');
  expect(ids).toContain('map.level.2');
  expect(ids).toContain('map.sound');
  // The first world is open; the two future ones are locked silhouettes.
  expect(ids).toContain('map.world.amber-ocean');
  expect(await nodeState(page, 'map.world.volcano')).toBe('locked');

  // unlockedStation = 0: level 1 is done, level 2 is the one to dive, level 3 waits for it, and the
  // MVP campaign has 5 immersions, so level 6 has no content at all.
  expect(await nodeState(page, 'map.level.1')).toBe('completed');
  expect(await nodeState(page, 'map.level.2')).toBe('available');
  expect(await nodeState(page, 'map.level.3')).toBe('locked');
  expect(await nodeState(page, 'map.level.6')).toBe('noContent');

  // Nothing is simulated behind the menu.
  const before = await simulationTimeMs(page);
  await page.waitForTimeout(700);
  expect(Math.abs((await simulationTimeMs(page)) - before)).toBeLessThan(100);
  expect(errors).toEqual([]);
});

test('tapping the open node dives at its checkpoint, and node 1 still dives from the surface', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  const anchors = await immersionAnchors(page);
  await tapButton(page, 'map.level.2');
  await expect.poll(async () => onMap(page), { timeout: 3_000, message: 'the map closed' }).toBe(false);

  // Level 2 starts from checkpoint 0: the station that closes immersion 1, just above immersion 2.
  await expect
    .poll(async () => burY(page), { timeout: 3_000, message: 'the run started at station 0' })
    .toBeGreaterThan(STATION_0_MIN_Y);
  expect(await burY(page)).toBeLessThan((anchors[1]?.startY ?? 0) + 200);
  await expectSimulationRunning(page);
  // A run from a checkpoint never rewrites meta-progression (§6.1).
  expect((await readSave(page))?.['unlockedStation']).toBe(0);

  // Back to the map, and down node 1: the surface is never taken away (§3.1, "se puede").
  await tapButton(page, 'pause.open');
  await expect.poll(async () => buttonIds(page), { timeout: 3_000 }).toContain('pause.quit');
  await tapButton(page, 'pause.quit');
  await expect.poll(async () => onMap(page), { timeout: 3_000, message: 'the pause menu quit to the map' }).toBe(true);

  await tapButton(page, 'map.level.1');
  await expect
    .poll(async () => burY(page), { timeout: 3_000, message: 'Bur restarted at the surface' })
    .toBeLessThan(SURFACE_MAX_Y);
  await expectSimulationRunning(page);
  expect((await readSave(page))?.['unlockedStation']).toBe(0);
  expect(errors).toEqual([]);
});

test('a locked node does nothing at all', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  await tapButton(page, 'map.level.3');
  await page.waitForTimeout(700);
  expect(await onMap(page)).toBe(true);
  // No modal, no screen, nothing new to dismiss: the map is exactly as it was.
  expect(await buttonIds(page)).toContain('map.level.3');
  expect(await nodeState(page, 'map.level.3')).toBe('locked');

  await tapButton(page, 'map.level.6');
  await page.waitForTimeout(500);
  expect(await onMap(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('a station offers the map, and the level just finished is drawn as completed', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  await tapButton(page, 'map.level.2');
  await expect.poll(async () => onMap(page), { timeout: 3_000 }).toBe(false);

  await forceStationReached(page);
  await expect
    .poll(async () => buttonIds(page), { timeout: 3_000, message: 'the station screen is up' })
    .toEqual(expect.arrayContaining(['station.map']));

  await tapButton(page, 'station.map');
  await expect.poll(async () => onMap(page), { timeout: 3_000, message: 'the station led back to the map' }).toBe(true);

  // The station banked immersion 1, so its node is completed and the next one has opened.
  expect((await readSave(page))?.['unlockedStation']).toBe(1);
  expect(await nodeState(page, 'map.level.2')).toBe('completed');
  expect(await nodeState(page, 'map.level.3')).toBe('available');
  expect(errors).toEqual([]);
});

test('the map remembers the sound switch', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  const before = (await visibleButtons(page)).find((b) => b.id === 'map.sound')?.label ?? '';
  await tapButton(page, 'map.sound');
  await expect
    .poll(async () => (await visibleButtons(page)).find((b) => b.id === 'map.sound')?.label ?? '', { timeout: 2_000 })
    .not.toBe(before);
  const save = await readSave(page);
  expect((save?.['settings'] as { sound: boolean } | undefined)?.sound).toBe(false);
  expect(errors).toEqual([]);
});
