/**
 * Resaca detection (GDD §2.4.2 and §4.3). Detection needs the camera, so it cannot live in
 * `bubbleStep`; the PENALTY does live there (a pure clock on `flags.resacaUntil`, reported back as
 * `requestRespawn`), and this file only opens and closes that window.
 */
import { isAboveView } from '../camera/camera';
import type { Tuning } from '../tuning';
import type { Bubble, Camera, GameEvent } from '../types';

/** Slack for "the camera is already touching its recall limit": `stepCamera` clamps it to exactly that. */
const LIMIT_EPS = 1e-6;

/**
 * §4.3, both halves of the sentence: Bur is above the top edge AND the camera is already at its recall
 * limit. The second half is not decoration — while the camera is still travelling up after her, the
 * view has not given up on her yet, and §4.3 wants the warning only "cuando de verdad te estás yendo
 * del nivel". During ASCENSO the band is 640 px wide and the resaca is suspended outright (§4.3).
 */
export function isResaca(cam: Camera, burY: number, radius: number): boolean {
  if (!isAboveView(cam, burY, radius)) return false;
  return cam.y <= cam.maxY - cam.recallPx + LIMIT_EPS;
}

export interface ResacaInput {
  ascenso: boolean;
  /** Only 'playing' can drown: a station, the deflate and the end screens are not the level (§3.3). */
  playing: boolean;
  nowMs: number;
}

/**
 * Opens the 1.600 ms grace window (one `resacaWarning`) or closes it the moment Bur is back inside the
 * view, inside an ascenso window, dead or out of play. `stepBubble` serves the timeout.
 */
export function updateResaca(bubble: Bubble, cam: Camera, input: ResacaInput, t: Tuning): GameEvent[] {
  const drifting =
    input.playing && !input.ascenso && bubble.state !== 'DEAD' && isResaca(cam, bubble.pos.y, bubble.radius);

  if (!drifting) {
    bubble.flags.resacaUntil = 0;
    return [];
  }
  if (bubble.flags.resacaUntil !== 0) return [];
  bubble.flags.resacaUntil = input.nowMs + t.RESACA_GRACE_MS;
  return [{ type: 'resacaWarning' }];
}
