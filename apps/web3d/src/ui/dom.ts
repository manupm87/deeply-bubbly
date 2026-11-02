/**
 * DOM helpers and the one Button of the shell. The UI layer (`#ui`) is scaled by the design zoom, so a
 * px in this tree IS a design px; only `getBoundingClientRect` and touch events speak css px.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** css px a contact may travel and still count as a tap. */
const TAP_SLOP_CSS = 12;

export interface ButtonOptions {
  id?: string;
  label?: string;
  tone: 'primary' | 'ghost' | 'disabled';
  className?: string;
  parent: HTMLElement;
  onTap?: () => void;
}

/**
 * Fires on the release of a press that began on it, so a pull that ends over a button cannot trigger
 * it, and neither can a scroll on the world map. Works from a keyboard too (`click` with detail 0).
 */
export class Button {
  readonly root: HTMLButtonElement;
  private pressId: number | null = null;
  private startX = 0;
  private startY = 0;

  constructor(private readonly o: ButtonOptions) {
    const root = el('button', `btn btn-${o.tone} ${o.className ?? ''}`, o.parent, o.label);
    root.type = 'button';
    if (o.tone === 'disabled') root.disabled = true;
    if (o.id !== undefined) root.dataset['dbId'] = o.id;
    this.root = root;
    root.addEventListener('pointerdown', (e) => {
      this.pressId = e.pointerId;
      this.startX = e.clientX;
      this.startY = e.clientY;
      root.classList.add('pressed');
      // A touch is captured by the browser; a mouse is not. Without this, a mouse dragged off the button
      // releases elsewhere, the press stays armed, and a later pull released here would fire the button.
      if (e.isTrusted) root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointerup', (e) => {
      if (this.pressId !== e.pointerId) return;
      this.clear();
      const r = root.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) <= TAP_SLOP_CSS) this.tap();
    });
    root.addEventListener('pointercancel', () => this.clear());
    root.addEventListener('lostpointercapture', () => this.clear());
    root.addEventListener('click', (e) => {
      if (e.detail === 0) this.tap();
    });
  }

  private clear(): void {
    this.pressId = null;
    this.root.classList.remove('pressed');
  }

  private tap(): void {
    if (this.o.tone !== 'disabled') this.o.onTap?.();
  }

  setLabel(label: string): void {
    this.root.textContent = label;
  }

  setVisible(value: boolean): void {
    this.root.hidden = !value;
  }
}

/** A full-column dimmed screen, faded in by CSS. Its dim swallows the touch: nothing reaches the canvas. */
export class Overlay {
  readonly root: HTMLDivElement;
  private shown = false;

  constructor(parent: HTMLElement, className: string) {
    this.root = el('div', `overlay ${className}`, parent);
    this.root.hidden = true;
  }

  get visible(): boolean {
    return this.shown;
  }

  show(): void {
    this.shown = true;
    this.root.hidden = false;
  }

  hide(): void {
    this.shown = false;
    this.root.hidden = true;
  }
}
