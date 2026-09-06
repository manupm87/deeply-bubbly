/**
 * Colour palette (GDD §8 + research 02). UI colours are RESERVED: they never appear in the world.
 * Numbers are 0xRRGGBB for Phaser; CSS strings are derived with `css()`.
 */
export const UI = {
  white: 0xffffff,
  amber: 0xffb703,
  cyan: 0x8ecae6,
  softRed: 0xe76f6f,
  dim: 0x5b6b7a,
  panel: 0x0b1f33,
} as const;

export const ZONE_PALETTES = [
  { name: 'Superficie', waterTop: 0x3fc1c9, waterBottom: 0x1f7a8c, accent: 0xf9d56e, rock: 0x4a5568, rockLight: 0x6b7a8f, coral: 0xf26b4f, kelp: 0x5fae5a, foam: 0xe8f6f3, jelly: 0xf7a8d8 },
  { name: 'Arrecife', waterTop: 0x1f7a8c, waterBottom: 0x14506b, accent: 0xf26b4f, rock: 0x3d4a5c, rockLight: 0x5a6b80, coral: 0xff8c5a, kelp: 0x4a9a52, foam: 0xd8ecec, jelly: 0xe89ad0 },
  { name: 'Crepuscular', waterTop: 0x14506b, waterBottom: 0x0b2a4a, accent: 0x4fe3d6, rock: 0x2f3a4c, rockLight: 0x475568, coral: 0xb05a7a, kelp: 0x3a7a5a, foam: 0xb8d8e0, jelly: 0xb48ad8 },
  { name: 'Medianoche', waterTop: 0x0b2a4a, waterBottom: 0x05121f, accent: 0x7ff0ff, rock: 0x232a38, rockLight: 0x3a4454, coral: 0x7a4a6a, kelp: 0x2a5a4a, foam: 0x90b0c0, jelly: 0x9a7ad0 },
  { name: 'Abisal', waterTop: 0x05121f, waterBottom: 0x030a12, accent: 0xff9a3c, rock: 0x1c2230, rockLight: 0x2e3746, coral: 0x5a3a4a, kelp: 0x1e4a3a, foam: 0x7090a0, jelly: 0x8a6ac0 },
  { name: 'Fosa hadal', waterTop: 0x030a12, waterBottom: 0x000000, accent: 0xffd700, rock: 0x141a24, rockLight: 0x242c3a, coral: 0x3a2a3a, kelp: 0x143a2a, foam: 0x506878, jelly: 0x7a5ab0 },
] as const;

export type ZonePalette = (typeof ZONE_PALETTES)[number];

export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
