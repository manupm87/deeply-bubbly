/**
 * Debug-only surface: the same `?debug=1` gate as `apps/web`, so a plain production load exposes nothing.
 * Controls are plain DOM here, so "where is this button" is read from the element that IS the button:
 * anything tagged `data-db-id` is reported, and a test presses the real thing with a real touch.
 */
export interface DebugButtonRect {
  id: string;
  label: string;
  /** World-map nodes report the state core computed ('locked', 'available', 'completed', 'noContent'). */
  state?: string;
  /** Centre and size in CSS px of the page. */
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

let enabled: boolean | null = null;

export function debugEnabled(): boolean {
  if (enabled === null) {
    let flagged = false;
    try {
      flagged = new URLSearchParams(globalThis.location.search).has('debug');
    } catch {
      flagged = false;
    }
    enabled = import.meta.env.DEV || flagged;
  }
  return enabled;
}

export function debugButtons(): DebugButtonRect[] {
  const out: DebugButtonRect[] = [];
  document.querySelectorAll<HTMLElement>('[data-db-id]').forEach((el) => {
    const r = el.getBoundingClientRect();
    const state = el.dataset['dbState'];
    out.push({
      id: el.dataset['dbId'] ?? '',
      label: el.dataset['dbLabel'] ?? el.textContent ?? '',
      ...(state === undefined ? {} : { state }),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      w: r.width,
      h: r.height,
      visible: el.checkVisibility() && r.width > 0 && r.height > 0,
    });
  });
  return out;
}
