import type { Vec2 } from '../math/vec';
import type { Bubble, Camera, RunState, WorldEntity } from '../types';
import type { Campaign } from '../level/campaign';

export type RespawnKind = 'ceiling' | 'chunkEntry' | 'boya' | 'station';

export interface RespawnPoint {
  pos: Vec2;
  kind: RespawnKind;
}

/**
 * Resaca respawn chain (§2.4.2): (a) last resting ceiling if still instantiated and within the camera recall band,
 * (b) entry anchor of the current chunk, (c) last boya / station. Never above run.maxProgressY's boya.
 */
export function resacaRespawnPoint(
  bubble: Bubble,
  run: RunState,
  cam: Camera,
  liveEntities: readonly WorldEntity[],
  campaign: Campaign,
): RespawnPoint {
  void bubble; void run; void cam; void liveEntities; void campaign;
  throw new Error('not implemented');
}

/** Death respawn (§2.4): last boya or station reached, whichever is deeper. Never the start of the immersion. */
export function deathRespawnPoint(run: RunState, campaign: Campaign): RespawnPoint {
  void run; void campaign;
  throw new Error('not implemented');
}
