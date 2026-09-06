/**
 * §2.4.2 and §4.3: the resaca starts only when Bur is above the top edge AND the camera has already
 * spent its whole recall band chasing her — and never during an ascenso window.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createBubble } from '../bubble/bubbleStep';
import { createCamera } from '../camera/camera';
import { isResaca, updateResaca } from './resaca';
import type { Tuning } from '../tuning';
import type { Camera } from '../types';

const T: Tuning = createTuning();
const VIEW_H = 400;

/** Camera whose band is fully spent: `cam.y` sits exactly at `maxY - recallPx`, as `stepCamera` clamps it. */
function spentCamera(maxY: number): Camera {
  const cam = createCamera(maxY + VIEW_H * T.CAM_ANCHOR, VIEW_H, T);
  cam.maxY = maxY;
  cam.recallPx = T.CAM_RECALL_PX;
  cam.y = maxY - T.CAM_RECALL_PX;
  return cam;
}

describe('isResaca (§4.3)', () => {
  it('needs Bur entirely above the top edge', () => {
    const cam = spentCamera(1000); // cam.y = 904
    expect(isResaca(cam, 900, 7)).toBe(false); // 900 + 7 > 904: still poking into the view
    expect(isResaca(cam, 897, 7)).toBe(false); // 897 + 7 === 904: exactly touching the edge
    expect(isResaca(cam, 896, 7)).toBe(true); // one pixel clear of it
  });

  it('does not fire while the camera can still follow her up', () => {
    const cam = spentCamera(1000);
    cam.y = cam.maxY - T.CAM_RECALL_PX / 2; // half the band left
    expect(isResaca(cam, cam.y - 100, 7)).toBe(false);
  });

  it('the wide ascenso band is what makes the fumarola safe (§4.3)', () => {
    const cam = spentCamera(1000);
    cam.recallPx = T.CAM_RECALL_ASCENSO_PX;
    cam.y = cam.maxY - T.CAM_RECALL_PX; // the camera has not spent the OPEN band
    expect(isResaca(cam, cam.y - 100, 7)).toBe(false);
  });
});

describe('updateResaca (§2.4.2)', () => {
  const drifting = () => {
    const bubble = createBubble({ x: 90, y: 800 }, 0, T);
    const cam = spentCamera(1000);
    return { bubble, cam };
  };

  it('opens the 1.600 ms window once, with one warning', () => {
    const { bubble, cam } = drifting();
    const first = updateResaca(bubble, cam, { ascenso: false, playing: true, nowMs: 5000 }, T);
    expect(first).toEqual([{ type: 'resacaWarning' }]);
    expect(bubble.flags.resacaUntil).toBe(5000 + T.RESACA_GRACE_MS);

    const again = updateResaca(bubble, cam, { ascenso: false, playing: true, nowMs: 5016 }, T);
    expect(again).toHaveLength(0);
    expect(bubble.flags.resacaUntil).toBe(5000 + T.RESACA_GRACE_MS);
  });

  it('closes it the moment Bur is back in the view: the window is not a countdown to punishment', () => {
    const { bubble, cam } = drifting();
    updateResaca(bubble, cam, { ascenso: false, playing: true, nowMs: 0 }, T);
    bubble.pos.y = 1000;
    expect(updateResaca(bubble, cam, { ascenso: false, playing: true, nowMs: 100 }, T)).toHaveLength(0);
    expect(bubble.flags.resacaUntil).toBe(0);
  });

  it('is suspended by ascenso, by the station phase and by the deflate', () => {
    for (const input of [
      { ascenso: true, playing: true },
      { ascenso: false, playing: false },
    ]) {
      const { bubble, cam } = drifting();
      expect(updateResaca(bubble, cam, { ...input, nowMs: 0 }, T)).toHaveLength(0);
      expect(bubble.flags.resacaUntil).toBe(0);
    }
    const { bubble, cam } = drifting();
    bubble.state = 'DEAD';
    expect(updateResaca(bubble, cam, { ascenso: false, playing: true, nowMs: 0 }, T)).toHaveLength(0);
  });
});
