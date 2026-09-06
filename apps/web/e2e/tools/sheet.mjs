import { chromium } from '@playwright/test';
const out = process.argv[2];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5199/?debug=1');
await page.waitForFunction(() => window.__db && window.__db.world.snapshot().phase !== '', undefined, { timeout: 30000 });
await page.waitForTimeout(1200);
const png = await page.evaluate(async () => {
  const solids = await import('/src/render/solids.ts');
  const px = await import('/src/render/pixels.ts');
  const tex = await import('/src/render/textures.ts');
  const scene = window.__db.game.scene.getScenes(true).find((s) => s.scene.key === 'GameScene') ?? window.__db.game.scene.getScenes(true)[0];
  console.log('scene', scene && scene.scene.key);
  const p = tex.paletteOf(0);
  const W = 220, H = 300;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g2 = c.getContext('2d');
  g2.fillStyle = '#2a8ba0'; g2.fillRect(0, 0, W, H);
  const mats = ['rock','coral','kelp','jelly','foam','creature'];
  let y = 14;
  for (const m of mats) {
    const w = m === 'creature' ? 48 : 60, h = m === 'jelly' ? 10 : 7;
    const g = px.gfx(scene);
    solids.drawSolidBody(g, w, h, m, p);
    const glow = px.gfx(scene);
    solids.drawGlowLine(glow, w, h, m, m !== 'jelly', p);
    const key = 'sheet-' + m;
    const pad = 12;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const rt = scene.make.renderTexture({ width: w + pad * 2, height: h + pad * 2 }, false);
    rt.draw(g, pad, pad); rt.draw(glow, pad, pad);
    // snapshot pixels
    await new Promise(res => rt.snapshot((img) => { g2.drawImage(img, 8, y); res(); }));
    rt.destroy(); g.destroy(); glow.destroy();
    y += h + pad * 2 + 6;
  }
  // creatures
  let x = 120; y = 14;
  for (const [id, f] of [[5,0],[5,1],[3,0],[1,0],[6,0]]) {
    const k = tex.creatureKey(id, 0, f);
    if (!scene.textures.exists(k)) continue;
    const im = scene.textures.get(k).getSourceImage();
    g2.drawImage(im, x, y);
    y += (im.height ?? 40) + 4;
  }
  return c.toDataURL('image/png');
});
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
await b.close();
