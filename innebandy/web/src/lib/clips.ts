/**
 * Clip window logic. The database computes and stores clips (see the
 * events_after trigger); this mirrors it for optimistic UI and is reused by
 * playlists (merging overlapping clips) from phase 2.
 */

export interface ClipPresetSource {
  clip_pre_s: number | null;
  clip_post_s: number | null;
}

export interface TeamClipDefaults {
  clip_pre_s: number;
  clip_post_s: number;
}

export interface Interval {
  start: number;
  end: number;
}

/** Per-type preset overrides the team default; both default to 5 s. */
export function clipWindow(type: ClipPresetSource | null | undefined, team: TeamClipDefaults | null | undefined) {
  return {
    pre: type?.clip_pre_s ?? team?.clip_pre_s ?? 5,
    post: type?.clip_post_s ?? team?.clip_post_s ?? 5,
  };
}

/** Keep a clip inside [0, duration]. Unknown duration only clamps at 0. */
export function clampClip(start: number, end: number, duration: number | null | undefined): Interval {
  let s = Math.max(start, 0);
  let e = duration == null ? end : Math.min(end, duration);
  if (duration != null) s = Math.min(s, Math.max(duration - 0.1, 0));
  if (e <= s) e = s + 0.1;
  return { start: round3(s), end: round3(e) };
}

export function clipForEvent(
  t: number,
  type: ClipPresetSource | null | undefined,
  team: TeamClipDefaults | null | undefined,
  duration: number | null | undefined,
): Interval {
  const w = clipWindow(type, team);
  return clampClip(t - w.pre, t + w.post, duration);
}

/**
 * Merge overlapping (or nearly touching, within `gap` seconds) intervals into
 * continuous sequences. Input order does not matter; output is sorted.
 */
export function mergeIntervals<T extends Interval>(items: T[], gap = 0): (Interval & { items: T[] })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: (Interval & { items: T[] })[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.start <= last.end + gap) {
      last.end = Math.max(last.end, it.end);
      last.items.push(it);
    } else {
      out.push({ start: it.start, end: it.end, items: [it] });
    }
  }
  return out;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
