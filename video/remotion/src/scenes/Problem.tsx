import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Airspace, planConflicts, planCost } from '../components/Airspace';
import { Tag } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, COND, lerp, ramp } from '../theme';

/** Battery against separation as a balance beam that keeps tipping */
const Balance: React.FC<{ f: number; o: number }> = ({ f, o }) => {
  const ang = 7 * Math.sin(f / 22);
  const cx = 960, cy = 470, L = 470;
  const dx = Math.cos(ang * Math.PI / 180) * L, dy = Math.sin(ang * Math.PI / 180) * L;
  return (
    <g opacity={o}>
      <path d={`M${cx - 60} ${cy + 230} L${cx} ${cy + 8} L${cx + 60} ${cy + 230} Z`} fill={C.ink} />
      <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} stroke={C.ink} strokeWidth={14} strokeLinecap="round" />
      {[-1, 1].map(s => {
        const px = cx + s * dx, py = cy + s * dy;
        return (
          <g key={s}>
            <line x1={px} y1={py} x2={px} y2={py + 90} stroke={C.ink} strokeWidth={4} />
            <path d={`M${px - 130} ${py + 90} Q ${px} ${py + 150} ${px + 130} ${py + 90} Z`} fill={C.panel} stroke={C.ink} strokeWidth={4} />
          </g>
        );
      })}
      {/* battery on the left pan */}
      <g transform={`translate(${cx - dx - 60} ${cy - dy - 30})`}>
        <rect x={0} y={0} width={110} height={56} rx={8} fill="none" stroke={C.ink} strokeWidth={5} />
        <rect x={110} y={16} width={12} height={24} rx={3} fill={C.ink} />
        <rect x={8} y={8} width={48 + 40 * (0.5 + 0.5 * Math.sin(f / 22))} height={40} rx={4} fill={C.good} />
      </g>
      {/* two drones held apart on the right pan */}
      <g transform={`translate(${cx + dx} ${cy + dy - 6})`}>
        {[-48, 48].map((x, i) => (
          <g key={i} transform={`translate(${x} 0)`}>
            {[[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([a, b], k) => <circle key={k} cx={a} cy={b} r={8} fill={C.panel} stroke={C.drones[i * 2]} strokeWidth={3} />)}
            <rect x={-7} y={-7} width={14} height={14} rx={3} fill={C.drones[i * 2]} />
          </g>
        ))}
        <path d="M-22 -34 L22 -34" stroke={C.magenta} strokeWidth={4} markerEnd="" />
        <path d="M-22 -40 L-30 -34 L-22 -28 M22 -40 L30 -34 L22 -28" fill="none" stroke={C.magenta} strokeWidth={4} />
      </g>
      <text x={cx - dx} y={cy - dy + 210} textAnchor="middle" fontFamily={COND} fontSize={50} fontWeight={700} fill={C.ink}>Less battery</text>
      <text x={cx + dx} y={cy + dy + 210} textAnchor="middle" fontFamily={COND} fontSize={50} fontWeight={700} fill={C.ink}>More separation</text>
    </g>
  );
};

const PLANS = [[0, 0, 0], [0, 1, 0], [0, 1, 1]];

const Explosion: React.FC<{ f: number; a: number; b: number }> = ({ f, a, b }) => {
  const t1 = ramp(f, a, a + 26);
  const mid = a + (b - a) * 0.42;
  const t2 = ramp(f, mid, mid + (b - mid) * 0.62);
  const big = 95367431640625; // 5^20
  const shown = Math.floor(Math.pow(big, t2));
  const tiles = Math.round(27 * t1);
  return (
    <g>
      <g opacity={Math.min(1, t1 * 2)}>
        <text x={500} y={300} textAnchor="middle" fontFamily={COND} fontSize={200} fontWeight={700} fill={C.ink}>27</text>
        <text x={500} y={360} textAnchor="middle" fontSize={34} fill={C.inkSoft}>plans for 3 drones, 3 routes each</text>
        {Array.from({ length: 27 }, (_, k) => (
          <rect key={k} x={280 + (k % 9) * 50} y={430 + Math.floor(k / 9) * 50} width={40} height={40} rx={6}
            fill={C.drones[Math.floor(k / 9)]} opacity={k < tiles ? 0.85 : 0.08} />
        ))}
      </g>
      <g opacity={t2 > 0 ? Math.min(1, t2 * 4) : 0}>
        <text x={1400} y={300} textAnchor="middle" fontFamily={COND} fontSize={118} fontWeight={700} fill={C.magenta}>{shown.toLocaleString('en-US')}</text>
        <text x={1400} y={360} textAnchor="middle" fontSize={34} fill={C.inkSoft}>plans for 20 drones, 5 routes each</text>
        {Array.from({ length: 360 }, (_, k) => {
          const show = k / 360 < t2;
          return <rect key={k} x={1080 + (k % 30) * 21.5} y={420 + Math.floor(k / 30) * 21.5} width={16} height={16} rx={3}
            fill={C.drones[k % 3]} opacity={show ? 0.75 : 0} />;
        })}
        <text x={1400} y={720} textAnchor="middle" fontSize={28} fill={C.inkSoft} opacity={t2}>each square here stands for over 260 billion plans</text>
      </g>
    </g>
  );
};

export const Problem: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [p0, p1, p2] = cues;
  const balanceO = Math.min(ramp(f, p0, p0 + 14), 1 - ramp(f, p1 - 10, p1 + 2));
  const mapO = Math.min(ramp(f, p1, p1 + 12), 1 - ramp(f, p2 - 8, p2 + 4));
  const L1 = ends[1] - p1;
  const idx = f < p1 + L1 * 0.33 ? 0 : f < p1 + L1 * 0.66 ? 1 : 2;
  const plan = PLANS[idx];
  const swapAt = idx === 0 ? p1 : p1 + L1 * (idx === 1 ? 0.33 : 0.66);
  const size = 560, ax = 330, ay = 210;
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Balance f={f} o={balanceO} />
        <g opacity={mapO}>
          <Airspace x={ax} y={ay} size={size} candidates={[[1, 1, 1], [1, 1, 1], [1, 1, 1]]} candidateOpacity={0.12}
            choice={plan} choiceDraw={1} fly={ramp(f, swapAt, swapAt + 40)} shared={1} pulse={f} />
          <text x={1130} y={330} fontFamily={COND} fontSize={46} fontWeight={700} fill={C.ink}>Change one drone's route...</text>
          <text x={1130} y={430} fontSize={40} fill={C.ink}>Battery cost: <tspan fontWeight={700}>{planCost(plan)}</tspan></text>
          <text x={1130} y={500} fontSize={40} fill={C.ink}>Shared segments: <tspan fontWeight={700} fill={C.magenta}>{planConflicts(plan)}</tspan></text>
          <text x={1130} y={600} fontFamily={COND} fontSize={46} fontWeight={700} fill={C.ink} opacity={ramp(f, p1 + L1 * 0.4, p1 + L1 * 0.5)}>...and the others are affected.</text>
          <Tag x={1130} y={700} o={ramp(f, p1 + L1 * 0.7, p1 + L1 * 0.8)} title="Routes must be chosen together" color={C.airway} size={36} />
        </g>
        <g opacity={ramp(f, p2, p2 + 10)}>
          <Explosion f={f} a={p2} b={ends[2]} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
