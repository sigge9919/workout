"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useTeam } from "@/lib/session";
import { must, supabase } from "@/lib/supabase";
import { matchTitle } from "@/lib/format";
import type { Match, Opponent } from "@/lib/types";

type MatchRow = Match & { opponent: Opponent | null; videos: { status: string }[]; events: { count: number }[] };

export default function MatchesPage() {
  return (
    <AppShell>
      <Matches />
    </AppShell>
  );
}

function Matches() {
  const { team, canEdit } = useTeam();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const data = must(
      await supabase()
        .from("matches")
        .select("*, opponent:opponents(*), videos(status), events(count)")
        .eq("team_id", team.id)
        .order("played_at", { ascending: false }),
    ) as MatchRow[];
    setRows(data);
  }, [team.id]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  return (
    <div>
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">Matcher</h1>
        {canEdit && (
          <button className="btn btn-primary ml-auto" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Avbryt" : "Ny match"}
          </button>
        )}
      </div>
      {showForm && <NewMatch teamId={team.id} />}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">Tävling</th>
              <th className="px-3 py-2">Video</th>
              <th className="px-3 py-2 text-right">Taggar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(m.played_at).toLocaleDateString("sv-SE")}</td>
                <td className="px-3 py-2">
                  <Link href={`/matcher/${m.id}`} className="font-medium text-blue-700 hover:underline">
                    {matchTitle(team.name, m)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{m.competition ?? "–"}</td>
                <td className="px-3 py-2 text-slate-600">{videoSummary(m.videos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.events[0]?.count ?? 0}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Inga matcher ännu. Skapa en match och ladda upp videon.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function videoSummary(videos: { status: string }[]) {
  if (videos.length === 0) return "Ingen video";
  if (videos.every((v) => v.status === "ready")) return videos.length === 1 ? "Klar" : `${videos.length} delar, klara`;
  if (videos.some((v) => v.status === "failed")) return "Fel vid bearbetning";
  return "Bearbetas";
}

function NewMatch({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [opponentId, setOpponentId] = useState("");
  const [newOpponent, setNewOpponent] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");
  const [isHome, setIsHome] = useState(true);
  const [competition, setCompetition] = useState("SSL");
  const [venue, setVenue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase().from("opponents").select("*").eq("team_id", teamId).order("name")
      .then(({ data }) => setOpponents((data as Opponent[]) ?? []));
  }, [teamId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sb = supabase();
      let oppId = opponentId || null;
      if (!oppId && newOpponent.trim()) {
        oppId = (must(await sb.from("opponents").insert({ team_id: teamId, name: newOpponent.trim() }).select("id").single()) as { id: string }).id;
      }
      const m = must(
        await sb.from("matches").insert({
          team_id: teamId,
          opponent_id: oppId,
          played_at: new Date(`${date}T${time}`).toISOString(),
          is_home: isHome,
          competition: competition || null,
          venue: venue || null,
        }).select("id").single(),
      ) as { id: string };
      router.push(`/matcher/${m.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label className="label" htmlFor="opp">Motståndare</label>
        <select id="opp" className="input" value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
          <option value="">– Ny motståndare –</option>
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>
      {!opponentId && (
        <div>
          <label className="label" htmlFor="newopp">Namn på ny motståndare</label>
          <input id="newopp" className="input" value={newOpponent} onChange={(e) => setNewOpponent(e.target.value)} required />
        </div>
      )}
      <div>
        <label className="label">Hemma/borta</label>
        <div className="flex gap-3 pt-1.5 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={isHome} onChange={() => setIsHome(true)} /> Hemma</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={!isHome} onChange={() => setIsHome(false)} /> Borta</label>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="date">Datum</label>
        <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="time">Tid</label>
        <input id="time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="comp">Tävling</label>
        <input id="comp" className="input" value={competition} onChange={(e) => setCompetition(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="venue">Arena</label>
        <input id="venue" className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </div>
      <div className="flex items-end gap-3 md:col-span-3">
        <button className="btn btn-primary" disabled={busy}>Skapa match</button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}
