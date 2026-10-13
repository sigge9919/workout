"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPlayback } from "@/lib/api";
import { activeAt, gameStateKey, matchTimeAt } from "@/lib/context";
import { matchTitle } from "@/lib/format";
import { GAME_STATES, isTypingTarget, nextRate, resolveHotkey } from "@/lib/hotkeys";
import { useTeam } from "@/lib/session";
import { fmtClock, fmtGameState, fmtVideo } from "@/lib/time";
import type { EventType, TagEvent } from "@/lib/types";
import { ContextControls } from "./ContextControls";
import { DetailPanel } from "./DetailPanel";
import { Timeline } from "./Timeline";
import { isTemp, useTaggingData } from "./useTaggingData";

export function Workspace({ matchId, videoId }: { matchId: string; videoId: string }) {
  const { team, settings, canEdit } = useTeam();
  const data = useTaggingData(matchId, videoId, settings);
  const { actions } = data;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<{ url: string; poster: string | null } | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const clipEnd = useRef<number | null>(null);
  const undoStack = useRef<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    getPlayback(videoId).then((p) => setSrc({ url: p.url, poster: p.poster_url }), (e) => setFlash(e.message));
  }, [videoId]);

  // Playhead: rAF while playing (smooth timeline), events otherwise.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last > 80) {
        last = now;
        setT(v.currentTime);
        if (clipEnd.current != null && v.currentTime >= clipEnd.current) {
          v.pause();
          clipEnd.current = null;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(loop);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setT(v.currentTime);
    };
    const onSeeked = () => setT(v.currentTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("loadedmetadata", onSeeked);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("loadedmetadata", onSeeked);
    };
  }, [src, data.loading]);

  const duration = data.video?.duration_s ?? 0;
  const fps = data.video?.fps || 25;

  const seek = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    clipEnd.current = null;
    v.currentTime = Math.min(Math.max(time, 0), duration || v.duration || 0);
    setT(v.currentTime);
  }, [duration]);

  const playClip = useCallback((e: TagEvent) => {
    const v = videoRef.current;
    if (!v || e.clip_start_s == null) return;
    v.currentTime = e.clip_start_s;
    clipEnd.current = e.clip_end_s;
    v.play();
  }, []);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash((f) => (f === msg ? null : f)), 1500);
  };

  const tag = useCallback(async (type: EventType) => {
    if (!canEdit) return;
    const time = videoRef.current?.currentTime ?? t;
    showFlash(`${type.name} @ ${fmtVideo(time)}`);
    const id = await actions.createTag(type, time);
    if (id) {
      undoStack.current.push(id);
      setSelectedId(id);
    }
  }, [actions, canEdit, t]);

  const typesById = useMemo(() => new Map(data.eventTypes.map((et) => [et.id, et])), [data.eventTypes]);
  const hotkeyCfg = useMemo(() => ({
    tagKeys: new Map(data.eventTypes.filter((et) => et.hotkey).map((et) => [et.hotkey!.toLowerCase(), et.id])),
    lineKeys: new Map(data.lines.filter((l) => l.side === "own" && l.hotkey).map((l) => [l.hotkey!, l.id])),
  }), [data.eventTypes, data.lines]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const action = resolveHotkey(e, hotkeyCfg);
      if (!action) return;
      e.preventDefault();
      // A focused button would also react to Space/Enter; hotkeys win.
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      const v = videoRef.current;
      const now = v?.currentTime ?? 0;
      switch (action.kind) {
        case "togglePlay":
          if (v) {
            if (v.paused) v.play();
            else v.pause();
          }
          break;
        case "seek":
          seek(now + action.delta);
          break;
        case "frame":
          v?.pause();
          seek(now + action.dir / fps);
          break;
        case "rate": {
          const r = nextRate(v?.playbackRate ?? 1, action.dir);
          if (v) v.playbackRate = r;
          setRate(r);
          showFlash(`Hastighet ${r}×`);
          break;
        }
        case "undo": {
          const id = undoStack.current.pop();
          if (id) {
            actions.deleteEvent(id);
            if (selectedId === id) setSelectedId(null);
            showFlash("Senaste taggen borttagen");
          }
          break;
        }
        case "escape":
          setSelectedId(null);
          break;
        case "tag": {
          const type = typesById.get(action.eventTypeId);
          if (type) tag(type);
          break;
        }
        case "line":
          if (!canEdit) break;
          actions.lineChange(now, action.lineId);
          showFlash(action.lineId ? `${data.lines.find((l) => l.id === action.lineId)?.name} in` : "Ingen femma");
          break;
        case "gameState":
          if (!canEdit) break;
          actions.stateChange(now, GAME_STATES[action.index]);
          showFlash(GAME_STATES[action.index].label);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeyCfg, seek, fps, actions, selectedId, typesById, tag, canEdit, data.lines]);

  const selected = data.events.find((e) => e.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedId && !isTemp(selectedId) && !data.onIce[selectedId]) actions.fetchOnIce(selectedId);
  }, [selectedId, data.onIce, actions]);

  const visibleEvents = filter ? data.events.filter((e) => e.event_type_id === filter) : data.events;

  // Live context under the playhead.
  const clock = matchTimeAt(data.anchors, t, settings?.period_length_s ?? 1200);
  const line = activeAt(data.lineChanges.filter((c) => c.side === "own"), t);
  const state = activeAt(data.stateChanges, t);

  if (data.error && !data.video) return <p className="p-6 text-red-700">{data.error}</p>;
  if (data.loading || !data.video || !data.match) return <p className="p-6 text-sm text-slate-500">Laddar taggning…</p>;

  return (
    <div className="flex min-h-[calc(100vh-49px)] flex-col bg-slate-900 text-slate-100 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/matcher/${matchId}`} className="text-slate-400 hover:text-white">← {matchTitle(team.name, data.match)}</Link>
          <span className="ml-auto flex gap-3 text-slate-300" data-testid="live-context">
            <span>{clock ? `P${clock.period} · ${fmtClock(clock.clock_s)}` : "Klocka ej synkad"}</span>
            <span>{fmtGameState(gameStateKey(state))}</span>
            <span>{data.lines.find((l) => l.id === line?.line_id)?.name ?? "Ingen femma"}</span>
          </span>
        </div>

        <div className="relative">
          {src ? (
            <video
              ref={videoRef}
              src={src.url}
              poster={src.poster ?? undefined}
              className="aspect-video max-h-[56vh] w-full rounded bg-black object-contain"
              preload="auto"
              playsInline
              onClick={() => (videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause())}
              data-testid="video"
            />
          ) : (
            <div className="flex aspect-video max-h-[56vh] w-full items-center justify-center rounded bg-black text-sm text-slate-400">Laddar video…</div>
          )}
          {flash && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-sm" data-testid="flash">
              {flash}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="btn btn-sm" onClick={() => seek(t - 5)} title="Skift+←">−5 s</button>
          <button className="btn btn-sm" onClick={() => seek(t - 2)} title="←">−2 s</button>
          <button className="btn btn-sm w-16" onClick={() => (videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause())} title="Mellanslag">
            {playing ? "Paus" : "Spela"}
          </button>
          <button className="btn btn-sm" onClick={() => seek(t + 2)} title="→">+2 s</button>
          <button className="btn btn-sm" onClick={() => seek(t + 5)} title="Skift+→">+5 s</button>
          <span className="tabular-nums text-slate-300" data-testid="video-time">{fmtVideo(t)} / {fmtVideo(duration, 0)}</span>
          <span className="text-slate-400">{rate}×</span>
          <span className="ml-auto hidden text-xs text-slate-500 lg:block">
            <span className="kbd">,</span> <span className="kbd">.</span> bildruta · <span className="kbd">[</span> <span className="kbd">]</span> hastighet · <span className="kbd">Ctrl</span>+<span className="kbd">Z</span> ångra
          </span>
        </div>

        <Timeline
          duration={duration}
          current={t}
          events={data.events}
          lineChanges={data.lineChanges}
          lines={data.lines}
          selectedId={selectedId}
          onSeek={seek}
        />

        <div className="flex flex-wrap gap-1.5" data-testid="keypad">
          {data.eventTypes.filter((et) => !et.is_auto).map((et) => (
            <button
              key={et.id}
              disabled={!canEdit}
              onClick={() => tag(et)}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white shadow hover:brightness-110 disabled:opacity-50"
              style={{ background: et.color }}
            >
              {et.hotkey && <span className="kbd border-white/30 bg-white/20 uppercase text-white">{et.hotkey}</span>}
              {et.name}
            </button>
          ))}
        </div>

        <ContextControls data={data} t={t} settings={settings} actions={actions} canEdit={canEdit} />
        {data.error && (
          <p className="text-sm text-red-300">
            {data.error} <button className="underline" onClick={actions.clearError}>Stäng</button>
          </p>
        )}
      </div>

      <aside className="flex w-full flex-col gap-3 border-l border-slate-800 bg-white p-3 text-slate-900 xl:w-[420px]">
        {selected ? (
          <DetailPanel
            event={selected}
            type={typesById.get(selected.event_type_id)}
            players={data.players}
            onIce={data.onIce[selected.id]}
            eventPlayers={data.eventPlayers.filter((p) => p.event_id === selected.id)}
            currentTime={t}
            onUpdate={(patch) => actions.updateEvent(selected.id, patch as Parameters<typeof actions.updateEvent>[1])}
            onSetPlayer={(pid) => actions.setEventPlayer(selected.id, pid)}
            onDelete={() => {
              actions.deleteEvent(selected.id);
              setSelectedId(null);
            }}
            onClip={(s, e) => actions.updateClip(selected, Math.round(s * 10) / 10, Math.round(e * 10) / 10)}
            onPlayClip={() => playClip(selected)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">
            Tryck en taggknapp eller dess tangent för att tagga. Varje tagg blir ett klipp, och detaljerna fyller du i här medan videon spelar vidare.
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Taggar ({data.events.length})</h3>
            <select className="input ml-auto w-auto py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrera">
              <option value="">Alla typer</option>
              {data.eventTypes.map((et) => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </select>
          </div>
          <ul className="mt-2 max-h-[50vh] flex-1 divide-y divide-slate-100 overflow-auto text-sm" data-testid="event-list">
            {visibleEvents.map((e) => (
              <li
                key={e.id}
                className={`flex cursor-pointer items-center gap-2 px-1 py-1.5 hover:bg-slate-50 ${e.id === selectedId ? "bg-blue-50" : ""}`}
                onClick={() => {
                  setSelectedId(e.id);
                  playClip(e);
                }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.type_color }} />
                <span className="w-16 shrink-0 tabular-nums text-slate-500">{fmtVideo(e.video_t)}</span>
                <span className="shrink-0 text-xs text-slate-500">{e.period ? `P${e.period} ${fmtClock(e.clock_s)}` : ""}</span>
                <span className="truncate font-medium">{e.type_name}</span>
                <span className="truncate text-xs text-slate-500">{summary(e, typesById.get(e.event_type_id))}</span>
              </li>
            ))}
            {visibleEvents.length === 0 && <li className="py-3 text-slate-500">Inga taggar ännu.</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function summary(e: TagEvent, type: EventType | undefined): string {
  const parts: string[] = [];
  if (type?.asks_side) parts.push(e.side === "own" ? "för" : "emot");
  for (const f of type?.attribute_schema?.fields ?? []) {
    const v = e.attributes?.[f.key];
    if (!v) continue;
    parts.push(f.options?.find((o) => o.value === v)?.label ?? v);
  }
  if (e.label) parts.push(e.label);
  return parts.join(" · ");
}
