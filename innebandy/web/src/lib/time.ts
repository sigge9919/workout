/** Video time as h:mm:ss.t or m:ss.t */
export function fmtVideo(s: number | null | undefined, decimals = 1): string {
  if (s == null || !Number.isFinite(s)) return "–";
  const sign = s < 0 ? "-" : "";
  const abs = Math.abs(s);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = abs % 60;
  const secStr = sec.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, "0");
  return h > 0
    ? `${sign}${h}:${String(m).padStart(2, "0")}:${secStr}`
    : `${sign}${m}:${secStr}`;
}

/** Match clock (elapsed seconds in period) as mm:ss. */
export function fmtClock(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "–";
  const t = Math.floor(s);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Parse "mm:ss" or "m:ss" or plain seconds. Returns null if invalid. */
export function parseClock(input: string): number | null {
  const v = input.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const m = /^(\d{1,3}):([0-5]?\d)(\.\d+)?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) : 0);
}

const STATE_LABELS: Record<string, string> = {
  pp: "PP",
  bp: "BP",
  en_own: "Tom kasse (vi)",
  en_opp: "Tom kasse (de)",
};

export function fmtGameState(key: string | null | undefined): string {
  if (!key) return "–";
  if (STATE_LABELS[key]) return STATE_LABELS[key];
  const m = /^(\d)v(\d)$/.exec(key);
  return m ? `${m[1]} mot ${m[2]}` : key;
}

export const ZONE_LABELS: Record<string, string> = {
  def: "Försvarszon",
  mid: "Mittzon",
  off: "Anfallszon",
};
