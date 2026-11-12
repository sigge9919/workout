import { TechniqueError, validateTechnique } from '../engine/timeline';
import type { PhaseSpec, Situation, Technique } from '../engine/types';

const PHASE_KINDS = ['inhale', 'inhale2', 'holdIn', 'exhale', 'holdOut'] as const;
const SITUATIONS: Situation[] = ['prematch', 'break', 'post', 'sleep', 'focus'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * Läser in en eller flera tekniker från JSON (objekt eller lista).
 * Kontrollerar strukturen fält för fält och sedan logiken via
 * validateTechnique. Felmeddelanden är på svenska.
 */
export function parseTechniques(input: unknown, reservedIds: Iterable<string> = []): Technique[] {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length) throw new TechniqueError('Ingen teknik hittades');
  const reserved = new Set(reservedIds);
  const seen = new Set<string>();
  return list.map((raw, i) => {
    const t = parseOne(raw, list.length > 1 ? `Teknik ${i + 1}` : 'Tekniken');
    if (reserved.has(t.id)) throw new TechniqueError(`id "${t.id}" används redan av en inbyggd teknik`);
    if (seen.has(t.id)) throw new TechniqueError(`id "${t.id}" förekommer flera gånger`);
    seen.add(t.id);
    return t;
  });
}

function parseOne(raw: unknown, where: string): Technique {
  const fail = (msg: string): never => {
    throw new TechniqueError(`${where}: ${msg}`);
  };
  if (!isObj(raw)) fail('måste vara ett objekt');
  const r = raw as Obj;

  if (!isStr(r.id) || !ID_RE.test(r.id)) fail('"id" måste vara gemener, siffror och bindestreck (t.ex. "min-teknik")');
  if (!isStr(r.name) || !r.name.trim()) fail('"name" saknas');

  if (!Array.isArray(r.cycle)) fail('"cycle" måste vara en lista med faser');
  const cycle: PhaseSpec[] = (r.cycle as unknown[]).map((p, i) => {
    if (!isObj(p)) return fail(`fas ${i + 1} måste vara ett objekt`);
    if (!PHASE_KINDS.includes(p.kind as (typeof PHASE_KINDS)[number])) {
      fail(`fas ${i + 1}: "kind" måste vara något av ${PHASE_KINDS.join(', ')}`);
    }
    if (!isNum(p.seconds) || p.seconds <= 0 || p.seconds > 600) fail(`fas ${i + 1}: "seconds" måste vara 0–600`);
    if (p.label !== undefined && !isStr(p.label)) fail(`fas ${i + 1}: "label" måste vara text`);
    return { kind: p.kind as PhaseSpec['kind'], seconds: p.seconds as number, ...(p.label ? { label: p.label as string } : {}) };
  });

  let length: Technique['length'];
  if (r.length === undefined) {
    length = { mode: 'duration', seconds: 300 };
  } else if (isObj(r.length) && r.length.mode === 'duration' && isNum(r.length.seconds) && r.length.seconds > 0) {
    length = { mode: 'duration', seconds: r.length.seconds };
  } else if (isObj(r.length) && r.length.mode === 'cycles' && isNum(r.length.count) && r.length.count >= 1) {
    length = { mode: 'cycles', count: Math.floor(r.length.count) };
  } else {
    return fail('"length" måste vara { "mode": "duration", "seconds": … } eller { "mode": "cycles", "count": … }');
  }

  let rounds: Technique['rounds'];
  if (r.rounds !== undefined) {
    const x = r.rounds;
    if (!isObj(x) || !isNum(x.count) || !isNum(x.cyclesPerRound)) fail('"rounds" behöver "count" och "cyclesPerRound"');
    const xo = x as Obj;
    let hold: NonNullable<Technique['rounds']>['hold'];
    if (xo.hold !== undefined) {
      const h = xo.hold;
      if (!isObj(h) || (h.after !== 'inhale' && h.after !== 'exhale') || !isNum(h.seconds)) {
        fail('"rounds.hold" behöver "after" ("inhale"/"exhale") och "seconds"');
      }
      const ho = h as Obj;
      hold = {
        after: ho.after as 'inhale' | 'exhale',
        seconds: ho.seconds as number,
        ...(isNum(ho.incrementSeconds) ? { incrementSeconds: ho.incrementSeconds } : {}),
      };
    }
    rounds = {
      count: xo.count as number,
      cyclesPerRound: xo.cyclesPerRound as number,
      restSeconds: isNum(xo.restSeconds) ? xo.restSeconds : 0,
      ...(hold ? { hold } : {}),
    };
  }

  const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).filter((x): x is Situation => SITUATIONS.includes(x as Situation)) : [];
  const hasHold = cycle.some((p) => p.kind === 'holdIn' || p.kind === 'holdOut') || !!rounds?.hold;

  const t: Technique = {
    id: r.id as string,
    name: (r.name as string).trim(),
    purpose: isStr(r.purpose) ? r.purpose : '',
    description: isStr(r.description) ? r.description : '',
    tags,
    cycle,
    length,
    ...(rounds ? { rounds } : {}),
    ...(isObj(r.adjustable) ? { adjustable: r.adjustable as Technique['adjustable'] } : {}),
    // Varningen visas alltid när tekniken innehåller hållningar.
    hasBreathHold: hasHold || r.hasBreathHold === true,
    builtin: false,
  };

  try {
    validateTechnique(t);
  } catch (e) {
    fail(e instanceof Error ? e.message.replace(/^[^:]+: /, '') : 'ogiltig');
  }
  return t;
}
