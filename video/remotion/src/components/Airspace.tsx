import React from 'react';
import data from '../data.json';
import { C } from '../theme';

type Cell = number[];
const inst = data.instance;
export const CORRIDORS = inst.corridors as Cell[][][];
export const COST = inst.cost as number[][];

const key = (a: Cell, b: Cell) => [String(a), String(b)].sort().join('|');
export const edgesOf = (path: Cell[]) => path.slice(0, -1).map((c, k) => key(c, path[k + 1]));

/** segments flown by 2+ of the chosen corridors */
export function sharedEdges(choice: number[]) {
  const count = new Map<string, number>();
  choice.forEach((p, i) => edgesOf(CORRIDORS[i][p]).forEach(e => count.set(e, (count.get(e) || 0) + 1)));
  return [...count].filter(([, n]) => n > 1).map(([e]) => e.split('|').map(s => s.split(',').map(Number)));
}

export const planCost = (choice: number[]) => choice.reduce((s, p, i) => s + COST[i][p], 0);
export const planConflicts = (choice: number[]) => {
  let k = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) k += inst.shared[i * 3 + choice[i]][j * 3 + choice[j]];
  return k;
};

export type AirspaceProps = {
  x: number; y: number; size: number;
  grid?: number;               // 0..1 grid reveal
  candidates?: number[][];     // per drone: draw progress (0..1) of each candidate corridor
  candidateOpacity?: number;
  choice?: number[] | null;    // chosen corridor per drone
  choiceDraw?: number;         // 0..1 draw-in of chosen routes
  fly?: number;                // 0..1 drone position along chosen routes
  shared?: number;             // 0..1 strength of shared-segment highlight
  pulse?: number;              // frame counter for pulsing
  costs?: number;              // 0..1 opacity of segment costs
  wind?: number;               // 0..1 headwind streaks on cost-3 segments
  dronesAt?: number;           // 0..1 opacity of drones/markers
  highlightCorridor?: [number, number] | null; // [drone, corridor] glow
};

