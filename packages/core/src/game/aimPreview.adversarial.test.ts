/**
 * Adversarial review of `game/aimPreview.ts` — the dotted guide of GDD §2.7.
 *
 * §2.7: "La trayectoria es **exacta hasta el primer rebote** y difusa después". §10.3 and the header of
 * `physics/step.ts` state the mechanism that makes that possible: "no hay dos físicas" — the guide runs
 * the same `physicsStep` the player will.
 *
 * Running the same step is not enough: it has to run it with the same WORLD. `bubbleStep` moves Bur
 * with `ignoreIds = passThroughIds(bubble)` — the trampoline cooldown of §2.2 ("tras rebotar en una
 * medusa, esa medusa se desinfla y Bur la atraviesa", 600 ms) and the ceiling she has just launched
 * from (§11.3, LAUNCH_LOCK_MS). `previewTrajectory` passes no ignore set at all, so for the whole
 * cooldown the guide draws a bounce off a body the physics is about to pass straight through — the
 * single case in which the arc is guaranteed to be wrong, and the case §2.2 makes routine.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { NEUTRAL_ENV } from '../physics/forceFields';
import { createBubble, stepBubble } from '../bubble/bubbleStep';
import { createRunState } from '../run/runState';
import { previewTrajectory } from './aimPreview';
import type { Bubble, Ceiling, PointerInput } from '../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const UP: PointerInput = { down: false, x: 0, y: 0 };

/** §5 nº 1, the Medusa Farolillo: non-capturable, restitution 0,92, deflates 600 ms after a bounce. */
const MEDUSA: Ceiling = {
  type: 'ceiling',
  id: 'medusa',
  rect: { x: 30, y: 200, w: 120, h: 10 },
  kind: 'posadero',
  capturable: false,
  restitution: T.RESTITUTION_JELLY,
  bounceCooldownMs: T.BOUNCE_COOLDOWN_MS,
  material: 'jelly',
  catalogId: 1,
};

/** A full hold aimed straight down, with the deflated medusa already on the pass-through list. */
function chargedOverADeflatedMedusa(): Bubble {
  const bubble = createBubble({ x: 90, y: 100 }, 0, T);
  bubble.state = 'CHARGING';
  bubble.chargeMs = T.CHARGE_FULL_MS;
  bubble.aimOrigin = { x: 90, y: 100 };
  bubble.aimTheta = 0;
  bubble.dragDist = T.DRAG_NEUTRAL_PX;
  bubble.holdLatched = true;
  bubble.passThrough = [{ id: MEDUSA.id, until: T.BOUNCE_COOLDOWN_MS }];
  return bubble;
}

describe('the guide is exact against the world Bur actually collides with (§2.7, §10.3)', () => {
  it('does not draw a bounce off a body on the pass-through list (§2.2 trampoline cooldown)', () => {
    const guide = previewTrajectory(chargedOverADeflatedMedusa(), [MEDUSA], NEUTRAL_ENV, 0, 0, T);

    // Ground truth: release the very same hold into the very same world and let `bubbleStep` run it.
    const bubble = chargedOverADeflatedMedusa();
    const run = createRunState(1, 'expedicion');
    let nowMs = 0;
    for (let i = 0; i < 40; i++) {
      stepBubble(
        bubble,
        run,
        { pointer: UP, solids: [MEDUSA], env: NEUTRAL_ENV, zone: 0, nowMs, dt: T.FIXED_DT, currentChunkId: 'c' },
        T,
      );
      nowMs += STEP_MS;
    }

    const below = MEDUSA.rect.y + MEDUSA.rect.h + bubble.radius;
    // The physics goes through the deflated medusa...
    expect(bubble.pos.y).toBeGreaterThan(below);
    // ...so the arc drawn for that same shot must go through it too, instead of stopping on its face.
    const last = guide[guide.length - 1];
    expect(last).toBeDefined();
    expect(last?.y ?? 0).toBeGreaterThan(below);
  });
});
