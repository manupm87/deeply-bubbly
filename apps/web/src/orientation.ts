/**
 * "Gira el móvil" overlay (SHELL.md "Escalado"): the web platform cannot lock the orientation, so a
 * landscape phone gets a DOM curtain over the canvas instead. Plain DOM on purpose — it must show up
 * even if Phaser is still booting, and it must not steal a frame from the game loop.
 *
 * Desktop is never covered: a wide window there is the normal case.
 */

/** A landscape phone: clearly wider than tall, and driven by a finger rather than a mouse. */
const LANDSCAPE_RATIO = 1.2;

function isTouchDevice(): boolean {
  try {
    return globalThis.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in globalThis;
  } catch {
    return false;
  }
}

/** The one predicate behind the curtain, so "is it up?" can never disagree with "put it up". */
export function landscapeCurtainWanted(): boolean {
  return globalThis.innerWidth > globalThis.innerHeight * LANDSCAPE_RATIO && isTouchDevice();
}

function buildOverlay(label: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = 'rotate';
  div.textContent = label;
  div.setAttribute('role', 'alert');
  div.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:40',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'text-align:center',
    'background:#06131f',
    'color:#8ecae6',
    'font:600 20px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
  ].join(';');
  return div;
}

/**
 * Mounts the overlay and keeps it in sync with the viewport. Returns a detach function.
 * The label is passed in so the string table stays the single source of on-screen words.
 *
 * `onChange` is called whenever the curtain opens or closes, so the caller can pause the simulation:
 * a curtain that hides a running game is worse than no curtain — the player loses pips blind.
 */
export function attachOrientationOverlay(
  label = 'Gira el móvil',
  onChange: (covered: boolean) => void = () => undefined,
): () => void {
  const overlay = buildOverlay(label);
  document.body.appendChild(overlay);
  let covered = false;

  const apply = (): void => {
    const next = landscapeCurtainWanted();
    overlay.style.display = next ? 'flex' : 'none';
    if (next === covered) return;
    covered = next;
    onChange(next);
  };

  globalThis.addEventListener('resize', apply);
  globalThis.addEventListener('orientationchange', apply);
  apply();

  return () => {
    globalThis.removeEventListener('resize', apply);
    globalThis.removeEventListener('orientationchange', apply);
    overlay.remove();
  };
}
