/**
 * §2.4.2: "reaparece con velocidad 0 en el mejor anclaje disponible, con 700 ms de invulnerabilidad".
 * The pose is shared by the resaca respawn and the "Otra vez" restart, so it is tested once.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createBubble } from '../bubble/bubbleStep';
import { placeBubble } from './respawnFlow';
import type { Tuning } from '../tuning';

const T: Tuning = createTuning();

describe('placeBubble', () => {
  it('puts a wrecked bubble back in a clean IDLE pose with grace', () => {
    const bubble = createBubble({ x: 10, y: 10 }, 0, T);
    bubble.state = 'DEAD';
    bubble.deadMs = 700;
    bubble.vel = { x: 300, y: -200 };
    bubble.chargeMs = 800;
    bubble.aimOrigin = { x: 1, y: 2 };
    bubble.restingOnId = 'ledge';
    bubble.lastRestingCeilingId = 'ledge';
    bubble.bounceChain = 4;
    bubble.bounceChainBodies.push('a', 'b');
    bubble.passThrough = [{ id: 'x', until: 99_999 }];
    bubble.flags.resacaUntil = 5;
    bubble.flags.trapVentAt = 7;
    bubble.flags.stunUntil = 9;

    const events = placeBubble(bubble, { pos: { x: 90, y: 720 }, kind: 'boya' }, 1000, T);

    expect(bubble.pos).toEqual({ x: 90, y: 720 });
    expect(bubble.vel).toEqual({ x: 0, y: 0 });
    expect(bubble.state).toBe('IDLE');
    expect(bubble.deadMs).toBe(0);
    expect(bubble.chargeMs).toBe(0);
    expect(bubble.aimOrigin).toBeNull();
    expect(bubble.restingOnId).toBeNull();
    expect(bubble.lastRestingCeilingId).toBeNull();
    expect(bubble.bounceChain).toBe(0);
    expect(bubble.bounceChainBodies).toHaveLength(0);
    expect(bubble.passThrough).toHaveLength(0);
    expect(bubble.flags.invulnUntil).toBe(1000 + T.INVULN_MS);
    expect(bubble.flags.stunUntil).toBe(0);
    expect(bubble.flags.resacaUntil).toBe(0);
    expect(bubble.flags.trapVentAt).toBe(0);
    expect(events).toEqual([{ type: 'respawn', at: { x: 90, y: 720 }, anchorKind: 'boya' }]);
  });

  it('latches the hold, so the tap that restarts does not become the next shot (§2.2)', () => {
    const bubble = createBubble({ x: 10, y: 10 }, 0, T);
    placeBubble(bubble, { pos: { x: 90, y: 40 }, kind: 'chunkEntry' }, 0, T);
    expect(bubble.holdLatched).toBe(true);
  });

  it('ends the windows that belonged to the place she left (§4.3, §2.6, §2.4.4)', () => {
    const bubble = createBubble({ x: 10, y: 10 }, 0, T);
    bubble.flags.ascensoUntil = 9_000; // a fumarola window: it would widen the recall band at the checkpoint
    bubble.flags.reinflateUntil = 9_000; // §2.6: the radius of a bag she popped back there
    bubble.pressureDrainMs = 900;

    placeBubble(bubble, { pos: { x: 90, y: 720 }, kind: 'boya' }, 1000, T);

    expect(bubble.flags.ascensoUntil).toBe(0);
    expect(bubble.flags.reinflateUntil).toBe(0);
    expect(bubble.pressureDrainMs).toBe(0);
  });

  it('copies the point instead of aliasing it', () => {
    const bubble = createBubble({ x: 10, y: 10 }, 0, T);
    const point = { pos: { x: 90, y: 720 }, kind: 'station' } as const;
    placeBubble(bubble, point, 0, T);
    bubble.pos.x = 5;
    expect(point.pos.x).toBe(90);
  });

  it('leaves Air alone: the resaca has already charged its pip and the restart refills (§2.4)', () => {
    const bubble = createBubble({ x: 10, y: 10 }, 0, T);
    bubble.air = 2;
    placeBubble(bubble, { pos: { x: 90, y: 720 }, kind: 'boya' }, 0, T);
    expect(bubble.air).toBe(2);
  });
});
