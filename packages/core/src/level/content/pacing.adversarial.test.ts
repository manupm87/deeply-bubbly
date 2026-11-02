/**
 * ADVERSARIAL review of what the re-authored ladders promise the player (DECISIONS-v1.2 D6): the target is
 * on screen when the shot is chosen, and no stretch between checkpoints outlasts pillar 3. Before D6 the
 * same bot measured 62 % of its targets off screen and stretches of up to 43 s, so these numbers are the
 * regression they exist to catch, and they are played, not computed from `targetTimeS`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../tuning';
import { buildMvpCampaign } from '../../game/testHarness';
import { ChunkLibrary } from '../library';
import { validateSequence } from '../validator';
import { EXIT_LEDGE_Y, MAX_HOP_X_DESIGN_PX, SEAM_DROP_PX } from './ladder';
import { anchorsOf, campaignLadder } from './layout';
import { anchorOffscreenShare, landingPoseAudit, ledgeOffscreenShare, measurePacing } from './pacing';
import { Z1_CHUNKS } from './z1';
import { Z2_CHUNKS } from './z2';
import type { Chunk, ForceField } from '../../types';

const t = DEFAULT_TUNING;
const campaign = buildMvpCampaign(t);
const ordered: Chunk[] = campaign.placed.map((p) => p.chunk);

/** Budgets a little over what is measured today, so a real regression fails and rounding does not. */
const MAX_ANCHOR_OFFSCREEN = 0.15;
const MAX_LEDGE_OFFSCREEN = 0.1;

/** The shots a stretch can spend: 14 at the ~2,2 s a shot the bot measures is the 31 s of the worst one. */
const MAX_SHOTS_PER_STRETCH = 15;

describe('ADVERSARIAL — the whole campaign, played (D6, pillar 3)', () => {
  for (const viewH of [320, 400]) {
    describe(`in a ${viewH} px tall view`, () => {
      const report = measurePacing({ viewH });

      it('reaches the bottom without drowning', () => {
        expect(report.completed).toBe(true);
        expect(report.deaths).toBe(0);
        expect(report.launches).toBeGreaterThan(90);
      });

      it('never spends more than MAX_SEGMENT_S between two checkpoints', () => {
        expect(report.stretches).toHaveLength(10);
        for (const s of report.stretches) expect(s.seconds, s.label).toBeLessThanOrEqual(t.MAX_SEGMENT_S);
      });

      it('never asks for more than a stretch of shots', () => {
        for (const s of report.stretches) expect(s.shots, s.label).toBeLessThanOrEqual(MAX_SHOTS_PER_STRETCH);
      });

      it('has the next rest point in view on far more shots than it does not', () => {
        expect(report.view.shots).toBeGreaterThan(90);
        expect(anchorOffscreenShare(report.view)).toBeLessThanOrEqual(MAX_ANCHOR_OFFSCREEN);
        expect(ledgeOffscreenShare(report.view)).toBeLessThanOrEqual(MAX_LEDGE_OFFSCREEN);
      });
    });
  }
});

describe('ADVERSARIAL — every immersion, entered from the map (§3.1)', () => {
  // The map starts a run in mid-station, where Bur floats up into the terrace at WORLD_W / 2 rather than
  // landing on its declared anchor. A hop certified only from the anchor once sent this bot into 200 s of
  // fallback shots on exactly this path, so each start is played on its own.
  for (let start = -1; start < 4; start++) {
    it(`crosses the immersion after station ${start} with no death, inside the budget`, () => {
      const report = measurePacing({ startStationIndex: start, untilStationIndex: start + 1 });
      expect(report.completed).toBe(true);
      expect(report.deaths).toBe(0);
      for (const s of report.stretches) expect(s.seconds, s.label).toBeLessThanOrEqual(t.MAX_SEGMENT_S);
    });
  }
});

