import type { PhaseKind } from '../engine/types';
import { createAmbient, type AmbientHandle, type AmbientType } from './ambient';
import { playCue, type CueKind } from './cues';

export interface ScheduledCue {
  at: number;
  nodes: AudioScheduledSourceNode[];
}

/**
 * Ljudmotor: master → [signaler, ambient], varje lager med egen volym.
 * Allt ljud genereras – inga ljudfiler.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private cueBus!: GainNode;
  private ambientBus!: GainNode;
  private ambient: AmbientHandle | null = null;
  private ambientType: AmbientType = 'off';

  private cueVolume = 0.7;
  private ambientVolume = 0.35;
  private enabled = true;

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Måste anropas i en användarinteraktion (krav i iOS Safari). */
  async unlock(): Promise<void> {
    // iOS: spela ljud även när ljudlösknappen är på (Safari 17+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'playback') {
      try {
        session.type = 'playback';
      } catch {
        /* stöds inte */
      }
    }
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.cueBus = this.ctx.createGain();
      this.cueBus.connect(this.master);
      this.ambientBus = this.ctx.createGain();
      this.ambientBus.connect(this.master);
      this.applyVolumes(0);
      // iOS: en tyst buffert i samma gest låser upp uppspelningen.
      const silent = this.ctx.createBufferSource();
      silent.buffer = this.ctx.createBuffer(1, 1, 22050);
      silent.connect(this.ctx.destination);
      silent.start();
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignoreras – ljudet är valfritt */
      }
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVolumes();
  }

  setCueVolume(v: number): void {
    this.cueVolume = v;
    this.applyVolumes();
  }

  setAmbientVolume(v: number): void {
    this.ambientVolume = v;
    this.applyVolumes();
  }

  private applyVolumes(rampS = 0.15): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(v, t + rampS);
    };
    set(this.master, this.enabled ? 1 : 0);
    // Kvadratisk kurva ger en jämnare upplevd volymskala.
    set(this.cueBus, this.cueVolume ** 2);
    set(this.ambientBus, this.ambientVolume ** 2);
  }

  /** Lägger en signal på ljudklockan (sekunder, AudioContext.currentTime). */
  scheduleCue(kind: CueKind, at: number): ScheduledCue | null {
    if (!this.ctx) return null;
    const nodes = playCue(this.ctx, this.cueBus, kind, Math.max(at, this.ctx.currentTime));
    return { at, nodes };
  }

  cancelCue(cue: ScheduledCue): void {
    for (const n of cue.nodes) {
      try {
        n.stop();
      } catch {
        /* redan stoppad */
      }
      n.disconnect();
    }
  }

  setAmbient(type: AmbientType): void {
    if (type === this.ambientType && this.ambient) return;
    this.ambientType = type;
    this.stopAmbient(0.8);
  }

  startAmbient(fadeS = 2.5): void {
    if (!this.ctx || this.ambientType === 'off' || this.ambient) return;
    this.ambient = createAmbient(this.ctx, this.ambientBus, this.ambientType, fadeS);
  }

  stopAmbient(fadeS = 1.5): void {
    this.ambient?.stop(fadeS);
    this.ambient = null;
  }

  /** Dämpa ambient under paus utan att tappa den. */
  duckAmbient(duck: boolean): void {
    this.ambient?.duck(duck);
  }
}

/** Vilken signal en fas ger när den börjar. */
export function cueForPhase(kind: PhaseKind): CueKind | null {
  switch (kind) {
    case 'inhale':
      return 'inhale';
    case 'inhale2':
      return 'inhale2';
    case 'exhale':
      return 'exhale';
    case 'holdIn':
    case 'holdOut':
      return 'hold';
    case 'rest':
      return 'rest';
    case 'prepare':
      return null;
  }
}

/** Delad instans – AudioContext ska bara skapas en gång. */
export const audio = new AudioEngine();
