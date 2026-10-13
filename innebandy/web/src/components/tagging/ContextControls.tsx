"use client";

import { useState } from "react";
import { activeAt, gameStateKey, matchTimeAt } from "@/lib/context";
import { GAME_STATES } from "@/lib/hotkeys";
import { fmtClock, fmtGameState, fmtVideo, parseClock } from "@/lib/time";
import type { TeamSettings } from "@/lib/types";
import { lineColor } from "./Timeline";
import type { TaggingActions, TaggingData } from "./useTaggingData";

type Actions = TaggingActions;

/** Lines on court, goalie, game state and match clock sync. */
export function ContextControls({ data, t, settings, actions, canEdit }: {
  data: TaggingData;
  t: number;
  settings: TeamSettings | null;
  actions: Actions;
  canEdit: boolean;
}) {
  const ownLines = data.lines.filter((l) => l.side === "own");
  const activeLine = activeAt(data.lineChanges.filter((c) => c.side === "own"), t);
  const activeGoalie = activeAt(data.goalieChanges.filter((c) => c.side === "own"), t);
  const state = activeAt(data.stateChanges, t);
  const clock = matchTimeAt(data.anchors, t, settings?.period_length_s ?? 1200);
  const goalies = data.players.filter((p) => !p.opponent_id);
  const goalieOptions = [...goalies.filter((p) => p.position === "MV"), ...goalies.filter((p) => p.position !== "MV")];

  return (
    <div className="grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
      <section className="rounded-lg bg-slate-800 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Femma på plan</h3>
        <div className="flex flex-wrap gap-1.5" data-testid="line-buttons">
          {ownLines.map((l) => (
            <button
              key={l.id}
              disabled={!canEdit}
              onClick={() => actions.lineChange(t, l.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeLine?.line_id === l.id ? "text-white ring-2 ring-white" : "text-slate-100 opacity-80 hover:opacity-100"}`}
              style={{ background: lineColor(data.lines, l.id) }}
            >
              {l.hotkey && <span className="kbd mr-1 border-white/30 bg-white/20 text-white">{l.hotkey}</span>}
              {l.name}
            </button>
          ))}
          <button
            disabled={!canEdit}
            onClick={() => actions.lineChange(t, null)}
            className={`rounded bg-slate-600 px-2.5 py-1 text-xs text-slate-100 ${activeLine && !activeLine.line_id ? "ring-2 ring-white" : ""}`}
          >
            <span className="kbd mr-1 border-white/30 bg-white/20 text-white">0</span>Ingen
          </button>
          {ownLines.length === 0 && <span className="text-xs text-slate-400">Lägg in femmor på matchsidan.</span>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-400">Målvakt</span>
          <select
            className="input w-auto bg-slate-700 py-1 text-xs text-white"
            value={activeGoalie?.player_id ?? ""}
            disabled={!canEdit}
            onChange={(e) => {
              actions.goalieChange(t, e.target.value || null);
              e.target.blur(); // hand the keyboard back to the tagging hotkeys
            }}
            aria-label="Målvakt"
          >
            <option value="">{activeGoalie ? "Tom kasse" : "– välj –"}</option>
            {goalieOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.jersey_number != null ? `#${p.jersey_number} ` : ""}{p.name}</option>
            ))}
          </select>
        </div>
        <ChangeList
          items={data.lineChanges.filter((c) => c.side === "own").slice(-4).reverse().map((c) => ({
            id: c.id, t: c.video_t, label: data.lines.find((l) => l.id === c.line_id)?.name ?? "Ingen femma",
          }))}
          onDelete={canEdit ? (id) => actions.deleteContext("line_changes", id) : undefined}
        />
      </section>

      <section className="rounded-lg bg-slate-800 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Spelsituation: <span className="text-slate-100">{fmtGameState(gameStateKey(state))}</span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {GAME_STATES.map((g, i) => {
            const on = gameStateKey(state) === gameStateKey(g);
            return (
              <button
                key={g.label}
                disabled={!canEdit}
                onClick={() => actions.stateChange(t, g)}
                className={`rounded px-2 py-1 text-xs ${on ? "bg-white text-slate-900" : "bg-slate-700 text-slate-100 hover:bg-slate-600"}`}
              >
                <span className="kbd mr-1">⇧{i + 1}</span>{g.label}
              </button>
            );
          })}
        </div>
        <ChangeList
          items={data.stateChanges.slice(-3).reverse().map((c) => ({ id: c.id, t: c.video_t, label: fmtGameState(gameStateKey(c)) }))}
          onDelete={canEdit ? (id) => actions.deleteContext("game_state_changes", id) : undefined}
        />
      </section>

      <ClockSync data={data} t={t} clock={clock} actions={actions} canEdit={canEdit} periods={settings?.periods ?? 3} />
    </div>
  );
}

function ClockSync({ data, t, clock, actions, canEdit, periods }: {
  data: TaggingData;
  t: number;
  clock: { period: number; clock_s: number } | null;
  actions: Actions;
  canEdit: boolean;
  periods: number;
}) {
  const [period, setPeriod] = useState(1);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const currentPeriod = clock?.period ?? period;

  return (
    <section className="rounded-lg bg-slate-800 p-3" data-testid="clock-sync">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Matchklocka:{" "}
        <span className="text-slate-100" data-testid="match-clock">
          {clock ? `P${clock.period} ${fmtClock(clock.clock_s)}` : "ej synkad"}
        </span>
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <select className="input w-auto bg-slate-700 py-1 text-xs text-white" value={period} onChange={(e) => setPeriod(Number(e.target.value))} aria-label="Period">
          {Array.from({ length: periods + 1 }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>{p > periods ? "Förl." : `Period ${p}`}</option>
          ))}
        </select>
        <button className="btn btn-sm" disabled={!canEdit} onClick={() => actions.clockAnchor(t, period, 0, "period_start")}>
          Periodstart här
        </button>
        <button className="btn btn-sm" disabled={!canEdit || !clock} onClick={() => clock && actions.clockAnchor(t, currentPeriod, clock.clock_s, "period_end")}>
          Periodslut här
        </button>
      </div>
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const s = parseClock(value);
          if (s == null) return setErr("Skriv tiden som mm:ss");
          setErr(null);
          actions.clockAnchor(t, period, s, "sync");
          setValue("");
        }}
      >
        <input
          className="input w-20 bg-slate-700 py-1 text-xs text-white placeholder:text-slate-400"
          placeholder="mm:ss"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Klockan visar"
        />
        <button className="btn btn-sm" disabled={!canEdit}>Klockan visar detta nu</button>
        {err && <span className="text-xs text-red-300">{err}</span>}
      </form>
      <ChangeList
        items={data.anchors.slice(-3).reverse().map((a) => ({
          id: a.id, t: a.video_t,
          label: `${a.kind === "period_start" ? "Start" : a.kind === "period_end" ? "Slut" : "Synk"} P${a.period} ${fmtClock(a.clock_s)}`,
        }))}
        onDelete={canEdit ? (id) => actions.deleteContext("clock_anchors", id) : undefined}
      />
    </section>
  );
}

function ChangeList({ items, onDelete }: { items: { id: string; t: number; label: string }[]; onDelete?: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-2">
          <span className="tabular-nums">{fmtVideo(i.t)}</span>
          <span className="text-slate-300">{i.label}</span>
          {onDelete && (
            <button className="ml-auto text-slate-500 hover:text-red-300" onClick={() => onDelete(i.id)} aria-label="Ta bort">
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