describe('ADVERSARIAL — a landing is never exactly on the anchor', () => {
  it('leaves a shot to the next rung from either side of where Bur really rests', () => {
    expect(landingPoseAudit(t).failures).toEqual([]);
  });
});

describe('ADVERSARIAL — the ladder rules behind those numbers (D6)', () => {
  const rungs = campaignLadder(ordered);

  it('holds every zone to the same lateral reach: the view does not shrink with depth', () => {
    for (let z = 0; z < t.MAX_HOP_X_PX.length; z++) expect(t.MAX_HOP_X_PX[z]).toBe(MAX_HOP_X_DESIGN_PX);
    expect(MAX_HOP_X_DESIGN_PX).toBe(120);
  });

  it('rejects a hop one pixel past the reach, whatever else is true of it', () => {
    const base = Z2_CHUNKS[1];
    if (base === undefined) throw new Error('no chunk to mutate');
    const anchors = anchorsOf(base);
    const first = anchors[0];
    const second = anchors[1];
    if (first === undefined || second === undefined) throw new Error('no hop to mutate');
    const moved: Chunk = {
      ...base,
      id: 'fixture-wide',
      entities: base.entities.map((e) =>
        e.id === first.id && e.type === 'anchor' ? { ...e, pos: { x: second.pos.x + MAX_HOP_X_DESIGN_PX + 1, y: e.pos.y } } : e,
      ),
    };
    const issues = validateSequence(new ChunkLibrary([moved]), [moved.id], t).filter((i) => i.rule === 'reach');
    expect(issues.map((i) => i.message).join('\n')).toContain('exceeds MAX_HOP_X_PX 120');
  });

  it('keeps most hops reversing, which is the only way the next anchor can be in view', () => {
    // After a hop Bur sits on the leading edge of CAM_DEADZONE_X with 63 px of water ahead, and no hop is
    // under 70 px: a same-direction hop always has its anchor out of the view (`ladder.ts`).
    const hops = rungs.slice(1).map((r, i) => Math.sign(r.pos.x - (rungs[i]?.pos.x ?? r.pos.x)));
    let sameWay = 0;
    for (let i = 1; i < hops.length; i++) if (hops[i] === hops[i - 1]) sameWay++;
    expect(sameWay / hops.length).toBeLessThanOrEqual(MAX_ANCHOR_OFFSCREEN);
  });

  it('still crosses the column somewhere: a world that never leaves one screen is not D3', () => {
    const xs = rungs.map((r) => r.pos.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(2 * t.VIEW_W);
  });

  it('never needs more than one hop per third of a chunk, seams included', () => {
    expect(SEAM_DROP_PX).toBe(80);
    const threeRung = [...Z1_CHUNKS, ...Z2_CHUNKS].filter((c) => anchorsOf(c).length === 3);
    expect(threeRung.length / (Z1_CHUNKS.length + Z2_CHUNKS.length)).toBeGreaterThanOrEqual(0.6);
  });

  it('comes back to the west exit before every station, or the station ladder would not close', () => {
    for (const immersion of campaign.immersions) {
      const index = Math.round((immersion.stationY - t.CHUNK_H) / t.CHUNK_H);
      const last = campaign.placed[index]?.chunk;
      if (last === undefined) throw new Error('no chunk above the station');
      expect(anchorsOf(last).at(-1)?.pos.x, last.id).toBe(245);
    }
  });

  it('keeps every band above the cornice, so a respawn on the seam rises straight into it (§2.4.2)', () => {
    // A boya respawn starts at WORLD_W / 2 on the seam and floats up into the exit cornice. With a band
    // strong enough to be a verb, one reaching that column would blow her past the only ceiling there.
    const bands = Z2_CHUNKS.flatMap((c) => c.entities.filter((e): e is ForceField => e.type === 'forcefield'));
    expect(bands.length).toBeGreaterThan(0);
    for (const b of bands) expect(b.rect.y + b.rect.h, b.id).toBeLessThanOrEqual(EXIT_LEDGE_Y);
  });
});
