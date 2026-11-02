/**
 * Synthesised SFX (GDD §7). No audio files: every sound is built from oscillators and noise, and it should
 * sound like water: round sines whose pitch rises at the end (that is what a real bubble does), no square
 * waves, nothing bright. `synth.ts` puts them all in the same small room behind the same limiter.
 * The AudioContext is created on the first `pointerdown` (iOS requirement) — total silence before it.
 *
 * The sling "glub" is the only continuous voice: it starts on `aimStart`, follows `hud.power` every
 * frame (the ear knows how far the sling is drawn without looking) and stops on `launch` or
 * `aimCancel` — or as soon as the bubble leaves AIMING, so a cancelled aim can never leave it droning.
 */
import type { Ceiling, GameEvent, Pickup, Wall, ZoneIndex } from '@deeply-bubbly/core';
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

const BOUNCE_TONE: Readonly<Record<BounceVoice, { cutoff: number; freq: number; dur: number; gain: number; rise: number }>> = {
  hard: { cutoff: 1000, freq: 240, dur: 0.1, gain: 0.13, rise: 0.75 },
  bouncy: { cutoff: 700, freq: 200, dur: 0.17, gain: 0.13, rise: 1.5 },
  soft: { cutoff: 420, freq: 150, dur: 0.13, gain: 0.1, rise: 1.15 },
};

/** Low-pass of the zone ambience: "the depth can be heard" (12 kHz at Z1 → 800 Hz at Z6). */
const AMBIENCE_CUTOFF: readonly number[] = [12000, 6000, 3200, 1800, 1200, 800];

/** A minor pentatonic from A4; the pickup note climbs with the bounce chain and with a run of pickups. */
const PENTATONIC = [0, 3, 5, 7, 10];
const PENTATONIC_ROOT = 440;
const MAX_NOTE_SEMITONES = 24;
/** Pickups closer together than this are one phrase, and each one climbs a step. */
const PICKUP_PHRASE_S = 2.4;

/** D1: the mid-air launch is the same pop a fifth up, audibly a different shot. */
const AIR_LAUNCH_PITCH = 1.5;

const MASTER_GAIN = 0.85;
const GLUB_GAIN_LOW = 0.05;
const GLUB_GAIN_HIGH = 0.085;
const GLUB_OVERTONE = 0.22;
const GLUB_LOWPASS_HZ = 1100;
const GLUB_WOBBLE_LOW_HZ = 5;
const GLUB_WOBBLE_HIGH_HZ = 13;
const AMBIENCE_GAIN = 0.05;
const AMBIENCE_SWELL = 0.018;
const AMBIENCE_SWELL_HZ = 0.09;
/** Seconds between the far bubbles you can only just hear. */
const PLIP_GAP_MIN_S = 2.5;
const PLIP_GAP_MAX_S = 7;
const FULL_POWER = 0.995;
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/** ±8 % random detune on impacts (GDD §7); Math.random is fine here, this is presentation only. */
const jitter = (): number => 0.92 + Math.random() * 0.16;
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

function pentatonic(step: number): number {
  const i = Math.max(0, Math.trunc(step));
  const semi = (PENTATONIC[i % PENTATONIC.length] ?? 0) + 12 * Math.floor(i / PENTATONIC.length);
  return PENTATONIC_ROOT * Math.pow(2, Math.min(semi, MAX_NOTE_SEMITONES) / 12);
}

interface Glub {
  osc: OscillatorNode;
  overtone: OscillatorNode;
  wobble: OscillatorNode;
  wobbleDepth: GainNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  overtoneGain: GainNode;
}

/** Debug only: what the speakers actually got, for a browser test that cannot listen. */
export interface AudioMeter {
  state: string;
  peak: number;
  /** Where the sound's energy sits, in Hz, at its brightest sampled moment. */
  brightestHz: number;
  glubHz: number | null;
  frames: number;
}

