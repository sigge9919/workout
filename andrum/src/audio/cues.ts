export type CueKind = 'inhale' | 'inhale2' | 'exhale' | 'hold' | 'rest' | 'finish' | 'tick';

/**
 * Genererade signaler. Mjuka sinustoner med långsam attack så de inte
 * stör – inandning stiger, utandning faller, hållning är ett klockslag.
 */
export function playCue(ctx: AudioContext, out: AudioNode, kind: CueKind, at: number): AudioScheduledSourceNode[] {
  switch (kind) {
    case 'inhale':
      return [glide(ctx, out, at, 196, 294, 0.9, 0.5), glide(ctx, out, at, 392, 588, 0.9, 0.08)];
    case 'inhale2':
      return [glide(ctx, out, at, 294, 349, 0.5, 0.4)];
    case 'exhale':
      return [glide(ctx, out, at, 294, 196, 1.1, 0.5), glide(ctx, out, at, 588, 392, 1.1, 0.06)];
    case 'hold':
      return [bell(ctx, out, at, 523.25, 0.32), bell(ctx, out, at + 0.12, 783.99, 0.14)];
    case 'rest':
      return [bell(ctx, out, at, 220, 0.35, 1.6), bell(ctx, out, at + 0.2, 330, 0.2, 1.6)];
    case 'tick':
      return [bell(ctx, out, at, 880, 0.12, 0.25)];
    case 'finish':
      return [
        bell(ctx, out, at, 392, 0.3, 2.5),
        bell(ctx, out, at + 0.18, 493.88, 0.25, 2.5),
        bell(ctx, out, at + 0.36, 587.33, 0.25, 3),
      ];
  }
}

/** Ton som glider i frekvens med mjuk in- och uttoning. */
function glide(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  from: number,
  to: number,
  dur: number,
  peak: number,
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.08);
  g.gain.setValueAtTime(peak, at + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.05);
  osc.onended = () => g.disconnect();
  return osc;
}

/** Klockliknande slag: snabb attack, exponentiell avklingning. */
function bell(ctx: AudioContext, out: AudioNode, at: number, freq: number, peak: number, decay = 1.1): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.05);
  osc.onended = () => g.disconnect();
  return osc;
}
