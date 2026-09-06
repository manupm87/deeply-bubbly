/**
 * A whole game, from Zone 1 content, with no shell attached: `ChunkLibrary(Z1_CHUNKS)` +
 * `buildCampaign(Z1_SEQUENCES)` + the no-op ports. The web bootstrap and every headless test build
 * their world through here so "the game" is one definition, not two that drift (§11.7.14 compares two
 * instances of it, and they must be the same instance recipe).
 *
 * It is shipped, not test-only: `apps/web` needs exactly this world plus a renderer.
 */
import { DEFAULT_TUNING } from '../tuning';
import { clamp, degToRad } from '../math/vec';
import { MemoryStore, noopAds, noopTelemetry } from '../ports';
import { ChunkLibrary } from '../level/library';
import { buildCampaign } from '../level/campaign';
import { Z1_CHUNKS, Z1_SEQUENCES } from '../level/content/z1';
import { Z2_CHUNKS, Z2_SEQUENCES } from '../level/content/z2';
import { GameWorld } from './GameWorld';
import type { Tuning } from '../tuning';
import type { AdProvider, KeyValueStore, Telemetry } from '../ports';
import type { Campaign } from '../level/campaign';
import type { Vec2 } from '../math/vec';
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
 * The pull vector (finger MINUS frozen origin, in design px) that asks for `power` at `thetaDeg`.
 *
 * It is the inverse of `computeAim` and it is exported because every scripted input in the project
 * needs it: DECISIONS-v1.2 D2 launches Bur in the direction OPPOSITE to the drag, so "shoot straight
 * down at full power" is the counter-intuitive `{ x: 0, y: -PULL_MAX_PX }` — a finger that travels UP
 * the screen. Writing that offset out by hand in every test and bot is how the sign gets flipped.
 *
 * `thetaDeg` is the LAUNCH angle from straight down (+ = right), the same convention as `pullTheta`.
 */
export function pullGesture(power: number, thetaDeg = 0, t: Tuning = DEFAULT_TUNING): Vec2 {
  const theta = degToRad(thetaDeg);
  const dist = clamp(power, 0, 1) * t.PULL_MAX_PX;
  return { x: -Math.sin(theta) * dist, y: -Math.cos(theta) * dist };
}

/** Fraction of the press spent extending the sling; the rest holds it at full stretch before release. */
const RAMP_FRACTION = 0.6;

/** What the finger needs to know about the frame it is about to answer. */
export interface FingerSample {
  /** Bur's WORLD position, from the snapshot taken just before this frame. */
  burX: number;
  burY: number;
  /** Top-left of the view in world px (`camera.x`, `camera.y`); x defaults to 0. */
  camY: number;
  camX?: number;
  /**
   * Whether a NEW gesture may be opened this frame. Default true. A bot that plays the D1 rules
   * passes `state === 'RESTING'`: since D1 a touch in open water is either the one metered double
   * jump or nothing at all, so a fixed-cadence finger would spend Bur's Air on shots it did not
   * need. A gesture already under way is never interrupted by this.
   */
  canAim?: boolean;
}

/**
 * A scripted finger that plays the D2 slingshot: it presses at Bur's screen position, drags the sling
 * out over a few frames, holds it and lifts. §11.7.14 asks for exactly this shape of recorded input.
 *
 * Three details that are not decoration. The press point is LATCHED at the pointerdown, because the
 * pull is measured from the origin frozen there and Bur keeps drifting while the sling is drawn — a
 * finger that tracked her live position would shorten its own pull to nothing. The pull is RAMPED
 * rather than teleported to full stretch, both because that is what a thumb does and because the
 * first frames of every press are inside PULL_CANCEL_PX, where D2 says there is no shot yet. And the
 * press WAITS for `canAim`: under D1 the game is played from the ledges, so the finger presses when
 * Bur has something to push off and keeps still the rest of the time.
 *
 * It must be driven from a fresh snapshot every frame: the conversion to viewport coordinates needs
 * the live camera.
 */
export class ScriptedFinger {
  private phaseMs = 0;
  /** Presses completed, so the aim alternates sides even when the wait between them varies. */
  private presses = 0;
  /** Viewport point of the pointerdown, held for the whole contact; null while the finger is up. */
  private anchor: Vec2 | null = null;

  constructor(
    /** Pull length as a fraction of PULL_MAX_PX; 1 = full power. */
    private readonly power = 1,
    /** Launch angle in degrees from straight down; the sign alternates between presses. */
    private readonly thetaDeg = 0,
    private readonly pullMs = 250,
    private readonly releaseMs = 300,
    private readonly t: Tuning = DEFAULT_TUNING,
  ) {}

  /** Next pointer sample for this frame. */
  next(frameDtMs: number, at: FingerSample): PointerInput {
    const cycle = this.pullMs + this.releaseMs;
    if (!(cycle > 0)) return POINTER_UP;

    // Nothing to push off yet: hold the finger up with the clock parked, so the next gesture starts
    // whole the moment Bur lands instead of halfway through a press she could not have made.
    if (this.anchor === null && at.canAim === false) {
      this.phaseMs = 0;
      return POINTER_UP;
    }

    const phase = this.phaseMs % cycle;
    this.phaseMs = (this.phaseMs + Math.max(0, frameDtMs)) % cycle;
    if (phase >= this.pullMs) {
      if (this.anchor !== null) this.presses += 1;
      this.anchor = null;
      return POINTER_UP;
    }

    // Alternating sides, so a bot wedged under one ledge still has a second line to try.
    const swing = this.presses % 2 === 0 ? 1 : -1;
    const anchor = (this.anchor ??= { x: at.burX - (at.camX ?? 0), y: at.burY - at.camY });
    const stretch = clamp(phase / Math.max(1, this.pullMs * RAMP_FRACTION), 0, 1);
    const pull = pullGesture(this.power * stretch, this.thetaDeg * swing, this.t);
    return { down: true, x: anchor.x + pull.x, y: anchor.y + pull.y };
  }
}
