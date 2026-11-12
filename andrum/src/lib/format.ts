/** 125000 → "2:05" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 600000 → "10 min", 90000 → "1,5 min", 45000 → "45 s" */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round((s / 60) * 2) / 2;
  return `${min.toLocaleString('sv-SE')} min`;
}

/** 5.5 → "5,5" */
export function formatNumber(n: number, maxDecimals = 1): string {
  return n.toLocaleString('sv-SE', { maximumFractionDigits: maxDecimals });
}
