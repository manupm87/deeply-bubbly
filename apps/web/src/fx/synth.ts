/**
 * Web Audio primitives (GDD §7: everything is synthesised, there are no audio files).
 * Pure signal plumbing — no game knowledge; `Audio.ts` decides what each event sounds like.
 */

export interface Synth {
  ctx: AudioContext;
  /** Master bus: every voice connects here, the mute switch lives on it. */
  out: GainNode;
}

interface WindowWithWebkitAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/** Never call before a user gesture: iOS refuses to start a context otherwise. Null when unsupported. */
export function createSynth(): Synth | null {
  const w = globalThis as unknown as WindowWithWebkitAudio;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    return { ctx, out };
  } catch {
    return null;
  }
}

/** Gain ramps must stay above zero: exponential ramps to 0 are a no-op in Web Audio. */
const EPS = 0.0001;

export interface BlipOptions {
  type: OscillatorType;
  freq: number;
  /** Target frequency at the end of the note; omitted = steady pitch. */
  freqEnd?: number;
  /** Seconds. */
  dur: number;
  gain: number;
  /** Seconds of delay before the note starts (chords, arpeggios). */
  delay?: number;
  /** Attack as a fraction of the duration (default 0.15, capped at 20 ms). */
  attack?: number;
}

/** A single enveloped oscillator note. Self-cleaning: the nodes are dropped when it stops. */
export function blip(s: Synth, o: BlipOptions): void {
  const t0 = s.ctx.currentTime + (o.delay ?? 0);
  const osc = s.ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + o.dur);
  const g = s.ctx.createGain();
  const attack = Math.min(0.02, o.dur * (o.attack ?? 0.15));
  g.gain.setValueAtTime(EPS, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(EPS, o.gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(EPS, t0 + o.dur);
  osc.connect(g).connect(s.out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

/** Fills a buffer with white noise; reused as the source of every burst and of the ambience. */
export function whiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Brown noise (integrated white): the low rumble the zone ambience filters down as depth grows. */
export function brownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = whiteNoise(ctx, seconds);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = data[i] ?? 0;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export interface NoiseBurstOptions {
  buffer: AudioBuffer;
  /** Seconds. */
  dur: number;
  gain: number;
  /** Band-pass centre in Hz: the "material" of the burst. */
  cutoff: number;
  q?: number;
}

/** Short filtered noise transient — the body of every bounce. */
export function noiseBurst(s: Synth, o: NoiseBurstOptions): void {
  const t0 = s.ctx.currentTime;
  const src = s.ctx.createBufferSource();
  src.buffer = o.buffer;
  src.loop = true;
  const filter = s.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = o.cutoff;
  filter.Q.value = o.q ?? 1.2;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(Math.max(EPS, o.gain), t0);
  g.gain.exponentialRampToValueAtTime(EPS, t0 + o.dur);
  src.connect(filter).connect(g).connect(s.out);
  src.start(t0, Math.random() * Math.max(0, o.buffer.duration - o.dur - 0.01));
  src.stop(t0 + o.dur + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

/** Stacked notes with a small strum delay. */
export function chord(s: Synth, freqs: readonly number[], dur: number, gain: number): void {
  freqs.forEach((freq, i) => blip(s, { type: 'sine', freq, dur, gain, delay: i * 0.06, attack: 0.4 }));
}
