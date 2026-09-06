/**
 * Ledge / wall pixel art, one real tile per material (SHELL.md "Repisas").
 *
 * THE ONE RULE OF THIS FILE: the bottom face of a CAPTURABLE ceiling is the brightest 1 px line on
 * screen — a light tint of the zone accent, never pure white (reserved for UI) — because that line is
 * the whole grammar of the game: "bright line = I can rest here". Anything Bur cannot hang from (a
 * wall, a jellyfish) gets a deliberately dull underside instead, so the two never blur together.
 */
import { mixColor, mulberry32, pxDither, type G } from './pixels';
import type { ZonePalette } from '../palette';

export type SolidMaterial =
  | 'rock' | 'coral' | 'kelp' | 'jelly' | 'snow' | 'shell' | 'foam' | 'creature' | 'reef' | 'hadal';

const DARK = 0x101820;

/** Body colour pair (fill, lit) per material. */
function tones(m: SolidMaterial, p: ZonePalette): [number, number] {
  switch (m) {
    case 'coral':
    case 'reef':
      return [p.coral, mixColor(p.coral, p.foam, 0.35)];
    case 'kelp':
      return [p.kelp, mixColor(p.kelp, p.foam, 0.3)];
    case 'jelly':
      return [p.jelly, mixColor(p.jelly, p.foam, 0.45)];
    case 'snow':
    case 'shell':
    case 'foam':
      return [mixColor(p.foam, p.waterTop, 0.25), p.foam];
    case 'creature':
      return [mixColor(p.rock, p.coral, 0.4), mixColor(p.rock, p.accent, 0.45)];
    default:
      return [p.rock, p.rockLight];
  }
}

/** The capture cue. Jelly is never bright: it is a trampoline, not a perch. */
export function glowTone(m: SolidMaterial, capturable: boolean, p: ZonePalette): [number, number] {
  if (capturable && m !== 'jelly') return [mixColor(p.accent, p.foam, 0.45), 1];
  if (m === 'jelly') return [mixColor(p.jelly, p.waterBottom, 0.45), 0.45];
  return [mixColor(p.rockLight, p.waterBottom, 0.3), 0.4];
}

/** 1 px lit face plus a two-row bloom under it, drawn into its own Graphics so it can pulse alone. */
export function drawGlowLine(g: G, w: number, h: number, m: SolidMaterial, capturable: boolean, p: ZonePalette): void {
  const [tone, alpha] = glowTone(m, capturable, p);
  g.clear();
  const bright = capturable && m !== 'jelly';
  if (bright) {
    g.fillStyle(tone, 0.2);
    g.fillRect(0, h, w, 1);
    g.fillStyle(tone, 0.09);
    g.fillRect(1, h + 1, w - 2, 1);
  }
  g.fillStyle(tone, alpha);
  g.fillRect(0, h - 1, w, 1);
}

/** Shared skeleton: dark 1 px outline, dithered body, 1 px top highlight. */
function slab(g: G, w: number, h: number, fill: number, lit: number, p: ZonePalette): void {
  g.fillStyle(mixColor(fill, DARK, 0.42), 1);
  g.fillRect(0, 0, w, h);
  if (w > 2 && h > 2) pxDither(g, 1, 1, w - 2, h - 2, fill, lit, 1);
  g.fillStyle(mixColor(lit, p.foam, 0.55), 1);
  g.fillRect(1, 1, Math.max(0, w - 2), 1);
}

function speckle(g: G, w: number, h: number, colour: number, count: number, seed: number, alpha = 1): void {
  const rand = mulberry32(seed);
  g.fillStyle(colour, alpha);
  for (let i = 0; i < count; i++) {
    const x = 1 + Math.floor(rand() * Math.max(1, w - 2));
    const y = 2 + Math.floor(rand() * Math.max(1, h - 3));
    g.fillRect(x, y, 1, 1);
  }
}

/** Small branching polyps sprouting from the top edge of a coral shelf. */
function polyps(g: G, w: number, p: ZonePalette): void {
  const rand = mulberry32(w * 17 + 3);
  const tip = mixColor(p.coral, p.foam, 0.5);
  for (let x = 2; x < w - 2; x += 4 + Math.floor(rand() * 3)) {
    const tall = 1 + Math.round(rand() * 2);
    g.fillStyle(p.coral, 1);
    g.fillRect(x, -tall, 1, tall);
    if (tall > 1) g.fillRect(x + 1, -tall + 1, 1, 1); // the branch
    g.fillStyle(tip, 0.9);
    g.fillRect(x, -tall, 1, 1);
  }
}

