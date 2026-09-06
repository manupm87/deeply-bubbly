/**
 * Synthesised SFX (GDD §7). No audio files: every sound is built from oscillators and noise.
 * The AudioContext is created on the first `pointerdown` (iOS requirement) — total silence before it.
 *
 * The charge "glub" is the only continuous voice: it starts on `chargeStart`, follows
 * `hud.chargePower` every frame (the ear knows how much charge you have without looking) and stops on
 * `launch` — or as soon as the bubble leaves CHARGING, so an auto-release can never leave it droning.
 */
import type { Ceiling, GameEvent, Wall, ZoneIndex } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { blip, brownNoise, chord, createSynth, noiseBurst, whiteNoise } from './synth';
import type { Synth } from './synth';

type Material = Ceiling['material'] | Wall['material'];
type BounceVoice = 'hard' | 'soft' | 'bouncy';

/** Three bounce variants, one per material family (GDD §7: "3 muestras por material"). */
const VOICE_OF: Readonly<Record<Material, BounceVoice>> = {
  rock: 'hard',
  reef: 'hard',
  hadal: 'hard',
  shell: 'hard',
  coral: 'bouncy',
  jelly: 'bouncy',
  kelp: 'soft',
  foam: 'soft',
  snow: 'soft',
  creature: 'soft',
};

const BOUNCE_TONE: Readonly<Record<BounceVoice, { cutoff: number; freq: number; dur: number; gain: number }>> = {
  hard: { cutoff: 1800, freq: 320, dur: 0.11, gain: 0.16 },
  bouncy: { cutoff: 900, freq: 220, dur: 0.18, gain: 0.14 },
  soft: { cutoff: 500, freq: 160, dur: 0.14, gain: 0.1 },
};

/** Low-pass of the zone ambience: "the depth can be heard" (12 kHz at Z1 → 800 Hz at Z6). */
const AMBIENCE_CUTOFF: readonly number[] = [12000, 6000, 3200, 1800, 1200, 800];

/** A minor pentatonic, in semitones from A3; the pickup note climbs with the bounce chain. */
const PENTATONIC = [0, 3, 5, 7, 10];
const PENTATONIC_ROOT = 220;

const MASTER_GAIN = 0.8;
const GLUB_GAIN = 0.07;
const AMBIENCE_GAIN = 0.035;

/** ±8 % random detune on impacts (GDD §7); Math.random is fine here, this is presentation only. */
const jitter = (): number => 0.92 + Math.random() * 0.16;

function pentatonic(step: number): number {
  const i = Math.max(0, Math.trunc(step));
  const semi = (PENTATONIC[i % PENTATONIC.length] ?? 0) + 12 * Math.floor(i / PENTATONIC.length);
  return PENTATONIC_ROOT * Math.pow(2, Math.min(semi, 36) / 12);
}

export class AudioFx {
  private readonly ctx: GameContext;
  private synth: Synth | null = null;
  private noise: AudioBuffer | null = null;
  private ambience: BiquadFilterNode | null = null;
  private glub: { osc: OscillatorNode; gain: GainNode } | null = null;
  private zone: ZoneIndex = 0;
  private unlockHandler: (() => void) | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /** Installs the one-shot document listener that boots the AudioContext on the first touch. */
  unlock(): void {
    if (this.unlockHandler || this.synth) return;
    const handler = (): void => {
      this.unlockHandler = null;
      this.start();
    };
    this.unlockHandler = handler;
    document.addEventListener('pointerdown', handler, { once: true, passive: true });
  }

  onEvent(e: GameEvent): void {
    const s = this.synth;
    if (!s) return;
    switch (e.type) {
      case 'chargeStart':
        this.startGlub(s);
        break;
      case 'launch':
        this.stopGlub();
        // Pitch is inverse to power: a full charge pops deep, a tap pops high.
        blip(s, { type: 'sine', freq: 760 - e.power * 430, freqEnd: 180, dur: 0.09, gain: 0.18, attack: 0.05 });
        break;
      case 'bounce':
        this.bounce(s, e.material, e.speed);
        break;
      case 'pickup':
        blip(s, { type: 'triangle', freq: pentatonic(this.ctx.snapshot?.bubble.bounceChain ?? 0), dur: 0.22, gain: 0.12 });
        break;
      case 'airLost':
        blip(s, { type: 'square', freq: 900, freqEnd: 420, dur: 0.05, gain: 0.09, attack: 0.05 });
        break;
      case 'resacaWarning':
        // §2.4.2 "silbido": two rising whistles, unmistakable and unlike any other voice in the game.
        blip(s, { type: 'sine', freq: 900, freqEnd: 1500, dur: 0.16, gain: 0.1, attack: 0.2 });
        blip(s, { type: 'sine', freq: 900, freqEnd: 1700, dur: 0.2, gain: 0.1, attack: 0.2, delay: 0.22 });
        break;
      case 'shieldUsed':
        // §2.5: a bright, short "tink" — the hit landed and cost nothing.
        blip(s, { type: 'triangle', freq: 1200, freqEnd: 700, dur: 0.12, gain: 0.11, attack: 0.05 });
        break;
      case 'boya':
        blip(s, { type: 'sine', freq: 190, freqEnd: 130, dur: 0.55, gain: 0.16, attack: 0.3 });
        break;
      case 'stationEnter':
        chord(s, [261.63, 329.63, 392.0], 1.3, 0.07);
        break;
      case 'deflate':
        this.stopGlub();
        blip(s, { type: 'sine', freq: 520, freqEnd: 90, dur: 0.7, gain: 0.14, attack: 0.2 });
        if (this.noise) noiseBurst(s, { buffer: this.noise, dur: 0.5, gain: 0.06, cutoff: 700, q: 0.7 });
        break;
      case 'zoneChange':
        this.setZone(e.to);
        break;
      default:
        break;
    }
  }

