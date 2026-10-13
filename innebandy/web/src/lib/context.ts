/**
 * Client-side mirror of the database context functions (match_time_at,
 * game_state_at, on_ice_at) so the tagging view can show the live context
 * under the playhead without a round trip. The database stays the source of
 * truth for stored events.
 */

import type { ClockAnchor, GameStateChange } from "./types";

interface Timed {
  video_t: number;
  created_at?: string;
}

/** Latest change at or before t (ties broken by creation order). */
export function activeAt<T extends Timed>(changes: T[], t: number): T | null {
  let best: T | null = null;
  for (const c of changes) {
    if (c.video_t > t) continue;
    if (!best || c.video_t > best.video_t || (c.video_t === best.video_t && (c.created_at ?? "") >= (best.created_at ?? ""))) {
      best = c;
    }
  }
  return best;
}

export function matchTimeAt(
  anchors: (ClockAnchor & { created_at?: string })[],
  t: number,
  periodLengthS = 1200,
): { period: number; clock_s: number } | null {
  const a = activeAt(anchors, t);
  if (!a) return null;
  if (a.kind === "period_end") return { period: a.period, clock_s: a.clock_s };
  let clock = a.clock_s + (t - a.video_t);
  const next = anchors
    .filter((x) => x.video_t > t && x.period === a.period)
    .sort((x, y) => x.video_t - y.video_t)[0];
  if (next) clock = Math.min(clock, Math.max(next.clock_s, a.clock_s));
  return { period: a.period, clock_s: Math.min(clock, periodLengthS) };
}

export function gameStateKey(s: Pick<GameStateChange, "own_skaters" | "opp_skaters" | "own_goalie" | "opp_goalie"> | null): string {
  if (!s) return "5v5";
  if (!s.own_goalie) return "en_own";
  if (!s.opp_goalie) return "en_opp";
  if (s.own_skaters > s.opp_skaters) return "pp";
  if (s.own_skaters < s.opp_skaters) return "bp";
  return `${s.own_skaters}v${s.opp_skaters}`;
}

/** Intervals between consecutive change points (end = next change or video end). */
export function toIntervals<T extends Timed>(changes: T[], end: number): (T & { start: number; end: number })[] {
  const sorted = [...changes].sort((a, b) => a.video_t - b.video_t || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  return sorted.map((c, i) => ({ ...c, start: c.video_t, end: sorted[i + 1]?.video_t ?? end }));
}
