/**
 * The sound switch, in one place. It is offered twice — inside the pause menu (GDD §8) and on the
 * world map, which is the main menu now (WORLD-MAP.md §2) — and both are the SAME switch: label,
 * mirror into the save, persist, and tell the audio layer through 'settingsChanged'.
 *
 * Written once because the second copy is where the drift starts: the map's toggle used to be able to
 * flip `ctx.settings` without writing the save, so the choice survived until the next reload only.
 */
import type { GameContext } from '../context';
import { strings } from './strings';

/** "Sonido ✓" / "Sonido ✕" — one word plus a tick, like every switch of §8. */
export function soundLabel(ctx: GameContext): string {
  return `${strings().sound} ${ctx.settings.sound ? '✓' : '✕'}`;
}

/** Flips it and returns the new label, so the caller only has to redraw its own plate. */
export function toggleSound(ctx: GameContext): string {
  ctx.settings.sound = !ctx.settings.sound;
  ctx.save.settings.sound = ctx.settings.sound;
  ctx.persistSettings();
  ctx.bus.emit('settingsChanged');
  return soundLabel(ctx);
}
