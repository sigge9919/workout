"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { retranscode, uploadVideo } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { fmtVideo } from "@/lib/time";
import type { Job, Video } from "@/lib/types";

const STATUS: Record<Video["status"], string> = {
  created: "Ingen fil uppladdad",
  uploading: "Uppladdning påbörjad",
  uploaded: "Uppladdad, väntar på bearbetning",
  processing: "Bearbetas",
  ready: "Klar",
  failed: "Fel",
};

export function VideoCard({ video, matchId, canEdit, onChange }: {
  video: Video;
  matchId: string;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Poll the latest job while the video is being processed.
  const busy = video.status === "uploaded" || video.status === "processing";
  useEffect(() => {
    if (!busy) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase()
        .from("jobs").select("id, video_id, kind, status, progress, message, created_at").eq("video_id", video.id).order("created_at", { ascending: false }).limit(1);
      if (stop) return;
      const j = (data?.[0] as Job | undefined) ?? null;
      setJob(j);
      if (j && (j.status === "succeeded" || j.status === "failed")) onChange();
      else setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [busy, video.id, onChange]);

  async function onFile(file: File) {
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      await uploadVideo(video.id, file, (p) => setProgress(p.sentBytes / p.totalBytes), abort.current.signal);
      setProgress(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
      onChange();
    }
  }

  const canUpload = canEdit && progress == null && (video.status === "created" || video.status === "uploading" || (video.status === "failed" && !video.duration_s));

  return (
    <div className="card flex flex-wrap items-center gap-4" data-testid="video-card">
      <div className="min-w-56">
        <div className="font-medium">{video.title ?? `Del ${video.part_index}`}</div>
        <div className="text-sm text-slate-600" data-testid="video-status">
          {STATUS[video.status]}
          {video.status === "ready" && video.duration_s
            ? ` · ${fmtVideo(video.duration_s, 0)} · ${video.width}×${video.height} · ${Math.round(video.fps ?? 0)} fps`
            : ""}
        </div>
        {video.status === "failed" && video.error && <div className="text-sm text-red-700">{video.error}</div>}
      </div>

      {progress != null && (
        <div className="flex min-w-64 flex-1 items-center gap-3">
          <Bar value={progress} />
          <span className="text-sm tabular-nums">{Math.round(progress * 100)} %</span>
          <button className="btn btn-sm" onClick={() => abort.current?.abort()}>Avbryt</button>
        </div>
      )}

      {busy && (
        <div className="flex min-w-64 flex-1 items-center gap-3">
          <Bar value={job?.progress ?? 0} />
          <span className="text-sm text-slate-600">{job?.message ?? "I kö"} · {Math.round((job?.progress ?? 0) * 100)} %</span>
        </div>
      )}

      <div className="ml-auto flex gap-2">
        {canUpload && (
          <label className="btn btn-primary cursor-pointer">
            Välj videofil
            <input
              type="file"
              accept="video/*,.mts,.mkv"
              className="hidden"
              data-testid="video-file"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        )}
        {canEdit && video.status === "failed" && video.error && (
          <button className="btn" onClick={() => retranscode(video.id).then(onChange, (e) => setError(e.message))}>
            Försök igen
          </button>
        )}
        {video.status === "ready" && (
          <Link className="btn btn-primary" href={`/matcher/${matchId}/tagga?video=${video.id}`}>
            Öppna taggning
          </Link>
        )}
      </div>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}