  /** Per rendered frame: mute switch, live charge pitch and the safety stop for the glub. */
  update(): void {
    const s = this.synth;
    if (!s) return;
    const target = this.ctx.settings.sound ? MASTER_GAIN : 0;
    if (Math.abs(s.out.gain.value - target) > 0.001) {
      s.out.gain.setTargetAtTime(target, s.ctx.currentTime, 0.05);
    }
    const snap = this.ctx.snapshot;
    if (!snap) return;
    if (snap.bubble.state !== 'CHARGING') {
      this.stopGlub();
      return;
    }
    if (this.glub) {
      const freq = 200 + snap.hud.chargePower * 400;
      this.glub.osc.frequency.setTargetAtTime(freq, s.ctx.currentTime, 0.02);
    }
  }

  /** Deepens the ambience filter; also called from the `zoneChange` event. */
  setZone(zone: ZoneIndex): void {
    this.zone = zone;
    const s = this.synth;
    if (!s || !this.ambience) return;
    const cutoff = AMBIENCE_CUTOFF[zone] ?? AMBIENCE_CUTOFF[0] ?? 12000;
    this.ambience.frequency.setTargetAtTime(cutoff, s.ctx.currentTime, 0.6);
  }

  destroy(): void {
    if (this.unlockHandler) document.removeEventListener('pointerdown', this.unlockHandler);
    this.unlockHandler = null;
    this.stopGlub();
    const s = this.synth;
    this.synth = null;
    this.ambience = null;
    this.noise = null;
    if (!s) return;
    s.out.disconnect();
    void s.ctx.close().catch(() => undefined);
  }

  private start(): void {
    const s = createSynth();
    if (!s) return;
    this.synth = s;
    void s.ctx.resume().catch(() => undefined);
    this.noise = whiteNoise(s.ctx, 1);
    this.startAmbience(s);
    this.setZone(this.zone);
    s.out.gain.setTargetAtTime(this.ctx.settings.sound ? MASTER_GAIN : 0, s.ctx.currentTime, 0.2);
  }

  /** Looping brown noise through a low-pass: the sea, very quiet, filtered by zone. */
  private startAmbience(s: Synth): void {
    const src = s.ctx.createBufferSource();
    src.buffer = brownNoise(s.ctx, 3);
    src.loop = true;
    const filter = s.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = AMBIENCE_CUTOFF[0] ?? 12000;
    const gain = s.ctx.createGain();
    gain.gain.value = AMBIENCE_GAIN;
    src.connect(filter).connect(gain).connect(s.out);
    src.start();
    this.ambience = filter;
  }

  private bounce(s: Synth, material: Material, speed: number): void {
    const tone = BOUNCE_TONE[VOICE_OF[material] ?? 'hard'];
    // Faster impacts read brighter: the pitch rides the speed and then gets the ±8 % jitter.
    const speedMul = (0.85 + Math.min(1.4, speed / 400) * 0.5) * jitter();
    if (this.noise) {
      noiseBurst(s, { buffer: this.noise, dur: tone.dur * 0.6, gain: tone.gain * 0.7, cutoff: tone.cutoff * speedMul });
    }
    blip(s, { type: 'triangle', freq: tone.freq * speedMul, freqEnd: tone.freq * speedMul * 0.7, dur: tone.dur, gain: tone.gain, attack: 0.05 });
  }

  private startGlub(s: Synth): void {
    if (this.glub) return;
    const osc = s.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, s.ctx.currentTime);
    const gain = s.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, s.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(GLUB_GAIN, s.ctx.currentTime + 0.05);
    osc.connect(gain).connect(s.out);
    osc.start();
    this.glub = { osc, gain };
  }

  private stopGlub(): void {
    const s = this.synth;
    const glub = this.glub;
    if (!glub || !s) return;
    this.glub = null;
    const t = s.ctx.currentTime;
    glub.gain.gain.cancelScheduledValues(t);
    glub.gain.gain.setValueAtTime(Math.max(0.0001, glub.gain.gain.value), t);
    glub.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    glub.osc.stop(t + 0.08);
    glub.osc.onended = () => {
      glub.osc.disconnect();
      glub.gain.disconnect();
    };
  }
}
