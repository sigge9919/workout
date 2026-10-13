"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useTeam } from "@/lib/session";
import { must, supabase } from "@/lib/supabase";
import type { Opponent, Player } from "@/lib/types";

const POSITIONS: { value: Player["position"]; label: string }[] = [
  { value: null, label: "–" },
  { value: "F", label: "Forward" },
  { value: "C", label: "Center" },
  { value: "B", label: "Back" },
  { value: "MV", label: "Målvakt" },
];

export default function TeamPage() {
  return (
    <AppShell>
      <TeamContent />
    </AppShell>
  );
}

function TeamContent() {
  const { team, canEdit } = useTeam();
  const [players, setPlayers] = useState<Player[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [openOpp, setOpenOpp] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [p, o] = await Promise.all([
      sb.from("players").select("*").eq("team_id", team.id).order("jersey_number", { nullsFirst: false }),
      sb.from("opponents").select("*").eq("team_id", team.id).order("name"),
    ]);
    setPlayers(must(p) as Player[]);
    setOpponents(must(o) as Opponent[]);
  }, [team.id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const own = players.filter((p) => !p.opponent_id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Trupp – {team.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Spelarna används i femmor, vid taggning och i statistik. Tröjnumret används senare för automatisk identifiering.
        </p>
        <PlayerTable players={own} teamId={team.id} opponentId={null} canEdit={canEdit} onChange={load} />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Motståndare</h2>
        <p className="mt-1 text-sm text-slate-600">
          Motståndarnas spelare är valfria. Lägg in dem om du vill tagga individuella motståndare eller deras femmor.
        </p>
        {canEdit && <AddOpponent teamId={team.id} onAdded={load} />}
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {opponents.length === 0 && <li className="p-3 text-sm text-slate-500">Inga motståndare ännu.</li>}
          {opponents.map((o) => (
            <li key={o.id} className="p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{o.name}</span>
                <span className="text-xs text-slate-500">
                  {players.filter((p) => p.opponent_id === o.id).length} spelare
                </span>
                <button className="btn btn-sm ml-auto" onClick={() => setOpenOpp(openOpp === o.id ? null : o.id)}>
                  {openOpp === o.id ? "Dölj" : "Visa spelare"}
                </button>
              </div>
              {openOpp === o.id && (
                <PlayerTable
                  players={players.filter((p) => p.opponent_id === o.id)}
                  teamId={team.id}
                  opponentId={o.id}
                  canEdit={canEdit}
                  onChange={load}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AddOpponent({ teamId, onAdded }: { teamId: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const res = await supabase().from("opponents").insert({ team_id: teamId, name: name.trim() });
        if (res.error) setError(res.error.code === "23505" ? "Motståndaren finns redan." : res.error.message);
        else {
          setName("");
          onAdded();
        }
      }}
    >
      <input className="input max-w-xs" placeholder="Nytt motståndarlag" value={name} onChange={(e) => setName(e.target.value)} required />
      <button className="btn">Lägg till</button>
      {error && <span className="self-center text-sm text-red-700">{error}</span>}
    </form>
  );
}

function PlayerTable({
  players, teamId, opponentId, canEdit, onChange,
}: {
  players: Player[];
  teamId: string;
  opponentId: string | null;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await supabase().from("players").insert({
      team_id: teamId,
      opponent_id: opponentId,
      name: name.trim(),
      jersey_number: number === "" ? null : Number(number),
      position: position || null,
    });
    if (res.error) setError(res.error.message);
    else {
      setName("");
      setNumber("");
      setPosition("");
      onChange();
    }
  }

  async function update(p: Player, patch: Partial<Player>) {
    const res = await supabase().from("players").update(patch).eq("id", p.id);
    if (res.error) setError(res.error.message);
    onChange();
  }

  async function remove(p: Player) {
    if (!confirm(`Ta bort ${p.name}? Spelaren tas även bort från taggar och femmor.`)) return;
    const res = await supabase().from("players").delete().eq("id", p.id);
    if (res.error) setError(res.error.message);
    onChange();
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="w-16 px-3 py-2">Nr</th>
            <th className="px-3 py-2">Namn</th>
            <th className="w-36 px-3 py-2">Position</th>
            <th className="w-20 px-3 py-2">Aktiv</th>
            <th className="w-24 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {players.map((p) => (
            <tr key={p.id} className={p.active ? "" : "text-slate-400"}>
              <td className="px-3 py-1.5">
                <input
                  className="input w-14 px-1.5 py-0.5"
                  defaultValue={p.jersey_number ?? ""}
                  disabled={!canEdit}
                  inputMode="numeric"
                  aria-label={`Nummer för ${p.name}`}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== p.jersey_number) update(p, { jersey_number: v });
                  }}
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  className="input px-1.5 py-0.5"
                  defaultValue={p.name}
                  disabled={!canEdit}
                  aria-label="Namn"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && update(p, { name: e.target.value.trim() })}
                />
              </td>
              <td className="px-3 py-1.5">
                <select
                  className="input px-1.5 py-0.5"
                  value={p.position ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => update(p, { position: (e.target.value || null) as Player["position"] })}
                >
                  {POSITIONS.map((o) => (
                    <option key={o.label} value={o.value ?? ""}>{o.label}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <input type="checkbox" checked={p.active} disabled={!canEdit} onChange={(e) => update(p, { active: e.target.checked })} />
              </td>
              <td className="px-3 py-1.5 text-right">
                {canEdit && (
                  <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>Ta bort</button>
                )}
              </td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-3 text-slate-500">Inga spelare ännu.</td>
            </tr>
          )}
        </tbody>
      </table>
      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-slate-200 bg-slate-50 p-3">
          <div>
            <label className="label" htmlFor={`nr-${opponentId ?? "own"}`}>Nr</label>
            <input id={`nr-${opponentId ?? "own"}`} className="input w-16" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor={`name-${opponentId ?? "own"}`}>Namn</label>
            <input id={`name-${opponentId ?? "own"}`} className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor={`pos-${opponentId ?? "own"}`}>Position</label>
            <select id={`pos-${opponentId ?? "own"}`} className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((o) => (
                <option key={o.label} value={o.value ?? ""}>{o.label}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary">Lägg till spelare</button>
          {error && <span className="text-sm text-red-700">{error}</span>}
        </form>
      )}
    </div>
  );
}
