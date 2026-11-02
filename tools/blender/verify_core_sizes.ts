/**
 * Walks every entity of the authored Zone 1 and 2 content and checks the manifest has art for it at its
 * collision size, so the Python constants cannot drift from core unnoticed. Read-only on core.
 *
 *   npx -y tsx tools/blender/verify_core_sizes.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z1_CHUNKS } from '../../packages/core/src/level/content/z1/index';
import { Z2_CHUNKS } from '../../packages/core/src/level/content/z2/index';
import { DEFAULT_TUNING } from '../../packages/core/src/tuning';

interface Entry {
  name: string;
  kind: string;
  size: { w: number; h: number };
  catalogId?: number;
  pickupType?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, '../../apps/web3d/public/models/manifest.json'), 'utf8')) as {
  assets: Entry[];
};
const byName = new Map(manifest.assets.map((a) => [a.name, a]));
const byCatalog = new Map(manifest.assets.filter((a) => a.catalogId != null).map((a) => [a.catalogId, a]));
const failures = new Set<string>();
const seen = new Map<string, number>();
const note = (key: string): void => void seen.set(key, (seen.get(key) ?? 0) + 1);

function expectBox(what: string, asset: Entry | undefined, w: number, h: number): void {
  if (!asset) failures.add(`${what}: no asset`);
  else if (asset.size.w !== w || asset.size.h !== h) failures.add(`${what}: core box ${w}x${h}, ${asset.name} is ${asset.size.w}x${asset.size.h}`);
}

function expectAsset(what: string, name: string): void {
  if (!byName.has(name)) failures.add(`${what}: missing ${name}`);
}

const zones = [
  [1, Z1_CHUNKS],
  [2, Z2_CHUNKS],
] as const;

for (const [zone, chunks] of zones) {
  expectAsset('buoy', `boya_z${zone}`);
  expectAsset('station', `station_z${zone}`);
  for (const chunk of chunks) {
    for (const e of chunk.entities) {
      switch (e.type) {
        case 'ceiling': {
          note(`ceiling ${e.material}${e.catalogId ? ` #${e.catalogId}` : ''}`);
          if (e.catalogId) expectBox(`catalogue ${e.catalogId} in ${chunk.id}`, byCatalog.get(e.catalogId), e.rect.w, e.rect.h);
          else {
            const stem = `ledge_z${zone}_${e.material}`;
            for (const part of ['short', 'medium', 'long', 'cap_l', 'mid', 'cap_r']) expectAsset(`${e.material} in ${chunk.id}`, `${stem}_${part}`);
            const h = byName.get(`${stem}_mid`)?.size.h;
            if (h !== e.rect.h) failures.add(`${e.id}: ledge h ${e.rect.h}, tiles are ${h}`);
          }
          break;
        }
        case 'wall': {
          note(`wall ${e.material}`);
          const stem = `wall_z${zone}_${e.material}`;
          for (const part of ['cap_top', 'mid', 'cap_bottom']) expectAsset(`wall in ${chunk.id}`, `${stem}_${part}`);
          const w = byName.get(`${stem}_mid`)?.size.w;
          if (w !== e.rect.w) failures.add(`${e.id}: wall w ${e.rect.w}, tiles are ${w}`);
          break;
        }
        case 'hazard':
          note(`hazard #${e.catalogId}`);
          expectBox(`hazard ${e.catalogId} in ${chunk.id}`, byCatalog.get(e.catalogId), e.shape.w, e.shape.h);
          break;
        case 'forcefield':
          note(`field #${e.catalogId}`);
          if (!byCatalog.has(e.catalogId)) failures.add(`field ${e.catalogId}: no asset`);
          break;
        case 'pickup':
          note(`pickup ${e.pickupType}`);
          expectBox(`pickup ${e.pickupType} in ${chunk.id}`, byName.get(`pickup_${e.pickupType}`), e.radius * 2, e.radius * 2);
          break;
        default:
          note(e.type);
      }
    }
  }
}

expectBox('bur', byName.get('bur'), DEFAULT_TUNING.RADIUS_BASE * 2, DEFAULT_TUNING.RADIUS_BASE * 2);

console.log([...seen].map(([k, v]) => `${String(v).padStart(4)}  ${k}`).sort((a, b) => a.slice(6).localeCompare(b.slice(6))).join('\n'));
for (const f of failures) console.log('FAIL', f);
console.log(failures.size === 0 ? 'OK' : `${failures.size} failures`);
process.exit(failures.size === 0 ? 0 : 1);