export const Quad: React.FC<{ x: number; y: number; color: string; s?: number; rot?: number }> = ({ x, y, color, s = 1, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    {[[-13, -13], [13, -13], [-13, 13], [13, 13]].map(([a, b], i) => (
      <g key={i}>
        <line x1={0} y1={0} x2={a} y2={b} stroke={C.ink} strokeWidth={3.2} />
        <circle cx={a} cy={b} r={8.5} fill={C.panel} stroke={color} strokeWidth={3} />
      </g>
    ))}
    <rect x={-8} y={-8} width={16} height={16} rx={4} fill={color} stroke={C.ink} strokeWidth={2} />
    <path d="M10 0 L4 -4 L4 4 Z" fill={C.ink} />
  </g>
);

export const Airspace: React.FC<AirspaceProps> = ({
  x, y, size, grid = 1, candidates, candidateOpacity = 0.22, choice = null, choiceDraw = 1, fly = 0,
  shared = 0, pulse = 0, costs = 0, wind = 0, dronesAt = 1, highlightCorridor = null,
}) => {
  const n = inst.grid, step = size / (n - 1);
  const pt = (c: Cell) => [x + c[1] * step, y + c[0] * step];
  const off = (i: number) => (i - 1) * size * 0.012;
  const polyLen = (pts: number[][]) => pts.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0);
  const ptsOf = (i: number, p: number) => CORRIDORS[i][p].map(c => pt(c).map(v => v + off(i)));

  const along = (pts: number[][], t: number) => {
    const L = polyLen(pts);
    let d = Math.max(0, Math.min(1, t)) * L;
    for (let k = 0; k + 1 < pts.length; k++) {
      const seg = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      if (d <= seg || k + 2 === pts.length) {
        const u = seg ? Math.min(1, d / seg) : 0;
        return { x: pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, y: pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u,
          rot: Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]) * 180 / Math.PI };
      }
      d -= seg;
    }
    return { x: pts[0][0], y: pts[0][1], rot: 0 };
  };

  const sh = choice ? sharedEdges(choice) : [];
  const pul = 0.55 + 0.45 * Math.sin(pulse / 5);
  return (
    <g>
      {/* chart grid */}
      <g opacity={grid}>
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <line x1={x - step * 0.3} x2={x + size + step * 0.3} y1={y + i * step} y2={y + i * step} stroke={C.rule} strokeWidth={2} />
            <line y1={y - step * 0.3} y2={y + size + step * 0.3} x1={x + i * step} x2={x + i * step} stroke={C.rule} strokeWidth={2} />
          </g>
        ))}
      </g>
      {/* headwind streaks on the most expensive segments */}
      {wind > 0 && inst.segments.filter(s => s.w === 3).map((s, k) => {
        const [x1, y1] = pt(s.a), [x2, y2] = pt(s.b);
        const horiz = y1 === y2;
        return (
          <g key={k} opacity={wind}>
            {[-1, 0, 1].map(j => {
              const sh = ((pulse * 2.2 + j * 22 + k * 13) % 60) - 30;
              const cx = (x1 + x2) / 2 + (horiz ? sh : j * 14), cy = (y1 + y2) / 2 + (horiz ? j * 14 : sh);
              return <path key={j} d={horiz ? `M${cx + 14} ${cy} q -10 -6 -24 0` : `M${cx} ${cy + 14} q 6 -10 0 -24`}
                fill="none" stroke={C.inkSoft} strokeWidth={3} strokeLinecap="round" opacity={0.75} />;
            })}
          </g>
        );
      })}
      {/* candidate corridors */}
      {candidates && CORRIDORS.map((cs, i) => cs.map((_, p) => {
        const t = candidates[i]?.[p] ?? 0;
        if (t <= 0) return null;
        const pts = ptsOf(i, p), L = polyLen(pts);
        const hi = highlightCorridor && highlightCorridor[0] === i && highlightCorridor[1] === p;
        return <polyline key={`${i}${p}`} points={pts.map(v => v.join(',')).join(' ')} fill="none" stroke={C.drones[i]}
          strokeOpacity={hi ? 0.9 : candidateOpacity} strokeWidth={hi ? 14 : 12} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={L} strokeDashoffset={L * (1 - t)} />;
      }))}
      {/* shared airspace */}
      {shared > 0 && sh.map(([a, b], k) => {
        const [x1, y1] = pt(a), [x2, y2] = pt(b);
        return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.magenta} strokeWidth={size * 0.07} strokeOpacity={0.32 * shared * pul} strokeLinecap="round" />;
      })}
      {/* chosen routes */}
      {choice && choice.map((p, i) => {
        const pts = ptsOf(i, p), L = polyLen(pts);
        return <polyline key={i} points={pts.map(v => v.join(',')).join(' ')} fill="none" stroke={C.drones[i]} strokeWidth={size * 0.012 + 3}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={L} strokeDashoffset={L * (1 - choiceDraw)} />;
      })}
      {/* segment costs */}
      {costs > 0 && inst.segments.map((s, k) => {
        const [x1, y1] = pt(s.a), [x2, y2] = pt(s.b), horiz = y1 === y2;
        return <text key={k} x={(x1 + x2) / 2 + (horiz ? 0 : 16)} y={(y1 + y2) / 2 + (horiz ? -14 : 6)} fontSize={size * 0.04} fontWeight={600}
          fill={C.inkSoft} textAnchor={horiz ? 'middle' : 'start'} opacity={costs} stroke={C.paper} strokeWidth={5} paintOrder="stroke">{s.w}</text>;
      })}
      {/* starts, goals and drones */}
      <g opacity={dronesAt}>
        {inst.drones.map(([s, t], i) => {
          const [sx, sy] = pt(s), [tx, ty] = pt(t);
          return (
            <g key={i}>
              <rect x={tx - 12} y={ty - 12} width={24} height={24} rx={4} fill={C.drones[i]} stroke={C.ink} strokeWidth={2} />
              <circle cx={sx} cy={sy} r={24} fill={C.panel} stroke={C.drones[i]} strokeWidth={4} />
              <text x={sx} y={sy + 8} textAnchor="middle" fontSize={22} fontWeight={700} fill={C.drones[i]}>D{i + 1}</text>
            </g>
          );
        })}
        {choice && choice.map((p, i) => {
          if (fly <= 0) return null;
          const a = along(ptsOf(i, p), fly);
          return <Quad key={i} x={a.x} y={a.y} rot={a.rot} color={C.drones[i]} s={size / 520} />;
        })}
      </g>
    </g>
  );
};
