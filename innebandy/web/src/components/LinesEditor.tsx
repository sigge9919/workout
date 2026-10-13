"use client";

import { useCallback, useEffect, useState } from "react";
import { must, supabase } from "@/lib/supabase";
import type { Line, Player } from "@/lib/types";

/** Edit the own team's lines ("femmor") for a match. */
export function LinesEditor({ teamId, matchId, canEdit }: { teamId: string; matchId: string; canEdit: boolean }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [l, p] = await Promise.all([
      sb.from("lines").select("*, line_members(player_id, slot)").eq("match_id", matchId).eq("side", "own").order("sort"),
      sb.from("players").select("*").eq("team_id", teamId).is("opponent_id", null).eq("active", true).order("jersey_number"),
    ]);
    setLines(must(l) as Line[]);
    setPlayers(must(p) as Player[]);
  }, [teamId, matchId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null);
    const r = await fn();
    if (r.error) setError(r.error.message);
    await load();
  };

  const usedKeys = new Set(lines.map((l) => l.hotkey));
  const nextKey = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find((k) => !usedKeys.has(k)) ?? null;

  async function addLine() {
    await run(() =>
      supabase().from("lines").insert({
        team_id: teamId, match_id: matchId, side: "own",
        name: nextKey ? `Femma ${nextKey}` : "Ny femma", hotkey: nextKey, sort: lines.length,
      }),
    );
  }

  async function copyFromPrevious() {
    const sb = supabase();
    // Most recent other match of this team that has lines.
    const prev = must(
      await sb.from("lines").select("match_id, matches!inner(played_at)").eq("team_id", teamId).eq("side", "own")
        .neq("match_id", matchId).order("matches(played_at)", { ascending: false }).limit(1),
    ) as { match_id: string }[];
    if (!prev.length) {
      setError("Hittade ingen tidigare match med femmor.");
      return;
    }
    const src = must(
      await sb.from("lines").select("*, line_members(player_id, slot)").eq("match_id", prev[0].match_id).eq("side", "own").order("sort"),
    ) as Line[];
    for (const l of src) {
      const created = must(
        await sb.from("lines").insert({ team_id: teamId, match_id: matchId, side: "own", name: l.name, hotkey: l.hotkey, sort: l.sort })
          .select("id").single(),
      ) as { id: string };
      const members = (l.line_members ?? []).map((m) => ({ line_id: created.id, player_id: m.player_id, team_id: teamId, slot: m.slot }));
      if (members.length) must(await sb.from("line_members").insert(members));
    }
    await load();
  }

  async function toggleMember(line: Line, playerId: string) {
    const isIn = line.line_members?.some((m) => m.player_id === playerId);
    await run(() =>
      isIn
        ? supabase().from("line_members").delete().eq("line_id", line.id).eq("player_id", playerId)
        : supabase().from("line_members").insert({ line_id: line.id, player_id: playerId, team_id: teamId }),
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {lines.map((line) => (
        <div key={line.id} className="card" data-testid="line-card">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-44"
              defaultValue={line.name}
              disabled={!canEdit}
              aria-label="Femmans namn"
              onBlur={(e) => e.target.value !== line.name && run(() => supabase().from("lines").update({ name: e.target.value }).eq("id", line.id))}
            />
            <label className="text-sm text-slate-600" htmlFor={`hk-${line.id}`}>Tangent</label>
            <select
              id={`hk-${line.id}`}
              className="input w-16"
              value={line.hotkey ?? ""}
              disabled={!canEdit}
              onChange={(e) => run(() => supabase().from("lines").update({ hotkey: e.target.value || null }).eq("id", line.id))}
            >
              <option value="">–</option>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <option key={k} value={k} disabled={usedKeys.has(k) && k !== line.hotkey}>{k}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">{line.line_members?.length ?? 0} spelare</span>
            {canEdit && (
              <button
                className="btn btn-sm btn-danger ml-auto"
                onClick={() => confirm(`Ta bort ${line.name}?`) && run(() => supabase().from("lines").delete().eq("id", line.id))}
              >
                Ta bort
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {players.map((p) => {
              const isIn = line.line_members?.some((m) => m.player_id === p.id);
              return (
                <button
                  key={p.id}
                  disabled={!canEdit}
                  onClick={() => toggleMember(line, p.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${isIn ? "border-blue-700 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
                >
                  {p.jersey_number != null ? `#${p.jersey_number} ` : ""}{p.name}
                </button>
              );
            })}
            {players.length === 0 && <span className="text-sm text-slate-500">Lägg till spelare under Lag & spelare först.</span>}
          </div>
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <button className="btn" onClick={addLine}>Lägg till femma</button>
          {lines.length === 0 && <button className="btn" onClick={copyFromPrevious}>Kopiera från senaste match</button>}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
