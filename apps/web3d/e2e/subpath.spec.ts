import { expect, test } from '@playwright/test';
import { SAVE_AT_STATION_0, SAVE_KEY, collectErrors } from './helpers';

/** The production build as Pages would serve it: under /3d/, sharing its origin with the Phaser game. */

interface SubpathServer {
  origin: string;
  outside: string[];
  close(): Promise<void>;
}

const PREFIXED = `3d:${SAVE_KEY}`;
let server: SubpathServer;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const tool = new URL('./tools/subpath-server.mjs', import.meta.url).href;
  const module = (await import(tool)) as { start(): Promise<SubpathServer> };
  server = await module.start();
});

test.afterAll(async () => {
  await server.close();
});

test('every asset loads from under /3d/, with or without the final slash', async ({ page }) => {
  const errors = collectErrors(page);
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${server.origin}/3d?debug=1`);
  expect(new URL(page.url()).pathname).toBe('/3d/');
  await page.waitForFunction(() => window.__db !== undefined);
  await page.evaluate(() => window.__db?.models().ready);
  const models = await page.evaluate(() => {
    const m = window.__db?.models();
    return { loaded: m?.loaded ?? 0, failed: m?.failed ?? [] };
  });
  expect(models.loaded).toBeGreaterThan(30);
  expect(models.failed).toEqual([]);
  await page.waitForFunction(() => (window.__db as unknown as { shell: { parallax: { ready: boolean } } }).shell.parallax.ready);
  await page.waitForFunction(() => window.__db?.models().burUsesModel === true);
  expect(failed).toEqual([]);
  expect(server.outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('the save lives under its own prefix: neither game can read or undo the other one', async ({ page }) => {
  const phaser = JSON.stringify({ ...SAVE_AT_STATION_0, pearls: 99 });
  await page.goto(`${server.origin}/3d/?debug=1`);
  await page.evaluate(
    ([key, text]) => {
      window.localStorage.clear();
      window.localStorage.setItem(key ?? '', text ?? '');
    },
    [SAVE_KEY, phaser] as const,
  );
  await page.reload();
  await page.waitForFunction(() => window.__db !== undefined);
  // The Phaser player's checkpoint is not this game's: a first run, not her map.
  expect(await page.evaluate(() => window.__db?.scenes())).toEqual(['Game', 'Hud']);
  await page.evaluate(([key, save]) => window.localStorage.setItem(key ?? '', save ?? ''), [PREFIXED, JSON.stringify(SAVE_AT_STATION_0)] as const);
  await page.reload();
  await page.waitForFunction(() => window.__db !== undefined);
  expect(await page.evaluate(() => window.__db?.scenes())).toEqual(['Map']);
  await page.evaluate(() => (window.__db as unknown as { ctx: { persistSettings(): void } }).ctx.persistSettings());
  expect(await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY)).toBe(phaser);
  const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
  expect(keys.filter((k) => !k.startsWith('3d:'))).toEqual([SAVE_KEY]);
});

test('a plain production load exposes no debug handle and shows the game', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${server.origin}/3d/`);
  await expect(page.locator('#stage')).toBeVisible();
  await expect(page.locator('.run-ui, .map').first()).toBeAttached();
  expect(await page.evaluate(() => '__db' in window)).toBe(false);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
