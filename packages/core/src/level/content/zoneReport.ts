/**
 * One definition of "is this zone's content legal?", shared by every zone's test file.
 *
 * Zone 1 and Zone 2 grew the same four assertions independently — validate every chunk, validate the
 * campaign, validate each immersion with the isolation counter threaded, and re-run the whole reach
 * search with the top fifth of the power amputated — and the two copies had already drifted (one
 * checked warnings, the other only errors). DECISIONS-v1.2 D3/D4 rewrote the reach rule under both of
 * them, so the copies are collapsed here before a third zone makes a third one.
 *
 * It holds no `expect`: it produces a REPORT, and each zone's test asserts the report is empty. That
 * keeps it out of vitest's reach, so `game/testHarness.ts` and any future content tool can call it.
 */
import { createTuning } from '../../tuning';
import { ChunkLibrary } from '../library';
import { validateCampaign, validateChunk, validateSequence } from '../validator';
import type { Tuning } from '../../tuning';
import type { Chunk } from '../../types';
import type { ValidationIssue } from '../validator';

/** Fraction of the power range a zone must never need: a full pull is always headroom (§2.2). */
export const HEADROOM_POWER = 0.8;

export const errorsOf = (issues: readonly ValidationIssue[]): ValidationIssue[] =>
  issues.filter((i) => i.severity === 'error');

/** One readable line per issue, so a failing assertion names the rule and the chunk, not `Array(4)`. */
export const describeIssues = (issues: readonly ValidationIssue[]): string[] =>
  issues.map((i) => `${i.severity} [${i.rule}] ${i.chunkId ?? '-'}: ${i.message}`);

export interface ZoneValidationReport {
  /** Per chunk, every issue `validateChunk` reports — warnings included. */
  perChunk: Record<string, string[]>;
  /** Every issue of the whole campaign, seams between immersions included. */
  campaign: string[];
  /** Per immersion, with the §11.5.5 isolation counter threaded across them as the campaign threads it. */
  perImmersion: string[][];
  /**
   * The campaign again with IMPULSE_MAX capped so a full pull delivers exactly what HEADROOM_POWER
   * delivers today. Still clean = the zone never REQUIRES the top of the slingshot, which is what §2.2
   * promises and the only way to measure it is to take that power away and re-fly every certificate.
   */
  cappedImpulse: string[];
}

/** True when a report found nothing at all: the zone is legal. */
export function isClean(report: ZoneValidationReport): boolean {
  return (
    Object.values(report.perChunk).every((lines) => lines.length === 0) &&
    report.campaign.length === 0 &&
    report.perImmersion.every((lines) => lines.length === 0) &&
    report.cappedImpulse.length === 0
  );
}

/** Runs every §11.5 rule a zone's authored content has to satisfy, and reports what it found. */
export function validateZoneContent(
  chunks: readonly Chunk[],
  sequences: readonly (readonly string[])[],
  t: Tuning,
): ZoneValidationReport {
  const library = new ChunkLibrary([...chunks]);
  const capped = createTuning({ ...t, IMPULSE_MAX: t.IMPULSE_MIN + HEADROOM_POWER * (t.IMPULSE_MAX - t.IMPULSE_MIN) });

  const perChunk: Record<string, string[]> = {};
  for (const chunk of chunks) perChunk[chunk.id] = describeIssues(validateChunk(chunk, t));

  const appearances = new Map<number, number>();
  const perImmersion = sequences.map((sequence) => describeIssues(validateSequence(library, sequence, t, appearances)));

  return {
    perChunk,
    campaign: describeIssues(validateCampaign(library, sequences, t)),
    perImmersion,
    cappedImpulse: describeIssues(validateCampaign(library, sequences, capped)),
  };
}
