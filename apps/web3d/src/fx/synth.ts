/**
 * Web Audio primitives (GDD §7: everything is synthesised, there are no audio files).
 * Pure signal plumbing — no game knowledge; `Audio.ts` decides what each event sounds like.
 *
 * Every voice goes through the same chain, which is what keeps the whole game gentle: a small underwater
 * room behind it, a low-pass that takes the edge off anything bright, and a compressor so that a pile of
 * bursts on one frame can never clip.
 */

export interface Synth {
  ctx: AudioContext;
  /** Master bus, after the room: the mute switch lives on it, and the ambience connects here dry. */
  out: GainNode;
  /** Where one-shot voices connect: dry to `out`, and into the room. */
  voices: GainNode;
  /** The last node before the speakers; debug tools hang a meter on it. */
  limiter: DynamicsCompressorNode;
}

interface WindowWithWebkitAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

const ROOM_SECONDS = 0.9;
const ROOM_WET = 0.2;
/** Nothing in this game needs to be brighter than this. */
const MASTER_LOWPASS_HZ = 6500;

/** A short tail of darkening noise: enough to put the sounds in water, far too short to blur them. */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * ROOM_SECONDS);
  const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < frames; i++) {
      const u = i / frames;
      const coefficient = 0.5 - 0.42 * u;
      low += coefficient * (Math.random() * 2 - 1 - low);
      data[i] = low * Math.pow(1 - u, 3);
    }
  }
  return buffer;
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
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = MASTER_LOWPASS_HZ;
    lowpass.Q.value = 0.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    out.connect(lowpass).connect(limiter).connect(ctx.destination);

    const voices = ctx.createGain();
    voices.connect(out);
    const room = ctx.createConvolver();
    room.buffer = roomImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = ROOM_WET;
    voices.connect(room).connect(wet).connect(out);
    return { ctx, out, voices, limiter };
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
  /** A wobble on the pitch: the flutter of air escaping. */
  vibrato?: { hz: number; cents: number };
}

/** A single enveloped oscillator note. Self-cleaning: the nodes are dropped when it stops. */
export function blip(s: Synth, o: BlipOptions): void {
  const t0 = s.ctx.currentTime + (o.delay ?? 0);
  const osc = s.ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + o.dur);
  const g = s.ctx.createGain();
  // Never under 3 ms: a faster start than that is a click, whatever the waveform.
  const attack = Math.max(0.003, Math.min(0.02, o.dur * (o.attack ?? 0.15)));
  g.gain.setValueAtTime(EPS, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(EPS, o.gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(EPS, t0 + o.dur);
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (o.vibrato) {
    lfo = s.ctx.createOscillator();
    lfo.frequency.value = o.vibrato.hz;
    lfoGain = s.ctx.createGain();
    lfoGain.gain.value = o.vibrato.cents;
    lfo.connect(lfoGain).connect(osc.detune);
    lfo.start(t0);
    lfo.stop(t0 + o.dur + 0.05);
  }
  osc.connect(g).connect(s.voices);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
    lfo?.disconnect();
    lfoGain?.disconnect();
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

/** Brown noise (integrated white), the sea. The ends are crossfaded so its loop has no tick in it. */
export function brownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = whiteNoise(ctx, seconds);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = data[i] ?? 0;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const overlap = Math.min(Math.floor(ctx.sampleRate * 0.25), Math.floor(data.length / 2));
  for (let i = 0; i < overlap; i++) {
    const k = i / overlap;
    const tail = data.length - overlap + i;
    data[tail] = (data[tail] ?? 0) * (1 - k) + (data[i] ?? 0) * k;
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
  g.gain.setValueAtTime(EPS, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(EPS, o.gain), t0 + Math.min(0.006, o.dur * 0.2));
  g.gain.exponentialRampToValueAtTime(EPS, t0 + o.dur);
  src.connect(filter).connect(g).connect(s.voices);
  src.start(t0, Math.random() * Math.max(0, o.buffer.duration - o.dur - 0.01));
  src.stop(t0 + o.dur + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

/** Stacked notes with a small strum delay. */
export function chord(s: Synth, freqs: readonly number[], dur: number, gain: number, strum = 0.06): void {
  freqs.forEach((freq, i) => blip(s, { type: 'sine', freq, dur, gain, delay: i * strum, attack: 0.4 }));
}
