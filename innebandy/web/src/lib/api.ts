import { supabase } from "./supabase";

// Same-origin; /api is proxied to the API by vercel.json (production) or next.config.ts (dev).
const API = () => "/api";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Du är inte inloggad.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API()}${path}`, { ...init, headers: { ...(await authHeaders()), ...init.headers } });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).detail ?? msg;
    } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json() as Promise<T>;
}

export function getPlayback(videoId: string) {
  return call<{ url: string; poster_url: string | null; expires_in: number }>(`/videos/${videoId}/playback`);
}

export function retranscode(videoId: string) {
  return call<{ job_id: string }>(`/videos/${videoId}/transcode`, { method: "POST" });
}

export interface UploadProgress {
  sentBytes: number;
  totalBytes: number;
}

/**
 * Multipart upload straight to storage via presigned part URLs. Parts are
 * sent three at a time; a failed part is retried up to three times.
 */
export async function uploadVideo(
  videoId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<{ job_id: string }> {
  const init = await call<{ upload_id: string; part_size: number; part_count: number }>(
    `/videos/${videoId}/upload/init`,
    { method: "POST", body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type || "video/mp4" }) },
  );
  const sent = new Array<number>(init.part_count).fill(0);
  const report = () => onProgress({ sentBytes: sent.reduce((a, b) => a + b, 0), totalBytes: file.size });

  const urls: Record<number, string> = {};
  for (let i = 1; i <= init.part_count; i += 100) {
    const nums = Array.from({ length: Math.min(100, init.part_count - i + 1) }, (_, k) => i + k);
    const r = await call<{ urls: Record<string, string> }>(`/videos/${videoId}/upload/parts`, {
      method: "POST",
      body: JSON.stringify({ upload_id: init.upload_id, part_numbers: nums }),
    });
    for (const [k, v] of Object.entries(r.urls)) urls[Number(k)] = v;
  }

  const parts: { part_number: number; etag: string }[] = [];
  let next = 1;
  const worker = async () => {
    while (next <= init.part_count) {
      const n = next++;
      const blob = file.slice((n - 1) * init.part_size, Math.min(n * init.part_size, file.size));
      for (let attempt = 1; ; attempt++) {
        try {
          const etag = await putPart(urls[n], blob, (b) => {
            sent[n - 1] = b;
            report();
          }, signal);
          parts.push({ part_number: n, etag });
          break;
        } catch (e) {
          if (signal?.aborted || attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  return call<{ job_id: string }>(`/videos/${videoId}/upload/complete`, {
    method: "POST",
    body: JSON.stringify({ upload_id: init.upload_id, parts }),
  });
}

function putPart(url: string, blob: Blob, onBytes: (n: number) => void, signal?: AbortSignal): Promise<string> {
  // XHR rather than fetch: fetch has no upload progress events.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) {
        onBytes(blob.size);
        resolve(etag);
      } else reject(new Error(`Uppladdning av del misslyckades (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Nätverksfel vid uppladdning"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}
