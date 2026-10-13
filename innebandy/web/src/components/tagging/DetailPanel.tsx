"use client";

import { useEffect, useState } from "react";
import { Rink } from "@/components/Rink";
import { fmtClock, fmtGameState, fmtVideo, ZONE_LABELS } from "@/lib/time";
import type { EventPlayer, EventType, OnIce, Player, TagEvent } from "@/lib/types";
import { isTemp } from "./useTaggingData";

/**
 * Details for one tag. Everything saves immediately, so the coach can fill
 * it in while the video keeps playing.
 */
export function DetailPanel({
  event, type, players, onIce, eventPlayers, currentTime,
  onUpdate, onSetPlayer, onDelete, onClip, onPlayClip, onClose,
}: {
  event: TagEvent;
  type: EventType | undefined;
  players: Player[];
  onIce: OnIce[] | undefined;
  eventPlayers: EventPlayer[];
  currentTime: number;
  onUpdate: (patch: Partial<TagEvent>) => void;
  onSetPlayer: (playerId: string) => void;
  onDelete: () => void;
  onClip: (start: number, end: number) => void;
  onPlayClip: () => void;
  onClose: () => void;
}) {
  const saving = isTemp(event.id);
  const fields = type?.attribute_schema?.fields ?? [];
  const primary = eventPlayers.find((p) => p.role === "primary")?.player_id;

  // Players to choose from: those on court for the relevant side, else everyone on that side.
  const sidePlayers = players.filter((p) => (event.side === "own" ? !p.opponent_id : !!p.opponent_id));
  const onCourtIds = new Set((onIce ?? []).filter((o) => o.side === event.side).map((o) => o.player_id));
  const onCourt = sidePlayers.filter((p) => onCourtIds.has(p.id));
  const others = sidePlayers.filter((p) => !onCourtIds.has(p.id));
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [event.id]);

  const [note, setNote] = useState(event.note ?? "");
  const [label, setLabel] = useState(event.label ?? "");
  useEffect(() => {
    setNote(event.note ?? "");
    setLabel(event.label ?? "");
  }, [event.id, event.note, event.label]);

  const start = event.clip_start_s ?? 0;
  const end = event.clip_end_s ?? 0;

  return (
    <div className="space-y-3 text-sm" data-testid="detail-panel">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: event.type_color }} />
        <span className="text-base font-semibold">{event.type_name}</span>
        <span className="text-slate-500">{fmtVideo(event.video_t)}</span>
        {saving && <span className="text-xs text-slate-400">Sparar…</span>}
        <button className="btn btn-sm ml-auto" onClick={onClose} title="Esc">Stäng</button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600" data-testid="event-context">
        <span>Period: <b>{event.period ?? "–"}</b></span>
        <span>Matchtid: <b>{fmtClock(event.clock_s)}</b></span>
        <span>Spelsituation: <b>{fmtGameState(event.game_state)}</b></span>
        <span>Zon: <b>{event.zone ? ZONE_LABELS[event.zone] : "–"}</b></span>
      </div>

      {type?.asks_side && (
        <Choice
          label="Lag"
          value={event.side}
          options={[{ value: "own", label: "För (vi)" }, { value: "opp", label: "Emot (de)" }]}
          onChange={(v) => onUpdate({ side: v as TagEvent["side"] })}
          disabled={saving}
        />
      )}

      {fields.map((f) =>
        f.type === "choice" ? (
          <Choice
            key={f.key}
            label={f.label}
            value={event.attributes?.[f.key] ?? null}
            options={f.options ?? []}
            disabled={saving}
            onChange={(v) => {
              const attrs = { ...(event.attributes ?? {}) };
              if (attrs[f.key] === v) delete attrs[f.key];
              else attrs[f.key] = v;
              onUpdate({ attributes: attrs });
            }}
          />
        ) : (
          <div key={f.key}>
            <div className="label">{f.label}</div>
            <input
              className="input"
              defaultValue={event.attributes?.[f.key] ?? ""}
              disabled={saving}
              onBlur={(e) => {
                if ((event.attributes?.[f.key] ?? "") !== e.target.value) {
                  onUpdate({ attributes: { ...(event.attributes ?? {}), [f.key]: e.target.value } });
                }
              }}
            />
          </div>
        ),
      )}

      {type?.attribute_schema?.free_label && (
        <div>
          <div className="label">Etikett</div>
          <input
            className="input"
            placeholder="t.ex. bra press, visa på videomöte"
            value={label}
            disabled={saving}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== (event.label ?? "") && onUpdate({ label: label || null })}
          />
        </div>
      )}

      <div>
        <div className="label">
          {type?.player_role_label ?? "Spelare"}
          {onIce && onCourt.length > 0 ? " (på plan)" : ""}
        </div>
        <div className="flex flex-wrap gap-1">
          {(onCourt.length ? onCourt : sidePlayers).map((p) => (
            <PlayerChip key={p.id} player={p} active={primary === p.id} onClick={() => onSetPlayer(p.id)} disabled={saving} />
          ))}
          {onCourt.length > 0 && others.length > 0 && !showAll && (
            <button className="text-xs text-blue-700 hover:underline" onClick={() => setShowAll(true)}>Visa alla</button>
          )}
          {showAll && others.map((p) => (
            <PlayerChip key={p.id} player={p} active={primary === p.id} onClick={() => onSetPlayer(p.id)} disabled={saving} />
          ))}
          {sidePlayers.length === 0 && <span className="text-xs text-slate-500">Inga spelare inlagda för laget.</span>}
        </div>
      </div>

      {(type?.asks_position ?? true) && (
        <div>
          <div className="label">Position (klicka på planen – vi anfaller åt höger)</div>
          <Rink
            className="w-full rounded border border-slate-200"
            selected={event.x_m != null && event.y_m != null ? { x: event.x_m, y: event.y_m } : null}
            onPick={(x, y) => !saving && onUpdate({ x_m: x, y_m: y })}
          />
          {event.x_m != null && (
            <button className="mt-1 text-xs text-slate-500 hover:underline" onClick={() => onUpdate({ x_m: null, y_m: null })}>
              Rensa position
            </button>
          )}
        </div>
      )}

      <div>
        <div className="label">Klipp</div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="clip-editor">
          <button className="btn btn-sm" onClick={() => onClip(Math.max(0, start - 1), end)} disabled={saving}>−1 s</button>
          <span className="tabular-nums" data-testid="clip-start">{fmtVideo(start)}</span>
          <button className="btn btn-sm" onClick={() => onClip(Math.min(start + 1, end - 0.5), end)} disabled={saving}>+1 s</button>
          <span className="text-slate-400">→</span>
          <button className="btn btn-sm" onClick={() => onClip(start, Math.max(end - 1, start + 0.5))} disabled={saving}>−1 s</button>
          <span className="tabular-nums" data-testid="clip-end">{fmtVideo(end)}</span>
          <button className="btn btn-sm" onClick={() => onClip(start, end + 1)} disabled={saving}>+1 s</button>
          <span className="text-xs text-slate-500">({(end - start).toFixed(1)} s{event.clip_adjusted ? ", justerat" : ""})</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button className="btn btn-sm" onClick={onPlayClip}>▶ Spela klipp</button>
          <button className="btn btn-sm" disabled={saving || currentTime >= end} onClick={() => onClip(currentTime, end)}>Start = nu</button>
          <button className="btn btn-sm" disabled={saving || currentTime <= start} onClick={() => onClip(start, currentTime)}>Slut = nu</button>
          <button className="btn btn-sm" disabled={saving} onClick={() => onUpdate({ video_t: Math.round(currentTime * 1000) / 1000 })}>
            Flytta taggen hit
          </button>
        </div>
      </div>

      <div>
        <div className="label">Anteckning</div>
        <textarea
          className="input h-16"
          value={note}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (event.note ?? "") && onUpdate({ note: note || null })}
        />
      </div>

      <button className="btn btn-sm btn-danger" onClick={onDelete} disabled={saving}>Ta bort tagg</button>
    </div>
  );
}

function Choice({ label, value, options, onChange, disabled }: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded border px-2 py-1 text-xs ${value === o.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-100"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerChip({ player, active, onClick, disabled }: { player: Player; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-xs ${active ? "border-blue-700 bg-blue-600 text-white" : "border-slate-300 bg-white hover:bg-slate-100"}`}
    >
      {player.jersey_number != null ? `#${player.jersey_number} ` : ""}{player.name}
    </button>
  );
}