export class AudioFx {
  private readonly ctx: GameContext;
  private synth: Synth | null = null;
  private noise: AudioBuffer | null = null;
  private ambience: BiquadFilterNode | null = null;
  private glub: Glub | null = null;
  private zone: ZoneIndex = 0;
  private unlockHandler: (() => void) | null = null;
  private active = true;
  /** The master level last asked for: a context that cannot run yet must not collect one request per frame. */
  private masterTarget = -1;
  private pickupStep = 0;
  private lastPickupAt = -10;
  private nextPlipAt = 0;
  private wasFull = false;
  private wasCancel = false;
  private pulledOnce = false;
  private analyser: AnalyserNode | null = null;
  private readonly meter: AudioMeter = { state: 'none', peak: 0, brightestHz: 0, glubHz: null, frames: 0 };
  private timeData: Float32Array<ArrayBuffer> | null = null;
  private freqData: Float32Array<ArrayBuffer> | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    document.addEventListener('visibilitychange', this.onVisibility);
    // Activation only exists on these: a touch's pointerdown is too early for iOS and for Chrome's policy.
    for (const type of GESTURES) document.addEventListener(type, this.onGesture, { passive: true });
  }

  /** A hidden tab draws no frame, so nothing else would stop the sea or a pull's glub while it is away. */
  private readonly onVisibility = (): void => {
    const s = this.synth;
    if (!s) return;
    if (document.hidden) {
      this.stopGlub();
      void s.ctx.suspend().catch(() => undefined);
    } else if (this.active) {
      void s.ctx.resume().catch(() => undefined);
    }
  };

  /** A context the system stopped (a call, iOS "interrupted") or refused to start only comes back on a gesture. */
  private readonly onGesture = (): void => {
    const s = this.synth;
    if (s && this.active && !document.hidden && s.ctx.state !== 'running') void s.ctx.resume().catch(() => undefined);
  };

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

  /** False while no run is on screen: the sea stops with it, and a new run brings it back. */
  setActive(active: boolean): void {
    this.active = active;
    const s = this.synth;
    if (!s) return;
    if (!active) this.stopGlub();
    void (active ? s.ctx.resume() : s.ctx.suspend()).catch(() => undefined);
  }

  /** Debug tools ask for this; until they do, nothing is measured and nothing is paid for. */
  startMeter(): void {
    const s = this.synth;
    if (!s || this.analyser) return;
    this.analyser = s.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.timeData = new Float32Array(this.analyser.fftSize);
    this.freqData = new Float32Array(this.analyser.frequencyBinCount);
    s.limiter.connect(this.analyser);
  }

  readMeter(): AudioMeter {
    this.meter.state = this.synth?.ctx.state ?? 'none';
    return { ...this.meter };
  }

  private sampleMeter(s: Synth): void {
    const { analyser, timeData, freqData } = this;
    this.meter.glubHz = this.glub ? this.glub.osc.frequency.value : null;
    if (!analyser || !timeData || !freqData) return;
    analyser.getFloatTimeDomainData(timeData);
    let peak = 0;
    for (const v of timeData) peak = Math.max(peak, Math.abs(v));
    this.meter.peak = Math.max(this.meter.peak, peak);
    this.meter.frames++;
    if (peak < 0.01) return;
    analyser.getFloatFrequencyData(freqData);
    let sum = 0;
    let weighted = 0;
    const binHz = s.ctx.sampleRate / analyser.fftSize;
    for (let i = 0; i < freqData.length; i++) {
      const power = Math.pow(10, (freqData[i] ?? -160) / 10);
      sum += power;
      weighted += power * i * binHz;
    }
    if (sum > 0) this.meter.brightestHz = Math.max(this.meter.brightestHz, weighted / sum);
  }

  onEvent(e: GameEvent): void {
    const s = this.synth;
    if (!s) return;
    switch (e.type) {
      case 'aimStart':
        this.startGlub(s);
        this.wasFull = false;
        this.wasCancel = false;
        break;
      case 'aimCancel':
        // D2: a gesture can end without a shot. The ear gets a soft "plop" with none of the launch's
        // snap: nothing happened, and that is exactly what it has to sound like.
        this.stopGlub();
        blip(s, { type: 'sine', freq: 300, freqEnd: 170, dur: 0.1, gain: 0.05, attack: 0.25 });
        break;
      case 'launch':
        this.stopGlub();
        this.launch(s, e.power, e.airLaunch);
        break;
      case 'bounce':
        this.bounce(s, e.material, e.speed);
        break;
      case 'rest':
        // Catching a ledge: one small round "bup" going up, the most frequent good news in the game.
        blip(s, { type: 'sine', freq: 170 * jitter(), freqEnd: 340, dur: 0.1, gain: 0.11, attack: 0.1 });
        break;
      case 'pickup':
        this.pickup(s, e.pickup.pickupType);
        break;
      case 'airLost':
        // Spending a pip on purpose is no blow (D1); the launch already said it.
        if (e.reason === 'airLaunch') break;
        // A blow, but a kind one: a soft falling note where a buzzer would be.
        blip(s, { type: 'sine', freq: 430, freqEnd: 170, dur: 0.22, gain: 0.13, attack: 0.08 });
        if (this.noise) noiseBurst(s, { buffer: this.noise, dur: 0.12, gain: 0.05, cutoff: 500, q: 0.8 });
        break;
      case 'resacaWarning':
        // §2.4.2 "silbido": two rising whistles, unmistakable and unlike any other voice in the game.
        blip(s, { type: 'sine', freq: 780, freqEnd: 1250, dur: 0.17, gain: 0.07, attack: 0.25 });
        blip(s, { type: 'sine', freq: 780, freqEnd: 1400, dur: 0.21, gain: 0.07, attack: 0.25, delay: 0.23 });
        break;
      case 'shieldUsed':
        // §2.5: a bright, short "tink" — the hit landed and cost nothing.
        blip(s, { type: 'sine', freq: 988, dur: 0.2, gain: 0.08, attack: 0.04 });
        blip(s, { type: 'sine', freq: 1480, dur: 0.14, gain: 0.04, attack: 0.04 });
        break;
      case 'boya':
        // "Plín" grave: a low bell with its fifth, and the room behind it.
        blip(s, { type: 'sine', freq: 196, freqEnd: 180, dur: 0.7, gain: 0.1, attack: 0.1 });
        blip(s, { type: 'sine', freq: 392, dur: 1.1, gain: 0.08, attack: 0.03, delay: 0.02 });
        blip(s, { type: 'sine', freq: 587.33, dur: 0.9, gain: 0.045, attack: 0.03, delay: 0.09 });
        break;
      case 'stationEnter':
        chord(s, [261.63, 329.63, 392.0, 523.25], 1.7, 0.06, 0.1);
        blip(s, { type: 'sine', freq: 1046.5, dur: 1.2, gain: 0.018, attack: 0.3, delay: 0.42 });
        break;
      case 'immersionComplete':
        // One rising note for each shell, in time with the row that appears on the screen.
        for (let i = 0; i < Math.min(3, e.shells); i++) {
          blip(s, { type: 'sine', freq: [659.25, 783.99, 1046.5][i] ?? 659.25, dur: 0.5, gain: 0.05, attack: 0.05, delay: 0.75 + i * 0.18 });
        }
        break;
      case 'deflate':
        this.stopGlub();
        // Air leaving: a slow flutter down, not a burst, and a last small "plip" at the very end.
        blip(s, { type: 'sine', freq: 500, freqEnd: 95, dur: 0.68, gain: 0.13, attack: 0.1, vibrato: { hz: 17, cents: 70 } });
        if (this.noise) noiseBurst(s, { buffer: this.noise, dur: 0.6, gain: 0.035, cutoff: 480, q: 0.6 });
        blip(s, { type: 'sine', freq: 520, freqEnd: 900, dur: 0.06, gain: 0.05, delay: 0.68 });
        break;
      case 'respawn':
        blip(s, { type: 'sine', freq: 300, freqEnd: 600, dur: 0.14, gain: 0.07, attack: 0.15 });
        blip(s, { type: 'sine', freq: 450, freqEnd: 900, dur: 0.16, gain: 0.055, attack: 0.15, delay: 0.1 });
        break;
      case 'zoneChange':
        this.setZone(e.to);
        break;
      default:
        break;
    }
  }

  /** Per rendered frame: mute switch, live charge pitch, the safety stop for the glub, far bubbles. */
  update(): void {
    const s = this.synth;
    if (!s) return;
    const target = this.ctx.settings.sound ? MASTER_GAIN : 0;
    if (target !== this.masterTarget) {
      this.masterTarget = target;
      s.out.gain.setTargetAtTime(target, s.ctx.currentTime, 0.05);
    }
    const snap = this.ctx.snapshot;
    this.sampleMeter(s);
    if (!snap) return;
    if (snap.phase === 'playing') this.plip(s);
    if (snap.bubble.state !== 'AIMING') {
      this.stopGlub();
      return;
    }
    if (this.glub) this.driveGlub(s, this.glub, snap.hud.power, snap.hud.cancelZone);
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
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const type of GESTURES) document.removeEventListener(type, this.onGesture);
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
    // The unlocking touch may land on the map; the context then waits there, unlocked and silent.
    void (this.active ? s.ctx.resume() : s.ctx.suspend()).catch(() => undefined);
    this.noise = whiteNoise(s.ctx, 1);
    this.startAmbience(s);
    this.setZone(this.zone);
    this.nextPlipAt = s.ctx.currentTime + rand(PLIP_GAP_MIN_S, PLIP_GAP_MAX_S);
    this.masterTarget = this.ctx.settings.sound ? MASTER_GAIN : 0;
    s.out.gain.setTargetAtTime(this.masterTarget, s.ctx.currentTime, 0.2);
  }

  /** Looping brown noise through a low-pass, swelling very slowly: the sea, filtered by zone. */
  private startAmbience(s: Synth): void {
    const src = s.ctx.createBufferSource();
    src.buffer = brownNoise(s.ctx, 4);
    src.loop = true;
    const filter = s.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = AMBIENCE_CUTOFF[0] ?? 12000;
    const gain = s.ctx.createGain();
    gain.gain.value = AMBIENCE_GAIN;
    const swell = s.ctx.createOscillator();
    swell.frequency.value = AMBIENCE_SWELL_HZ;
    const swellDepth = s.ctx.createGain();
    swellDepth.gain.value = AMBIENCE_SWELL;
    swell.connect(swellDepth).connect(gain.gain);
    swell.start();
    src.connect(filter).connect(gain).connect(s.out);
    src.start();
    this.ambience = filter;
  }

  /** A bubble somewhere far away. You should only notice them if they stop. */
  private plip(s: Synth): void {
    const now = s.ctx.currentTime;
    if (now < this.nextPlipAt) return;
    this.nextPlipAt = now + rand(PLIP_GAP_MIN_S, PLIP_GAP_MAX_S);
    const count = Math.random() < 0.3 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const freq = rand(420, 950);
      blip(s, { type: 'sine', freq, freqEnd: freq * 1.6, dur: 0.07, gain: rand(0.008, 0.02), delay: i * rand(0.07, 0.16), attack: 0.2 });
    }
  }

  /** Pitch is inverse to power: a full pull pops deep, a short one pops high (§7). */
  private launch(s: Synth, power: number, airLaunch: boolean): void {
    const pitch = (560 - power * 300) * (airLaunch ? AIR_LAUNCH_PITCH : 1);
    blip(s, { type: 'sine', freq: pitch * 0.62, freqEnd: pitch * 1.3, dur: 0.11, gain: 0.17, attack: 0.05 });
    if (this.noise) noiseBurst(s, { buffer: this.noise, dur: 0.14 + power * 0.1, gain: 0.02 + power * 0.03, cutoff: 420 + power * 380, q: 0.6 });
  }

  private pickup(s: Synth, type: Pickup['pickupType']): void {
    const now = s.ctx.currentTime;
    this.pickupStep = now - this.lastPickupAt < PICKUP_PHRASE_S ? this.pickupStep + 1 : 0;
    this.lastPickupAt = now;
    const step = (this.ctx.snapshot?.bubble.bounceChain ?? 0) + this.pickupStep;
    const freq = pentatonic(step);
    if (type === 'aire' || type === 'aireGrande') {
      // Air goes up, like the bubble it is.
      blip(s, { type: 'sine', freq: freq * 0.75, freqEnd: freq * 1.1, dur: 0.2, gain: 0.09, attack: 0.1 });
      return;
    }
    blip(s, { type: 'sine', freq, dur: 0.34, gain: 0.09, attack: 0.03 });
    blip(s, { type: 'sine', freq: freq * 2, dur: 0.18, gain: 0.018, attack: 0.03 });
    if (type === 'concha' || type === 'perlaGrande') {
      blip(s, { type: 'sine', freq: pentatonic(step + 2), dur: 0.34, gain: 0.08, attack: 0.03, delay: 0.09 });
      blip(s, { type: 'sine', freq: pentatonic(step + 4), dur: 0.5, gain: 0.07, attack: 0.03, delay: 0.18 });
    }
  }

  private bounce(s: Synth, material: Material, speed: number): void {
    const tone = BOUNCE_TONE[VOICE_OF[material] ?? 'hard'];
    // Faster impacts read brighter and fuller: the pitch rides the speed, then gets the ±8 % jitter.
    const hard = Math.min(1.4, speed / 400);
    const speedMul = (0.85 + hard * 0.42) * jitter();
    const level = 0.45 + 0.55 * Math.min(1, hard);
    if (this.noise) {
      noiseBurst(s, { buffer: this.noise, dur: tone.dur * 0.7, gain: tone.gain * 0.42 * level, cutoff: tone.cutoff * speedMul, q: 0.8 });
    }
    blip(s, { type: 'sine', freq: tone.freq * speedMul, freqEnd: tone.freq * speedMul * tone.rise, dur: tone.dur, gain: tone.gain * level, attack: 0.05 });
  }

  /** Two oscillators and a tremolo: a bubbling in the throat that rises, tightens and speeds up with the pull. */
  private startGlub(s: Synth): void {
    if (this.glub) return;
    const t = s.ctx.currentTime;
    const osc = s.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    const overtone = s.ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(400, t);
    const overtoneGain = s.ctx.createGain();
    overtoneGain.gain.value = GLUB_OVERTONE;
    const filter = s.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = GLUB_LOWPASS_HZ;
    const gain = s.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(GLUB_GAIN_LOW, t + 0.06);
    const wobble = s.ctx.createOscillator();
    wobble.frequency.value = GLUB_WOBBLE_LOW_HZ;
    const wobbleDepth = s.ctx.createGain();
    wobbleDepth.gain.value = GLUB_GAIN_LOW * 0.35;
    wobble.connect(wobbleDepth).connect(gain.gain);
    osc.connect(filter);
    overtone.connect(overtoneGain).connect(filter);
    filter.connect(gain).connect(s.voices);
    osc.start();
    overtone.start();
    wobble.start();
    this.glub = { osc, overtone, wobble, wobbleDepth, gain, filter, overtoneGain };
  }

  private driveGlub(s: Synth, glub: Glub, power: number, cancel: boolean): void {
    const t = s.ctx.currentTime;
    const p = Math.min(1, Math.max(0, power));
    const freq = 200 + p * 400;
    glub.osc.frequency.setTargetAtTime(freq, t, 0.02);
    glub.overtone.frequency.setTargetAtTime(freq * 2, t, 0.02);
    glub.wobble.frequency.setTargetAtTime(GLUB_WOBBLE_LOW_HZ + (GLUB_WOBBLE_HIGH_HZ - GLUB_WOBBLE_LOW_HZ) * p, t, 0.05);
    glub.gain.gain.setTargetAtTime(cancel ? GLUB_GAIN_LOW * 0.5 : GLUB_GAIN_LOW + (GLUB_GAIN_HIGH - GLUB_GAIN_LOW) * p, t, 0.03);

    // §7: a dry click on entering the cancel radius; only when she was out of it, not at the first touch.
    if (cancel && !this.wasCancel && this.pulledOnce) {
      blip(s, { type: 'triangle', freq: 1200, freqEnd: 800, dur: 0.03, gain: 0.035 });
    }
    if (!cancel) this.pulledOnce = true;
    this.wasCancel = cancel;
    // The full pull rings once: you can stop stretching now.
    const full = p >= FULL_POWER;
    if (full && !this.wasFull) blip(s, { type: 'sine', freq: 1174.66, dur: 0.22, gain: 0.03, attack: 0.05 });
    this.wasFull = full;
  }

  private stopGlub(): void {
    const s = this.synth;
    const glub = this.glub;
    this.pulledOnce = false;
    if (!glub || !s) return;
    this.glub = null;
    const t = s.ctx.currentTime;
    glub.gain.gain.cancelScheduledValues(t);
    glub.gain.gain.setValueAtTime(Math.max(0.0001, glub.gain.gain.value), t);
    glub.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    for (const osc of [glub.osc, glub.overtone, glub.wobble]) osc.stop(t + 0.08);
    glub.osc.onended = () => {
      for (const node of [glub.osc, glub.overtone, glub.wobble, glub.wobbleDepth, glub.gain, glub.filter, glub.overtoneGain]) node.disconnect();
    };
  }
}
