/**
 * The start screen (GDD §3.1): "cada estación alcanzada queda desbloqueada para siempre y se puede
 * empezar la partida desde ahí". *Se puede* — a choice. The bug these tests pin: every boot forced the
 * run to start at the deepest unlocked station and the pause menu's "Salir" led to a single "Bajar"
 * button that resumed that very run, so the surface was unreachable for good.
 *
 * The three contracts checked here:
 *   (a) a first-ever player sees NO title at all (§8: no modals before the wordless tutorial);
 *   (b) a returning player is asked, both answers work, and answering "from the surface" does not cost
 *       them the checkpoint they own (§6.1: the save is monotonic);
 *   (c) the same screen — the same component — is reachable mid-dive from the pause menu.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootGame, burY, collectErrors, readSave, seedSave, tapButton, visibleButtons } from './helpers';

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

/** Station 0 of the MVP campaign sits at y = 1200 px; a run resumed there starts well past 1000. */
const STATION_0_MIN_Y = 1000;
/** The surface start is just under the first entry anchor (y ≈ 229) and Bur only rises from there. */
const SURFACE_MAX_Y = 300;

async function buttonIds(page: Page): Promise<string[]> {
  return (await visibleButtons(page)).map((b) => b.id);
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

test('a first-ever player gets no title screen, just the tutorial', async ({ page }) => {
  const errors = collectErrors(page);
  await bootGame(page);

  expect(await buttonIds(page)).not.toContain('start.continue');
  expect(await buttonIds(page)).not.toContain('start.surface');
  expect(await tutorialHandVisible(page)).toBe(true);

  // Bur is born at y ≈ 229 and rises on her own into the foam raft above her (§8 step 1): the world is
  // RUNNING from the first frame, which is the whole point of not showing a modal here.
  const y = await burY(page);
  expect(y).toBeGreaterThan(180);
  expect(y).toBeLessThan(260);
  const before = await simulationTimeMs(page);
  await page.waitForTimeout(600);
  expect(await simulationTimeMs(page)).toBeGreaterThan(before + 300);
  expect(await burY(page)).toBeLessThanOrEqual(y + 1);

  expect(errors).toEqual([]);
});

test('a returning player is offered both starts, and the world waits for the answer', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  const buttons = await visibleButtons(page);
  const ids = buttons.map((b) => b.id);
  expect(ids).toContain('start.continue');
  expect(ids).toContain('start.surface');
  // Both live in the bottom third, under the thumb (§8).
  const viewport = page.viewportSize() ?? { width: 412, height: 915 };
  for (const button of buttons.filter((b) => b.id.startsWith('start.'))) {
    expect(button.y).toBeGreaterThan(viewport.height * 0.55);
    expect(button.label.length).toBeGreaterThan(0);
  }

  // Nothing is simulated behind the choice.
  const before = await simulationTimeMs(page);
  await page.waitForTimeout(700);
  expect(Math.abs((await simulationTimeMs(page)) - before)).toBeLessThan(100);

  expect(errors).toEqual([]);
});

/**
 * The world of a new run must actually STEP. Every route into one is taken from a frozen world (the
 * title and the pause menu both pause), and Phaser reuses the scene instance across the stop/start,
 * so a run that begins paused looks perfect in a screenshot and never simulates a single frame.
 */
async function expectSimulationRunning(page: Page): Promise<void> {
  const before = await simulationTimeMs(page);
  await page.waitForTimeout(600);
  expect(await simulationTimeMs(page)).toBeGreaterThan(before + 300);
}

test('"desde la superficie" starts at 0 m and keeps the unlocked station', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  expect(await burY(page)).toBeGreaterThan(STATION_0_MIN_Y);
  await tapButton(page, 'start.surface');

  await expect
    .poll(async () => burY(page), { timeout: 2_000, message: 'Bur restarted at the surface' })
    .toBeLessThan(SURFACE_MAX_Y);
  // The title is not asked twice: the player has just answered it.
  expect(await buttonIds(page)).not.toContain('start.surface');
  await expectSimulationRunning(page);

  const save = await readSave(page);
  expect(save?.['unlockedStation']).toBe(0);
  expect(errors).toEqual([]);
});

test('"seguir" dives at the unlocked station', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  await tapButton(page, 'start.continue');
  await expect
    .poll(async () => buttonIds(page), { timeout: 2_000, message: 'the title closed' })
    .not.toContain('start.continue');

  expect(await burY(page)).toBeGreaterThan(STATION_0_MIN_Y);
  // Resuming, not rebuilding: the world was already there, so the simulation just starts running.
  const before = await simulationTimeMs(page);
  await page.waitForTimeout(600);
  expect(await simulationTimeMs(page)).toBeGreaterThan(before + 300);

  expect(errors).toEqual([]);
});

test('the pause menu "Salir" opens the same start screen mid-dive', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);
  await tapButton(page, 'start.continue');
  await page.waitForTimeout(400);

  await tapButton(page, 'pause.open');
  await expect
    .poll(async () => buttonIds(page), { timeout: 2_000, message: 'the pause menu opened' })
    .toContain('pause.quit');

  await tapButton(page, 'pause.quit');
  await expect
    .poll(async () => buttonIds(page), { timeout: 2_000, message: 'the start screen opened' })
    .toEqual(expect.arrayContaining(['start.continue', 'start.surface']));

  // From here the surface is reachable in the middle of a run.
  await tapButton(page, 'start.surface');
  await expect
    .poll(async () => burY(page), { timeout: 2_000, message: 'Bur restarted at the surface' })
    .toBeLessThan(SURFACE_MAX_Y);
  await expectSimulationRunning(page);
  expect((await readSave(page))?.['unlockedStation']).toBe(0);

  expect(errors).toEqual([]);
});

/**
 * "Seguir" resumes the world that is on screen, so the depth beside it is a promise about THAT world.
 * A run taken from the surface is not the checkpoint run, and the button must stop claiming it is.
 */
test('the title never promises a depth the run it resumes does not start at', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  const bootLabel = (await visibleButtons(page)).find((b) => b.id === 'start.continue')?.label ?? '';
  expect(bootLabel).toMatch(/\d/);

  await tapButton(page, 'start.surface');
  await expect
    .poll(async () => burY(page), { timeout: 2_000, message: 'Bur restarted at the surface' })
    .toBeLessThan(SURFACE_MAX_Y);
  await tapButton(page, 'pause.open');
  await expect.poll(async () => buttonIds(page), { timeout: 2_000 }).toContain('pause.quit');
  await tapButton(page, 'pause.quit');
  await expect.poll(async () => buttonIds(page), { timeout: 2_000 }).toContain('start.continue');

  const surfaceLabel = (await visibleButtons(page)).find((b) => b.id === 'start.continue')?.label ?? '';
  expect(surfaceLabel).not.toMatch(/\d/);
  expect(errors).toEqual([]);
});

/**
 * §8's automatic pause has nothing to add over the start screen — the world is already frozen and an
 * overlay already owns the screen — and swapping in the pause menu would answer the choice for the
 * player, since its "Seguir" dives at the checkpoint.
 */
test('an automatic pause leaves the start screen (and its choice) on screen', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, SAVE_AT_STATION_0);
  await bootGame(page);

  const before = await simulationTimeMs(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(500);

  expect(await buttonIds(page)).toEqual(expect.arrayContaining(['start.continue', 'start.surface']));
  expect(await buttonIds(page)).not.toContain('pause.resume');
  expect(Math.abs((await simulationTimeMs(page)) - before)).toBeLessThan(100);
  expect(errors).toEqual([]);
});
