/**
 * A whole game, from Zone 1 content, with no shell attached: `ChunkLibrary(Z1_CHUNKS)` +
 * `buildCampaign(Z1_SEQUENCES)` + the no-op ports. The web bootstrap and every headless test build
 * their world through here so "the game" is one definition, not two that drift (§11.7.14 compares two
 * instances of it, and they must be the same instance recipe).
 *
 * It is shipped, not test-only: `apps/web` needs exactly this world plus a renderer.
 */
import { DEFAULT_TUNING } from '../tuning';
import { MemoryStore, noopAds, noopTelemetry } from '../ports';
import { ChunkLibrary } from '../level/library';
import { buildCampaign } from '../level/campaign';
import { Z1_CHUNKS, Z1_SEQUENCES } from '../level/content/z1';
import { Z2_CHUNKS, Z2_SEQUENCES } from '../level/content/z2';
import { GameWorld } from './GameWorld';
import type { Tuning } from '../tuning';
import type { AdProvider, KeyValueStore, Telemetry } from '../ports';
import type { Campaign } from '../level/campaign';
import type { Chunk, GameMode, PointerInput } from '../types';

/** Design height used when nothing else is asked for: the middle of the 320–420 band of §11.1. */
export const HARNESS_VIEW_H = 400;

export interface TestWorldOptions {
  tuning?: Tuning;
  viewH?: number;
  seed?: number;
  startStationIndex?: number;
  mode?: GameMode;
  store?: KeyValueStore;
  telemetry?: Telemetry;
  ads?: AdProvider;
}

/** The Zone 1 campaign: two immersions of six chunks, the second closing the zone (§12.1). */
export function buildZ1Campaign(t: Tuning = DEFAULT_TUNING): Campaign {
  return buildCampaign(new ChunkLibrary(Z1_CHUNKS), Z1_SEQUENCES, t);
}

/**
 * Every chunk the MVP ships (§12.1: "Zona 1 con arte real; Zonas 2 y 3 en greybox"), and the campaign
 * built from them. One continuous 30-chunk column: Z1's two immersions (world px 0..2 880, exactly the
 * §11.1 span of "Superficie") followed by Z2's three (2 880..7 200, exactly "Borde de arrecife"), so
 * the zone the §11.1 table reports at a depth and the zone the chunk was authored for are the same
 * zone at every y — which is what makes the station at the end of Z1's second immersion a real
 * `zoneTo: 1` transition and not a bookkeeping accident.
 */
export const MVP_CHUNKS: readonly Chunk[] = [...Z1_CHUNKS, ...Z2_CHUNKS];
export const MVP_SEQUENCES: readonly (readonly string[])[] = [...Z1_SEQUENCES, ...Z2_SEQUENCES];

/** The campaign the shipped game plays: Zone 1 + Zone 2 (§12.1). */
export function buildMvpCampaign(t: Tuning = DEFAULT_TUNING): Campaign {
  return buildCampaign(new ChunkLibrary(MVP_CHUNKS), MVP_SEQUENCES, t);
}

/**
 * Kept under its own name because it is what the shell and the Z2 tests ask for by that name; it is
 * the MVP campaign, and there is only one.
 */
export const buildCampaignZ1Z2 = buildMvpCampaign;

/** A ready-to-step `GameWorld` on the Z1 campaign. Every option has a deterministic default. */
export function createTestWorld(options: TestWorldOptions = {}): GameWorld {
  return createWorldOnCampaign(buildZ1Campaign, options);
}

/** The same, on the full MVP campaign (Z1 + Z2): what `apps/web` boots and what the Z2 tests play. */
export function createMvpWorld(options: TestWorldOptions = {}): GameWorld {
  return createWorldOnCampaign(buildMvpCampaign, options);
}

function createWorldOnCampaign(build: (t: Tuning) => Campaign, options: TestWorldOptions): GameWorld {
  const tuning = options.tuning ?? DEFAULT_TUNING;
  return new GameWorld({
    campaign: build(tuning),
    tuning,
    telemetry: options.telemetry ?? noopTelemetry,
    ads: options.ads ?? noopAds,
    store: options.store ?? new MemoryStore(),
    viewH: options.viewH ?? HARNESS_VIEW_H,
    seed: options.seed ?? 1,
    ...(options.startStationIndex === undefined ? {} : { startStationIndex: options.startStationIndex }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
  });
}

/** Pointer up: the resting sample the shell sends on every frame the glass is not touched. */
export const POINTER_UP: PointerInput = { down: false, x: 0, y: 0 };

/**
 * A scripted finger that charges for `holdMs`, lifts for `releaseMs` and repeats (§11.7.14 asks for
 * exactly this shape of recorded input). The pointer is placed `reachPx` BELOW Bur on screen, which is
 * a straight-down aim: `computeAim` measures `atan2(dx, dy)` from the frozen origin, so dx = 0 gives
 * theta = 0, and dy > AIM_MIN_RADIUS keeps the aim valid.
 *
 * It must be driven from a fresh snapshot every frame because the origin is Bur's live position and the
 * conversion to viewport coordinates needs the live camera.
 */
export class ScriptedFinger {
  private phaseMs = 0;
  constructor(
    private readonly holdMs: number,
    private readonly releaseMs: number,
    /** Screen offset of the pointer from Bur; > AIM_MIN_RADIUS, and 45 px is the neutral drag (§11.4). */
    private readonly reachPx = 45,
    /** Horizontal offset in px, applied as a deterministic ±/0 pattern; 0 aims straight down. */
    private readonly lateralPx = 0,
  ) {}

  /** Next pointer sample. `burY`/`camY` come from the snapshot taken just before this frame. */
  next(frameDtMs: number, burX: number, burY: number, camY: number): PointerInput {
    const cycle = this.holdMs + this.releaseMs;
    if (!(cycle > 0)) return POINTER_UP;
    const down = this.phaseMs % cycle < this.holdMs;
    // Alternating sides, so a bot that gets wedged under one ledge still has a second line to try.
    const swing = Math.floor(this.phaseMs / cycle) % 2 === 0 ? 1 : -1;
    this.phaseMs = (this.phaseMs + Math.max(0, frameDtMs)) % (cycle * 2);
    return { down, x: burX + this.lateralPx * swing, y: burY - camY + this.reachPx };
  }
}
