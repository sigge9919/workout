"use client";

import { useMemo } from "react";
import { toIntervals } from "@/lib/context";
import type { Line, LineChange, TagEvent } from "@/lib/types";

const LINE_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#ca8a04", "#be123c", "#475569", "#0f766e"];

export function lineColor(lines: Line[], lineId: string | null) {
  const i = lines.findIndex((l) => l.id === lineId);
  return i < 0 ? "transparent" : LINE_COLORS[i % LINE_COLORS.length];
}

/** Whole-video overview: line shifts, tag markers and the playhead. Click to seek. */
export function Timeline({
  duration, current, events, lineChanges, lines, selectedId, onSeek,
}: {
  duration: number;
  current: number;
  events: TagEvent[];
  lineChanges: LineChange[];
  lines: Line[];
  selectedId: string | null;
  onSeek: (t: number) => void;
}) {
  const shifts = useMemo(
    () => toIntervals(lineChanges.filter((c) => c.side === "own"), duration),
    [lineChanges, duration],
  );
  const pct = (t: number) => `${(Math.min(Math.max(t, 0), duration) / duration) * 100}%`;

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * duration);
  }

  if (!duration) return null;
  return (
    <div className="relative h-12 cursor-pointer rounded bg-slate-800" onClick={seek} data-testid="timeline">
      {/* Line shifts */}
      <div className="absolute inset-x-0 top-0 h-2">
        {shifts.map((s) => (
          <div
            key={s.id}
            className="absolute top-0 h-2"
            style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, background: lineColor(lines, s.line_id) }}
            title={lines.find((l) => l.id === s.line_id)?.name ?? "Ingen femma"}
          />
        ))}
      </div>
      {/* Tags */}
      {events.map((e) => (
        <div
          key={e.id}
          className={`absolute bottom-1 w-1 rounded-sm ${e.id === selectedId ? "h-8 ring-2 ring-white" : "h-6"}`}
          style={{ left: pct(e.video_t), background: e.type_color }}
          title={e.type_name}
        />
      ))}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(current) }} />
    </div>
  );
}
