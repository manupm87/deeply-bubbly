/**
 * What the camera does on top of where core puts it: a springy kick, a decaying shake, a zoom punch and a
 * slow pull back while the sling is at full stretch (GDD §7). All of it is presentation: it goes to
 * `Stage.place` and never reaches `renderX/renderY`, so nothing here can touch a rule or the sling's maths.
 *
 * "Sin temblor" removes the kick and the shake. Reduced motion removes those and every zoom as well.
 */
import type { Settings } from '../context';
import { reducedMotion } from './motion';

/** Spring of the kick: quick and underdamped, one visible overshoot and it is gone. */
const SPRING_W = 26;
const SPRING_DAMP = 0.62;
const SPRING_STEP_S = 1 / 120;
/** A kick never moves the view further than this, however many land together (design px). */
const MAX_OFFSET_PX = 4.5;
/** How much further back the camera sits at full pull: §7 asks for 5 %, this keeps the view steadier. */
const CHARGE_ZOOM_OUT = 0.035;
const CHARGE_RATE = 7;

export class CameraJuice {
  x = 0;
  y = 0;
  /** Multiplies the camera's distance: above 1 is further away. */
  zoom = 1;
  private vx = 0;
  private vy = 0;
  private shakePx = 0;
  private shakeMs = 0;
  private shakeTotal = 0;
  private shakeClock = 0;
  private punchPct = 0;
  private punchMs = 0;
  private punchTotal = 0;
  private charge = 0;

  constructor(private readonly settings: Settings) {}

  /** Sets the view moving along (dx, dy); `px` is about how far it gets at the first peak. */
  kick(dx: number, dy: number, px: number): void {
    if (this.settings.noShake || reducedMotion()) return;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const speed = px * SPRING_W * 1.6;
    this.vx += (dx / len) * speed;
    this.vy += (dy / len) * speed;
  }

  shake(px: number, ms: number): void {
    if (this.settings.noShake || reducedMotion()) return;
    if (px < this.currentShake()) return;
    this.shakePx = px;
    this.shakeMs = ms;
    this.shakeTotal = ms;
  }

  /** §7's answer to losing Air: 1.02× for 100 ms, and never a shake. */
  punch(pct: number, ms: number): void {
    if (reducedMotion()) return;
    this.punchPct = pct;
    this.punchMs = ms;
    this.punchTotal = ms;
  }

  /** Amplitude of the bounce shake right now, in design px. */
  private currentShake(): number {
    return this.shakeTotal > 0 ? this.shakePx * (this.shakeMs / this.shakeTotal) : 0;
  }

  shakeOffset(): { x: number; y: number; amplitude: number } {
    const a = this.currentShake();
    return { x: Math.sin(this.shakeClock * 0.083) * a, y: Math.sin(this.shakeClock * 0.117 + 1.3) * a, amplitude: a };
  }

  update(dtMs: number, slingPower: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    const calm = this.settings.noShake || reducedMotion();
    if (calm) {
      this.x = this.y = this.vx = this.vy = 0;
      this.shakeMs = 0;
      this.shakeTotal = 0;
    } else {
      const k = SPRING_W * SPRING_W;
      const c = 2 * SPRING_DAMP * SPRING_W;
      // In small fixed steps: at a slow phone's frame time one big step would make the spring ring forever.
      const steps = Math.max(1, Math.ceil(dt / SPRING_STEP_S));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.vx += (-k * this.x - c * this.vx) * h;
        this.vy += (-k * this.y - c * this.vy) * h;
        this.x = Math.max(-MAX_OFFSET_PX, Math.min(MAX_OFFSET_PX, this.x + this.vx * h));
        this.y = Math.max(-MAX_OFFSET_PX, Math.min(MAX_OFFSET_PX, this.y + this.vy * h));
      }
    }
    this.shakeClock += dtMs;
    this.shakeMs = Math.max(0, this.shakeMs - dtMs);
    if (this.shakeMs === 0) this.shakeTotal = 0;
    this.punchMs = Math.max(0, this.punchMs - dtMs);

    if (reducedMotion()) {
      this.charge = 0;
      this.zoom = 1;
      return;
    }
    // Squared: the view only starts to open when the pull is already long, which is when it means something.
    const target = Math.min(1, Math.max(0, slingPower)) ** 2;
    this.charge += (target - this.charge) * Math.min(1, dt * CHARGE_RATE);
    const punch = this.punchTotal > 0 ? this.punchPct * Math.sin((this.punchMs / this.punchTotal) * Math.PI) : 0;
    this.zoom = (1 + CHARGE_ZOOM_OUT * this.charge) / (1 + punch);
  }

  reset(): void {
    this.x = this.y = this.vx = this.vy = 0;
    this.shakeMs = this.shakeTotal = this.punchMs = this.punchTotal = this.charge = 0;
    this.zoom = 1;
  }
}