/** 3–4 translucent fronds hanging below a kelp shelf: decoration, never a surface. */
function fronds(g: G, w: number, h: number, p: ZonePalette): void {
  const count = Math.max(3, Math.min(4, Math.round(w / 14)));
  const rand = mulberry32(w * 31 + h);
  const body = mixColor(p.kelp, p.waterBottom, 0.35);
  const tip = mixColor(p.kelp, p.foam, 0.35);
  for (let i = 0; i < count; i++) {
    const x = Math.round(((i + 0.5) / count) * w);
    const len = 7 + Math.floor(rand() * 4);
    const phase = rand() * Math.PI;
    for (let j = 0; j < len; j++) {
      const dx = Math.round(Math.sin(phase + j * 0.42) * 1.8);
      g.fillStyle(body, 0.85 - (j / len) * 0.45);
      g.fillRect(x + dx, h + j, 1, 1);
      if (j % 3 === 1) {
        g.fillStyle(tip, 0.5);
        g.fillRect(x + dx + (j % 2 === 0 ? 1 : -1), h + j, 1, 1);
      }
    }
  }
}

/**
 * Pale, bubbly surface foam.
 *
 * ART DIRECTION: a uniform-random spray of 1 px dots is not foam, it is TV static — it has no
 * silhouette, no rhythm and no light direction. Foam is CLUSTERED: overlapping round bubbles of two
 * sizes, each lit on its upper-left, frothing over the top edge so the crest is bumpy rather than
 * ruled. This is the widest ledge of Zone 1 and the first one the player ever sees.
 */
function foamBody(g: G, w: number, h: number, p: ZonePalette): void {
  const rand = mulberry32(w * 7 + h * 13);
  const wet = mixColor(p.foam, p.waterTop, 0.62); // three clear values: wet slab, bubble, lit top
  const skin = mixColor(p.foam, p.waterTop, 0.3);

  /** One bubble: a round cell with a lit arc on its upper-left, so the whole raft has one light. */
  const bubble = (cx: number, cy: number, r: number, alpha: number): void => {
    const edge = (r + 0.5) * (r + 0.5); // same convention as pxDisc: a 1 px bubble is a blob, not a +
    g.fillStyle(skin, alpha);
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, edge - dy * dy)));
      g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    }
    g.fillStyle(p.foam, 1);
    g.fillRect(cx - r, cy - r + 1, Math.max(1, r), 1);
  };

  g.fillStyle(wet, 0.66);
  g.fillRect(0, 1, w, Math.max(1, h - 1));
  // Clusters of 2–4 overlapping bubbles: foam bunches, it never scatters evenly.
  const clusters = Math.max(2, Math.round(w / 7));
  for (let i = 0; i < clusters; i++) {
    const cx = Math.round(rand() * w);
    const cy = 1 + Math.round(rand() * Math.max(0, h - 2));
    const n = 2 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const r = rand() < 0.4 ? 2 : 1;
      const a = 0.55 + rand() * 0.3;
      const by = cy + Math.round((rand() - 0.5) * 3);
      // Never below the rest line: a bubble hanging under it breaks the one cue that matters.
      bubble(cx + Math.round((rand() - 0.5) * 5), Math.min(by, h - 1 - r), r, a);
    }
  }
  // The crest is a chain of full-size domes that scallop the top edge and froth a pixel ABOVE the
  // rect. That wavy silhouette, not the speckle inside, is what makes a foam raft read as foam.
  for (let x = 1; x < w + 2; x += 3 + Math.round(rand() * 2)) bubble(x, 1 + (rand() < 0.4 ? 1 : 0), 2, 0.85);
}

/**
 * Translucent dome + 5–6 tentacles. Its silhouette must never be mistaken for a slab — and neither
 * must its COLOUR: jelly is #f7a8d8 precisely so it is unmistakable (GDD §8), so the fill is opaque
 * enough that the pink survives both the water behind it and the pulse `solidView` multiplies on top.
 */
function jellyBody(g: G, w: number, h: number, fill: number, lit: number, p: ZonePalette): void {
  const cap = Math.max(2, Math.min(5, h - 3));
  for (let x = 0; x < w; x++) {
    const top = Math.round(cap * (1 - Math.sin((Math.PI * (x + 0.5)) / w)));
    g.fillStyle(fill, 0.72);
    g.fillRect(x, top, 1, h - top);
    g.fillStyle(lit, 0.95);
    g.fillRect(x, top, 1, 1);
  }
  g.fillStyle(p.foam, 0.5);
  for (let x = 3; x < w - 3; x += 7) g.fillRect(x, 2, 1, 1); // gonads, the classic jelly speckle
  const count = Math.max(5, Math.min(6, Math.round(w / 12)));
  for (let i = 0; i < count; i++) {
    const x = Math.round(((i + 0.5) / count) * w);
    const len = 5 + ((i * 3) % 5);
    for (let j = 0; j < len; j++) {
      g.fillStyle(fill, 0.78 - (j / len) * 0.45);
      g.fillRect(x + Math.round(Math.sin(i + j * 0.5) * 1.4), h + j, 1, 1);
    }
  }
}

