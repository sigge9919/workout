import type { PhaseKind } from '../engine/types';

/** Minsta skala (tomma lungor) relativt full storlek. */
export const ORB_MIN_SCALE = 0.36;

export const PHASE_COLORS: Record<PhaseKind, string> = {
  prepare: '#3b4a5a',
  inhale: '#45d0b0',
  inhale2: '#6fe3c7',
  holdIn: '#e8b660',
  holdOut: '#d99a52',
  exhale: '#7b8ff2',
  rest: '#56677a',
};

export function orbScale(level: number): number {
  return ORB_MIN_SCALE + (1 - ORB_MIN_SCALE) * level;
}

interface Props {
  kind: PhaseKind;
  /** Elementet vars transform animationsloopen sätter direkt (utan React-render). */
  orbRef: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}

/**
 * Andningscirkeln. Storleken sätts av animationsloopen via `orbRef`
 * (transform: scale) för jämn 60/120 fps utan omrenderingar.
 * Färgen följer fasen med en mjuk övergång.
 */
export function BreathOrb({ kind, orbRef, children }: Props) {
  const color = PHASE_COLORS[kind];
  return (
    <div className="relative aspect-square w-[min(80vw,52dvh)] select-none" aria-hidden="true">
      {/* Ytterring = fulla lungor */}
      <div className="absolute inset-0 rounded-full border border-white/10" />
      {/* Innerring = tomma lungor */}
      <div
        className="absolute rounded-full border border-dashed border-white/10"
        style={{ inset: `${((1 - ORB_MIN_SCALE) / 2) * 100}%` }}
      />
      <div
        ref={orbRef}
        className="orb absolute inset-0 rounded-full will-change-transform"
        style={
          {
            transform: `scale(${ORB_MIN_SCALE})`,
            '--orb-color': color,
          } as React.CSSProperties
        }
      />
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
