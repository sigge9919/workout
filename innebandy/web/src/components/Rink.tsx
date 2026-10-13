"use client";

/**
 * Floorball rink, 40 × 20 m, own team attacking to the right (x = 40).
 * Markings follow IFF rules closely enough for tagging: goal lines 3.5 m from
 * the end boards, goal area 4 × 5 m, goalkeeper area 1 × 2.5 m, centre spot
 * and face-off dots on the centre line and goal-line extensions 1.5 m from
 * the long boards. Zone thirds are a coaching convention.
 */

export interface RinkPoint {
  x: number;
  y: number;
  color?: string;
  id?: string;
}

const W = 40;
const H = 20;

export function Rink({
  points = [],
  selected,
  onPick,
  className = "",
  showZones = true,
}: {
  points?: RinkPoint[];
  selected?: { x: number; y: number } | null;
  onPick?: (x: number, y: number) => void;
  className?: string;
  showZones?: boolean;
}) {
  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onPick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const x = Math.min(Math.max(p.x, 0), W);
    const y = Math.min(Math.max(p.y, 0), H);
    onPick(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  const stroke = "#94a3b8";
  return (
    <svg
      viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`}
      className={`select-none ${onPick ? "cursor-crosshair" : ""} ${className}`}
      onClick={handleClick}
      role={onPick ? "button" : "img"}
      aria-label="Planskiss"
      data-testid="rink"
    >
      <rect x={0} y={0} width={W} height={H} rx={3} fill="#f8fafc" stroke="#475569" strokeWidth={0.15} />
      {showZones && (
        <>
          <rect x={0} y={0} width={W / 3} height={H} fill="#ef4444" opacity={0.04} />
          <rect x={(2 * W) / 3} y={0} width={W / 3} height={H} fill="#22c55e" opacity={0.05} />
          <line x1={W / 3} y1={0} x2={W / 3} y2={H} stroke={stroke} strokeWidth={0.05} strokeDasharray="0.4 0.4" />
          <line x1={(2 * W) / 3} y1={0} x2={(2 * W) / 3} y2={H} stroke={stroke} strokeWidth={0.05} strokeDasharray="0.4 0.4" />
          <text x={W / 6} y={H - 0.8} fontSize={0.9} textAnchor="middle" fill="#94a3b8">Försvarszon</text>
          <text x={W / 2} y={H - 0.8} fontSize={0.9} textAnchor="middle" fill="#94a3b8">Mittzon</text>
          <text x={(5 * W) / 6} y={H - 0.8} fontSize={0.9} textAnchor="middle" fill="#94a3b8">Anfallszon →</text>
        </>
      )}
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke={stroke} strokeWidth={0.1} />
      <circle cx={W / 2} cy={H / 2} r={0.2} fill={stroke} />
      {[3.5, W - 3.5].map((gx) => (
        <g key={gx}>
          {/* Goal area 4 m deep (from 2.85 m), 5 m wide; goalkeeper area 1 × 2.5 m. */}
          <rect x={gx < W / 2 ? 2.85 : W - 2.85 - 4} y={H / 2 - 2.5} width={4} height={5} fill="none" stroke={stroke} strokeWidth={0.08} />
          <rect x={gx < W / 2 ? 3.15 : W - 3.15 - 1} y={H / 2 - 1.25} width={1} height={2.5} fill="none" stroke={stroke} strokeWidth={0.08} />
          <rect x={gx < W / 2 ? gx - 0.65 : gx} y={H / 2 - 0.8} width={0.65} height={1.6} fill="#cbd5e1" stroke="#64748b" strokeWidth={0.05} />
          <circle cx={gx} cy={1.5} r={0.15} fill={stroke} />
          <circle cx={gx} cy={H - 1.5} r={0.15} fill={stroke} />
        </g>
      ))}
      <circle cx={W / 2} cy={1.5} r={0.15} fill={stroke} />
      <circle cx={W / 2} cy={H - 1.5} r={0.15} fill={stroke} />

      {points.map((p, i) => (
        <circle key={p.id ?? i} cx={p.x} cy={p.y} r={0.45} fill={p.color ?? "#2563eb"} opacity={0.75} />
      ))}
      {selected && (
        <g pointerEvents="none">
          <circle cx={selected.x} cy={selected.y} r={0.7} fill="none" stroke="#0f172a" strokeWidth={0.15} />
          <circle cx={selected.x} cy={selected.y} r={0.25} fill="#0f172a" />
        </g>
      )}
    </svg>
  );
}
