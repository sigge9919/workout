const TRANSITION_REST = 12;

function speak(text, enabled) {
  if (!enabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch {
    // speech synthesis is best-effort; ignore failures silently
  }
}

function beep(ctx, freq = 880, duration = 0.12) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // audio context may be unavailable/blocked; ignore
  }
}

/**
 * Drives a workout session: a flat list of phases (each exercise step plus a
 * rest phase after it) with 1-second ticks. Callbacks report state changes
 * so the UI stays a pure function of timer state.
 */
export class SessionRunner {
  constructor(session, { onTick, onPhaseChange, onComplete, coachVoice = true }) {
    this.steps = session.steps;
    this.coachVoice = coachVoice;
    this.onTick = onTick;
    this.onPhaseChange = onPhaseChange;
    this.onComplete = onComplete;
    this.phases = this._buildPhases();
    this.index = 0;
    this.remaining = this.phases[0]?.duration ?? 0;
    this.running = false;
    this.completedSeconds = 0;
    this._intervalId = null;
    this._audioCtx = null;
  }

  _buildPhases() {
    const phases = [];
    this.steps.forEach((step, i) => {
      phases.push({ type: 'work', step, duration: step.work });
      if (i < this.steps.length - 1) {
        phases.push({ type: 'rest', duration: TRANSITION_REST });
      }
    });
    return phases;
  }

  get currentPhase() {
    return this.phases[this.index];
  }

  get totalSeconds() {
    return this.phases.reduce((sum, p) => sum + p.duration, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._announcePhase();
    this._intervalId = setInterval(() => this._tick(), 1000);
  }

  pause() {
    this.running = false;
    if (this._intervalId) clearInterval(this._intervalId);
    this._intervalId = null;
  }

  resume() {
    if (this.running) return;
    this.start();
  }

  skip() {
    this._advance();
  }

  stop() {
    this.pause();
  }

  _ensureAudio() {
    if (!this._audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this._audioCtx = new Ctx();
    }
    return this._audioCtx;
  }

  _tick() {
    this.remaining -= 1;
    if (this.currentPhase.type === 'work') this.completedSeconds += 1;

    if (this.remaining <= 3 && this.remaining > 0) {
      const ctx = this._ensureAudio();
      if (ctx) beep(ctx, 660, 0.08);
    }

    this.onTick?.({
      phase: this.currentPhase,
      remaining: this.remaining,
      index: this.index,
      totalPhases: this.phases.length,
      completedSeconds: this.completedSeconds,
    });

    if (this.remaining <= 0) {
      this._advance();
    }
  }

  _advance() {
    this.index += 1;
    if (this.index >= this.phases.length) {
      this.pause();
      speak('Nice work. Session complete.', this.coachVoice);
      this.onComplete?.({ completedSeconds: this.completedSeconds, totalSeconds: this.totalSeconds });
      return;
    }
    this.remaining = this.currentPhase.duration;
    this._announcePhase();
  }

  _announcePhase() {
    const phase = this.currentPhase;
    if (phase.type === 'work') {
      const ctx = this._ensureAudio();
      if (ctx) beep(ctx, 880, 0.15);
      const label = phase.step.sideLabel ? `, ${phase.step.sideLabel}` : '';
      speak(`${phase.step.exercise.name}${label}. ${phase.step.exercise.cue}`, this.coachVoice);
    } else {
      speak('Rest and reset.', this.coachVoice);
    }
    this.onPhaseChange?.({ phase, index: this.index, totalPhases: this.phases.length });
  }
}