/**
 * Turtle (`creature`): a DOMED carapace with big scutes, a head at the right and two flippers.
 *
 * ART DIRECTION: the previous version laid a seam every 6 px across a flat slab and capped each cell
 * with a bright strip — a brick wall, or a shelf of jars. A turtle is read from its silhouette first,
 * so the top corners are carved into a dome, the shell carries at most five plates (never a grid), a
 * single highlight arc follows the curve, and the head is attached and has an eye.
 */
function shellBody(g: G, w: number, h: number, fill: number, lit: number, p: ZonePalette): void {
  const edge = mixColor(fill, DARK, 0.55);
  const dome = Math.max(1, Math.min(4, h - 3));
  /** Height carved off the top at column x: flat in the middle, rounding away at both ends. */
  const topAt = (x: number): number => {
    const d = Math.min(x, w - 1 - x);
    const k = Math.min(1, (d + 0.5) / Math.max(1, dome * 2));
    return dome - Math.round(dome * Math.sin((k * Math.PI) / 2));
  };

  for (let x = 0; x < w; x++) {
    g.fillStyle(edge, 1);
    g.fillRect(x, topAt(x), 1, h - topAt(x)); // 1 px contour + the body it encloses
  }
  const mid = mixColor(fill, lit, 0.5);
  for (let x = 1; x < w - 1; x++) {
    for (let y = topAt(x) + 1; y < h - 1; y++) {
      g.fillStyle((x + y) % 2 === 0 ? fill : mid, 1);
      g.fillRect(x, y, 1, 1);
    }
  }
  const marginY = Math.max(2, h - 3);
  g.fillStyle(edge, 0.6);
  g.fillRect(1, marginY, w - 2, 1); // the marginal scutes along the rim
  const plates = Math.max(3, Math.min(5, Math.round(w / 14)));
  for (let i = 1; i < plates; i++) {
    const x = Math.round((i / plates) * w);
    g.fillRect(x, topAt(x) + 1, 1, Math.max(1, marginY - topAt(x) - 1));
  }
  // ONE highlight arc following the dome, fading to the right: a curved shell, not a row of caps.
  for (let x = 1; x < w - 1; x++) {
    g.fillStyle(mixColor(lit, p.foam, 0.3), 0.8 - (x / w) * 0.55);
    g.fillRect(x, topAt(x) + 1, 1, 1);
  }

  const skin = mixColor(fill, p.foam, 0.32);
  const hy = Math.max(0, h - 5);
  g.fillStyle(edge, 1); // head: a neck out of the shell, tapering to a snout
  g.fillRect(w - 1, hy, 5, 5);
  g.fillStyle(skin, 1);
  g.fillRect(w - 1, hy + 1, 4, 3);
  g.fillRect(w, hy + 2, 4, 1);
  g.fillStyle(p.foam, 0.9);
  g.fillRect(w + 1, hy + 1, 1, 1);
  g.fillStyle(DARK, 1);
  g.fillRect(w + 1, hy + 2, 1, 1); // eye, sitting in its own pale socket
  g.fillStyle(mixColor(fill, DARK, 0.3), 1); // two paddling flippers, splayed outward
  g.fillRect(3, h, 4, 2);
  g.fillRect(2, h + 2, 3, 1);
  g.fillRect(w - 10, h, 4, 2);
  g.fillRect(w - 8, h + 2, 3, 1);
}

/** Draws a solid in LOCAL coordinates (0,0 .. w,h). The glow line is NOT drawn here. */
export function drawSolidBody(g: G, w: number, h: number, m: SolidMaterial, p: ZonePalette): void {
  const [fill, lit] = tones(m, p);
  g.clear();
  if (m === 'jelly') {
    jellyBody(g, w, h, fill, lit, p);
    return;
  }
  if (m === 'foam' || m === 'snow' || m === 'shell') {
    foamBody(g, w, h, p);
    return;
  }
  if (m === 'creature') {
    shellBody(g, w, h, fill, lit, p);
    return;
  }
  slab(g, w, h, fill, lit, p);
  if (m === 'coral' || m === 'reef') {
    speckle(g, w, h, mixColor(fill, DARK, 0.4), Math.round(w / 4), w * 5 + h, 0.8);
    polyps(g, w, p);
  } else if (m === 'kelp') {
    speckle(g, w, h, mixColor(lit, p.foam, 0.2), Math.round(w / 6), w * 3 + h, 0.7);
    fronds(g, w, h, p);
  } else {
    speckle(g, w, h, mixColor(fill, DARK, 0.45), Math.round(w / 5), w * 11 + h, 0.9);
    speckle(g, w, h, mixColor(lit, p.foam, 0.25), Math.round(w / 9), w * 13 + h, 0.6);
  }
}
