"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clipForEvent } from "@/lib/clips";
import { must, supabase } from "@/lib/supabase";
import type {
  ClockAnchor, EventPlayer, EventType, GameStateChange, GoalieChange, Line, LineChange, Match,
  OnIce, Opponent, Player, Side, TagEvent, TeamSettings, Video,
} from "@/lib/types";

export interface TaggingData {
  loading: boolean;
  error: string | null;
  match: (Match & { opponent: Opponent | null }) | null;
  video: Video | null;
  eventTypes: EventType[];
  lines: Line[];
  players: Player[];
  events: TagEvent[];
  eventPlayers: EventPlayer[];
  onIce: Record<string, OnIce[]>;
  lineChanges: (LineChange & { created_at: string })[];
  goalieChanges: (GoalieChange & { created_at: string })[];
  stateChanges: (GameStateChange & { created_at: string })[];
  anchors: (ClockAnchor & { created_at: string })[];
}

const TEMP = "temp-";

export function useTaggingData(matchId: string, videoId: string, settings: TeamSettings | null) {
  const [state, setState] = useState<TaggingData>({
    loading: true, error: null, match: null, video: null, eventTypes: [], lines: [], players: [],
    events: [], eventPlayers: [], onIce: {}, lineChanges: [], goalieChanges: [], stateChanges: [], anchors: [],
  });
  const ref = useRef(state);
  ref.current = state;
  const set = useCallback((patch: Partial<TaggingData> | ((s: TaggingData) => Partial<TaggingData>)) => {
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  }, []);
  const fail = useCallback((e: unknown) => set({ error: (e as Error).message }), [set]);

  const loadContext = useCallback(async () => {
    const sb = supabase();
    const [lc, gc, sc, an] = await Promise.all([
      sb.from("line_changes").select("*").eq("video_id", videoId).order("video_t"),
      sb.from("goalie_changes").select("*").eq("video_id", videoId).order("video_t"),
      sb.from("game_state_changes").select("*").eq("video_id", videoId).order("video_t"),
      sb.from("clock_anchors").select("*").eq("video_id", videoId).order("video_t"),
    ]);
    set({
      lineChanges: must(lc) as TaggingData["lineChanges"],
      goalieChanges: must(gc) as TaggingData["goalieChanges"],
      stateChanges: must(sc) as TaggingData["stateChanges"],
      anchors: must(an) as TaggingData["anchors"],
    });
  }, [videoId, set]);

  const loadEvents = useCallback(async () => {
    const sb = supabase();
    const ev = must(await sb.from("v_events").select("*").eq("video_id", videoId).order("video_t")) as TagEvent[];
    const ids = ev.map((e) => e.id);
    const ep = ids.length
      ? (must(await sb.from("event_players").select("event_id, player_id, role").in("event_id", ids)) as EventPlayer[])
      : [];
    set((s) => ({
      events: [...ev, ...s.events.filter((e) => e.id.startsWith(TEMP))].sort((a, b) => a.video_t - b.video_t),
      eventPlayers: ep,
    }));
  }, [videoId, set]);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [m, v, et, l] = await Promise.all([
        sb.from("matches").select("*, opponent:opponents(*)").eq("id", matchId).single(),
        sb.from("videos").select("*").eq("id", videoId).single(),
        sb.from("event_types").select("*").eq("is_active", true).order("sort"),
        sb.from("lines").select("*, line_members(player_id, slot)").eq("match_id", matchId).order("sort"),
      ]);
      const match = must(m) as TaggingData["match"];
      const playersQ = sb.from("players").select("*").eq("team_id", match!.team_id).eq("active", true).order("jersey_number");
      const players = must(
        await (match!.opponent_id
          ? playersQ.or(`opponent_id.is.null,opponent_id.eq.${match!.opponent_id}`)
          : playersQ.is("opponent_id", null)),
      ) as Player[];
      set({
        match,
        video: must(v) as Video,
        eventTypes: (must(et) as EventType[]).filter((t) => t.team_id === match!.team_id),
        lines: must(l) as Line[],
        players,
      });
      await Promise.all([loadEvents(), loadContext()]);
      set({ loading: false });
    })().catch(fail);
  }, [matchId, videoId, loadEvents, loadContext, set, fail]);

  const fetchOnIce = useCallback(async (eventId: string) => {
    if (eventId.startsWith(TEMP)) return;
    const rows = must(await supabase().from("event_on_ice").select("*").eq("event_id", eventId)) as OnIce[];
    set((s) => ({ onIce: { ...s.onIce, [eventId]: rows } }));
  }, [set]);

  const refreshEvent = useCallback(async (eventId: string) => {
    const row = must(await supabase().from("v_events").select("*").eq("id", eventId).single()) as TagEvent;
    set((s) => ({ events: s.events.map((e) => (e.id === eventId ? row : e)) }));
    await fetchOnIce(eventId);
  }, [set, fetchOnIce]);

  /** Create a tag at video time t. Returns the final id (after the insert). */
  const createTag = useCallback(async (type: EventType, t: number): Promise<string | null> => {
    const s = ref.current;
    if (!s.match || !s.video) return null;
    const tempId = `${TEMP}${crypto.randomUUID()}`;
    const clip = clipForEvent(t, type, settings, s.video.duration_s);
    const optimistic: TagEvent = {
      id: tempId, team_id: s.match.team_id, match_id: s.match.id, video_id: s.video.id, event_type_id: type.id,
      origin: "manual", video_t: t, side: type.default_side, period: null, clock_s: null, own_skaters: null,
      opp_skaters: null, own_goalie: null, opp_goalie: null, x_m: null, y_m: null, zone: null, attributes: {},
      label: null, note: null, confidence: null, review_status: "approved", type_key: type.key, type_name: type.name,
      type_color: type.color, clip_id: null, clip_start_s: clip.start, clip_end_s: clip.end, clip_adjusted: false,
      game_state: null, created_at: new Date().toISOString(),
    };
    set((st) => ({ events: [...st.events, optimistic].sort((a, b) => a.video_t - b.video_t) }));
    try {
      const ins = must(
        await supabase().from("events").insert({
          team_id: s.match.team_id, match_id: s.match.id, video_id: s.video.id, event_type_id: type.id,
          video_t: Math.round(t * 1000) / 1000, side: type.default_side,
        }).select("id").single(),
      ) as { id: string };
      set((st) => ({ events: st.events.map((e) => (e.id === tempId ? { ...e, id: ins.id } : e)) }));
      await refreshEvent(ins.id);
      return ins.id;
    } catch (e) {
      set((st) => ({ events: st.events.filter((x) => x.id !== tempId) }));
      fail(e);
      return null;
    }
  }, [settings, set, refreshEvent, fail]);

  const updateEvent = useCallback(async (id: string, patch: Partial<Pick<TagEvent, "side" | "x_m" | "y_m" | "attributes" | "label" | "note" | "video_t">>) => {
    set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
    try {
      must(await supabase().from("events").update(patch).eq("id", id));
      await refreshEvent(id);
    } catch (e) {
      fail(e);
    }
  }, [set, refreshEvent, fail]);

  const deleteEvent = useCallback(async (id: string) => {
    const prev = ref.current.events;
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
    const r = await supabase().from("events").delete().eq("id", id);
    if (r.error) {
      set({ events: prev });
      fail(r.error);
    }
  }, [set, fail]);

  const setEventPlayer = useCallback(async (eventId: string, playerId: string, role: EventPlayer["role"] = "primary") => {
    const s = ref.current;
    const existing = s.eventPlayers.find((p) => p.event_id === eventId && p.role === role);
    const sb = supabase();
    try {
      if (existing) must(await sb.from("event_players").delete().eq("event_id", eventId).eq("role", role));
      if (existing?.player_id !== playerId) {
        must(await sb.from("event_players").insert({ event_id: eventId, player_id: playerId, role, team_id: s.match!.team_id }));
      }
      set((st) => ({
        eventPlayers: [
          ...st.eventPlayers.filter((p) => !(p.event_id === eventId && p.role === role)),
          ...(existing?.player_id === playerId ? [] : [{ event_id: eventId, player_id: playerId, role }]),
        ],
      }));
    } catch (e) {
      fail(e);
    }
  }, [set, fail]);

  const updateClip = useCallback(async (event: TagEvent, start: number, end: number) => {
    if (!event.clip_id) return;
    set((s) => ({ events: s.events.map((e) => (e.id === event.id ? { ...e, clip_start_s: start, clip_end_s: end, clip_adjusted: true } : e)) }));
    try {
      must(await supabase().from("clips").update({ start_s: start, end_s: end, is_adjusted: true }).eq("id", event.clip_id));
      await refreshEvent(event.id);
    } catch (e) {
      fail(e);
    }
  }, [set, refreshEvent, fail]);

  // Context changes re-derive stored event context in the database, so reload events after.
  const afterContextChange = useCallback(async () => {
    await Promise.all([loadContext(), loadEvents()]);
  }, [loadContext, loadEvents]);

  const insertContext = useCallback(async (table: string, row: Record<string, unknown>) => {
    const s = ref.current;
    try {
      must(await supabase().from(table).insert({ team_id: s.match!.team_id, video_id: videoId, ...row }));
      await afterContextChange();
    } catch (e) {
      fail(e);
    }
  }, [videoId, afterContextChange, fail]);

  const deleteContext = useCallback(async (table: string, id: string) => {
    try {
      must(await supabase().from(table).delete().eq("id", id));
      await afterContextChange();
    } catch (e) {
      fail(e);
    }
  }, [afterContextChange, fail]);

  const actions = useMemo(() => ({
    createTag, updateEvent, deleteEvent, setEventPlayer, updateClip, fetchOnIce,
    lineChange: (t: number, lineId: string | null, side: Side = "own") =>
      insertContext("line_changes", { video_t: round(t), line_id: lineId, side }),
    goalieChange: (t: number, playerId: string | null, side: Side = "own") =>
      insertContext("goalie_changes", { video_t: round(t), player_id: playerId, side }),
    stateChange: (t: number, s: Pick<GameStateChange, "own_skaters" | "opp_skaters" | "own_goalie" | "opp_goalie">) =>
      insertContext("game_state_changes", {
        video_t: round(t), own_skaters: s.own_skaters, opp_skaters: s.opp_skaters,
        own_goalie: s.own_goalie, opp_goalie: s.opp_goalie,
      }),
    clockAnchor: (t: number, period: number, clockS: number, kind: ClockAnchor["kind"]) =>
      insertContext("clock_anchors", { video_t: round(t), period, clock_s: clockS, kind }),
    deleteContext,
    clearError: () => set({ error: null }),
  }), [createTag, updateEvent, deleteEvent, setEventPlayer, updateClip, fetchOnIce, insertContext, deleteContext, set]);

  return { ...state, actions };
}

function round(t: number) {
  return Math.round(t * 1000) / 1000;
}

export type TaggingActions = ReturnType<typeof useTaggingData>["actions"];

export function isTemp(id: string) {
  return id.startsWith(TEMP);
}
