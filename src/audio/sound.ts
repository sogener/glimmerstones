/**
 * All sounds are synthesized with Web Audio: no files, works offline.
 * Soft glassy timbres through a gentle generated reverb. iOS needs the context
 * to be created/resumed inside a user gesture, so `unlock()` is called on first touch.
 */

/** Major pentatonic over two octaves: triples climb it as the picture fills. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE = 523.25; // C5
const note = (semi: number) => BASE * 2 ** (semi / 12);

type Ctx = AudioContext;

class Sound {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  enabled = true;

  /** Creates or resumes the audio context; call from a user gesture. */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.unlock();
    else if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  private init(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(ctx, 2.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(reverb);
    reverb.connect(this.master);
  }

  /** Decaying stereo noise = a soft hall. */
  private impulse(ctx: Ctx, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    return buf;
  }

  private ready(): Ctx | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private out(g: GainNode, reverb = 1): void {
    g.connect(this.dry);
    if (reverb > 0) {
      const send = this.ctx!.createGain();
      send.gain.value = reverb;
      g.connect(send);
      send.connect(this.wet);
    }
  }

  /** One sine-ish voice with an exponential decay. */
  private voice(freq: number, t: number, dur: number, gain: number, type: OscillatorType = 'sine', reverb = 1): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(g, reverb);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Glassy bell: fundamental + slightly inharmonic partials. */
  private bell(freq: number, t: number, gain: number, dur = 1.4): void {
    this.voice(freq, t, dur, gain);
    this.voice(freq * 2.01, t, dur * 0.6, gain * 0.35);
    this.voice(freq * 3.98, t, dur * 0.35, gain * 0.12);
    this.voice(freq * 5.43, t, dur * 0.2, gain * 0.05);
  }

  /** Short filtered noise tick (stone touching velvet/wood). */
  private tick(t: number, gain: number, freq: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g);
    this.out(g, 0.15);
    src.start(t);
  }

  /** `delayMs` lets callers schedule sounds that belong to a future animation moment. */
  private at(delayMs = 0): number {
    return this.ctx!.currentTime + Math.max(0, delayMs) / 1000;
  }

  pick(): void {
    if (!this.ready()) return;
    const t = this.at();
    this.voice(1320, t, 0.12, 0.08, 'sine', 0.4);
    this.tick(t, 0.12, 3200);
  }

  /** The soft click of a stone settling into its cell. */
  land(delayMs = 0): void {
    if (!this.ready()) return;
    const t = this.at(delayMs);
    this.tick(t, 0.42, 1700);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    this.out(g, 0.2);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** Chime of a collected triple; `step` climbs the pentatonic scale. */
  triple(step: number, delayMs = 0): void {
    if (!this.ready()) return;
    const t = this.at(delayMs);
    const s = PENTA[step % PENTA.length];
    this.bell(note(s), t, 0.16);
    this.bell(note(s + 7), t + 0.07, 0.09, 1.0);
  }

  /** Pebbles pouring into the picture: a few tiny high ticks. */
  pour(delayMs = 0, count = 6): void {
    if (!this.ready()) return;
    for (let i = 0; i < count; i++) {
      const t = this.at(delayMs + i * 45 + Math.random() * 20);
      this.voice(2600 + Math.random() * 1600, t, 0.05, 0.035, 'sine', 0.6);
    }
  }

  advance(delayMs = 0): void {
    if (!this.ready()) return;
    const t = this.at(delayMs);
    this.tick(t, 0.18, 900);
    this.voice(440, t, 0.18, 0.06, 'triangle', 0.5);
  }

  undo(): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = this.at();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    this.out(g, 0.5);
    o.start(t);
    o.stop(t + 0.25);
  }

  button(): void {
    if (!this.ready()) return;
    this.tick(this.at(), 0.15, 2400);
  }

  hint(): void {
    if (!this.ready()) return;
    const t = this.at();
    [12, 16, 19].forEach((s, i) => this.voice(note(s), t + i * 0.07, 0.4, 0.05));
  }

  shelf(): void {
    if (!this.ready()) return;
    const t = this.at();
    this.tick(t, 0.2, 700);
    this.bell(note(0) / 2, t + 0.05, 0.08, 0.8);
  }

  /** Gentle, not sad: two soft low notes. */
  stuck(): void {
    if (!this.ready()) return;
    const t = this.at();
    this.bell(note(-5), t, 0.08, 1.2);
    this.bell(note(-8), t + 0.22, 0.07, 1.4);
  }

  /** Victory: a little rising melody over a warm chord. */
  win(): void {
    if (!this.ready()) return;
    const t = this.at();
    const melody = [0, 4, 7, 12, 9, 12, 16, 19];
    melody.forEach((s, i) => this.bell(note(s), t + i * 0.13, 0.12, 1.6));
    for (const s of [-12, -8, -5]) {
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = note(s);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g);
      this.out(g, 1);
      o.start(t);
      o.stop(t + 2.7);
    }
  }
}

export const sound = new Sound();

/** Vibration where supported (Android; iOS Safari has no Vibration API). */
export const haptics = {
  enabled: true,
  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
  },
  buzz(pattern: number | number[]): void {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  },
};
