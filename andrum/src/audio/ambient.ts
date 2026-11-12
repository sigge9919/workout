export type AmbientType = 'off' | 'brown' | 'pink' | 'drone';

export const AMBIENT_LABELS: Record<AmbientType, string> = {
  off: 'Av',
  brown: 'Mörkt brus',
  pink: 'Regn',
  drone: 'Drone',
};

export interface AmbientHandle {
  stop(fadeS: number): void;
  duck(on: boolean): void;
}

const DUCK_LEVEL = 0.25;

/** Genererad bakgrund: brus eller en mjuk drone. */
export function createAmbient(ctx: AudioContext, out: AudioNode, type: Exclude<AmbientType, 'off'>, fadeS: number): AmbientHandle {
  const env = ctx.createGain();
  const now = ctx.currentTime;
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(1, now + Math.max(fadeS, 0.05));
  env.connect(out);

  const sources: AudioScheduledSourceNode[] = [];
  if (type === 'drone') buildDrone(ctx, env, sources);
  else buildNoise(ctx, env, type, sources);

  let stopped = false;
  return {
    stop(fade) {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(fade, 0.05));
      for (const s of sources) s.stop(t + fade + 0.1);
      setTimeout(() => env.disconnect(), (fade + 0.3) * 1000);
    },
    duck(on) {
      if (stopped) return;
      const t = ctx.currentTime;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), t);
      env.gain.exponentialRampToValueAtTime(on ? DUCK_LEVEL : 1, t + 0.6);
    },
  };
}

function buildNoise(ctx: AudioContext, out: AudioNode, type: 'brown' | 'pink', sources: AudioScheduledSourceNode[]) {
  const seconds = 6;
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  const fadeLen = Math.floor(ctx.sampleRate * 0.25);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    if (type === 'brown') fillBrown(data);
    else fillPink(data);
    crossfadeLoop(data, fadeLen);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = (buffer.length - fadeLen) / ctx.sampleRate;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = type === 'brown' ? 700 : 2400;

  // Långsam "andning" i bruset så det inte känns statiskt.
  const swell = ctx.createGain();
  swell.gain.value = 0.85;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.15;
  lfo.connect(lfoDepth).connect(swell.gain);

  const level = ctx.createGain();
  level.gain.value = type === 'brown' ? 0.9 : 0.35;

  src.connect(filter).connect(swell).connect(level).connect(out);
  src.start();
  lfo.start();
  sources.push(src, lfo);
}

function buildDrone(ctx: AudioContext, out: AudioNode, sources: AudioScheduledSourceNode[]) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  filter.Q.value = 0.7;

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 180;
  lfo.connect(lfoDepth).connect(filter.frequency);
  lfo.start();
  sources.push(lfo);

  const level = ctx.createGain();
  level.gain.value = 0.18;
  filter.connect(level).connect(out);

  // A2, E3, A3 lätt ostämda för en levande ton.
  const voices: Array<[number, OscillatorType, number]> = [
    [110, 'sawtooth', 0.35],
    [110.4, 'sawtooth', 0.35],
    [164.8, 'triangle', 0.4],
    [220.6, 'sine', 0.3],
  ];
  for (const [freq, type, gain] of voices) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(filter);
    osc.start();
    sources.push(osc);
  }
}

function fillBrown(data: Float32Array) {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
}

/** Paul Kelletts approximation av rosa brus. */
function fillPink(data: Float32Array) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

/**
 * Sömlös loop: början blandas med svansen, och loopen slutar där svansen
 * börjar (loopEnd = len − n). Hoppet len−n−1 → 0 blir då kontinuerligt.
 */
function crossfadeLoop(data: Float32Array, n: number) {
  const len = data.length;
  for (let i = 0; i < n; i++) {
    const a = i / n;
    data[i] = data[i] * a + data[len - n + i] * (1 - a);
  }
}
