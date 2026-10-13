"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LinesEditor } from "@/components/LinesEditor";
import { VideoCard } from "@/components/VideoCard";
import { matchTitle } from "@/lib/format";
import { useTeam } from "@/lib/session";
import { must, supabase } from "@/lib/supabase";
import type { Match, Opponent, Video } from "@/lib/types";

const SOURCES: { value: Video["source_type"]; label: string }[] = [
  { value: "unknown", label: "Vet ej" },
  { value: "fixed", label: "Fast översiktskamera" },
  { value: "auto_cam", label: "AI-kamera (Veo/Pixellot)" },
  { value: "broadcast", label: "TV-sändning / stream" },
];

export default function MatchPage() {
  return (
    <AppShell>
      <MatchDetail />
    </AppShell>
  );
}

function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { team, canEdit } = useTeam();
  const [match, setMatch] = useState<(Match & { opponent: Opponent | null }) | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [source, setSource] = useState<Video["source_type"]>("unknown");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [m, v] = await Promise.all([
      sb.from("matches").select("*, opponent:opponents(*)").eq("id", id).maybeSingle(),
      sb.from("videos").select("*").eq("match_id", id).order("part_index"),
    ]);
    setMatch(must(m) as Match & { opponent: Opponent | null });
    setVideos(must(v) as Video[]);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function addVideo() {
    setError(null);
    const res = await supabase().from("videos").insert({
      team_id: team.id,
      match_id: id,
      part_index: videos.length + 1,
      source_type: source,
      title: videos.length === 0 ? "Hela matchen" : `Del ${videos.length + 1}`,
    });
    if (res.error) setError(res.error.message);
    load();
  }

  async function removeMatch() {
    if (!match || !confirm("Ta bort matchen med all video, alla taggar och klipp? Det går inte att ångra.")) return;
    const res = await supabase().from("matches").delete().eq("id", match.id);
    if (res.error) setError(res.error.message);
    else window.location.href = "/matcher";
  }

  if (!match) return <p className="text-sm text-slate-500">{error ?? "Laddar…"}</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/matcher" className="text-sm text-blue-700 hover:underline">← Matcher</Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold">{matchTitle(team.name, match)}</h1>
          <span className="text-sm text-slate-600">
            {new Date(match.played_at).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })}
            {match.competition ? ` · ${match.competition}` : ""}
            {match.venue ? ` · ${match.venue}` : ""}
          </span>
          {canEdit && <button className="btn btn-sm btn-danger ml-auto" onClick={removeMatch}>Ta bort match</button>}
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Video</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ladda upp hela matchen som en fil, eller en fil per period. Videon görs om till ett format som går snabbt att spola i.
        </p>
        <div className="mt-3 space-y-3">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} matchId={match.id} canEdit={canEdit} onChange={load} />
          ))}
        </div>
        {canEdit && (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <label className="label" htmlFor="source">Videokälla</label>
              <select id="source" className="input" value={source} onChange={(e) => setSource(e.target.value as Video["source_type"])}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button className="btn" onClick={addVideo}>
              {videos.length === 0 ? "Lägg till video" : "Lägg till ytterligare videodel"}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Femmor</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ange femmorna för matchen. Vid taggning trycker du femmans siffra när den går in. Då fylls vilka som var på plan i automatiskt.
        </p>
        <LinesEditor teamId={team.id} matchId={match.id} canEdit={canEdit} />
      </section>
    </div>
  );
}
