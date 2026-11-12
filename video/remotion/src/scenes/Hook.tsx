import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Airspace, planConflicts } from '../components/Airspace';
import { Tag } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, lerp, ramp } from '../theme';

const POLES = [210, 720, 1230, 1740];

const Storm: React.FC<{ f: number; snap: number }> = ({ f, snap }) => {
  const flash = f > snap - 3 && f < snap + 4 ? 0.55 * (1 - Math.abs(f - snap) / 4) : 0;
  const top = 430, base = 900;
  return (
    <g>
      <rect x={0} y={0} width={1920} height={1080} fill={C.storm} opacity={0.18} />
      {/* clouds */}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const cx = ((i * 380 + f * (1.2 + (i % 3) * 0.4)) % 2400) - 240, cy = 120 + (i % 2) * 70;
        return (
          <g key={i} opacity={0.85} fill={i % 2 ? '#56607A' : '#465069'}>
            <ellipse cx={cx} cy={cy} rx={190} ry={62} />
            <ellipse cx={cx - 110} cy={cy + 22} rx={120} ry={46} />
            <ellipse cx={cx + 120} cy={cy + 18} rx={130} ry={50} />
          </g>
        );
      })}
      {/* rain */}
      {Array.from({ length: 70 }, (_, k) => {
        const x = (k * 137 + f * 9) % 1980 - 30, y = ((k * 263 + f * 26) % 900) + 140;
        return <line key={k} x1={x} y1={y} x2={x - 9} y2={y + 30} stroke="#6E7A94" strokeWidth={2.4} opacity={0.5} />;
      })}
      {/* lightning bolt */}
      {flash > 0 && <path d="M1010 160 L960 330 L1010 330 L950 480" fill="none" stroke="#FFF6C8" strokeWidth={9} strokeLinejoin="round" />}
      {/* poles and wires */}
      {POLES.map((x, i) => (
        <g key={i}>
          <rect x={x - 9} y={top} width={18} height={base - top} fill="#5B4A3A" />
          <rect x={x - 70} y={top + 18} width={140} height={12} fill="#5B4A3A" />
          {[-58, 0, 58].map(d => <circle key={d} cx={x + d} cy={top + 14} r={7} fill="#D9DED8" stroke={C.ink} strokeWidth={2} />)}
        </g>
      ))}
      {POLES.slice(0, -1).map((x, i) => [-58, 0, 58].map(d => {
        const x1 = x + d, x2 = POLES[i + 1] + d, y = top + 14;
        const broken = i === 1 && d === 0;
        if (!broken) return <path key={`${i}${d}`} d={`M${x1} ${y} Q ${(x1 + x2) / 2} ${y + 70} ${x2} ${y}`} fill="none" stroke={C.ink} strokeWidth={3.5} />;
        const t = ramp(f, snap, snap + 14);
        const mid = (x1 + x2) / 2;
        return (
          <g key={`${i}${d}`}>
            <path d={`M${x1} ${y} Q ${lerp(mid - 120, x1 + 40, t)} ${lerp(y + 60, y + 260, t)} ${lerp(mid - 8, x1 + 30, t)} ${lerp(y + 66, y + 330, t)}`} fill="none" stroke={C.ink} strokeWidth={3.5} />
            <path d={`M${x2} ${y} Q ${lerp(mid + 120, x2 - 40, t)} ${lerp(y + 60, y + 260, t)} ${lerp(mid + 8, x2 - 30, t)} ${lerp(y + 66, y + 330, t)}`} fill="none" stroke={C.ink} strokeWidth={3.5} />
            {f > snap && Array.from({ length: 9 }, (_, k) => {
              const a = (k / 9) * Math.PI * 2 + f * 0.7, r = 10 + ((f * 7 + k * 11) % 26);
              const sx = lerp(mid - 8, x1 + 30, t), sy = lerp(y + 66, y + 330, t);
              return <line key={k} x1={sx} y1={sy} x2={sx + Math.cos(a) * r} y2={sy + Math.sin(a) * r} stroke="#F2B233" strokeWidth={3} opacity={(f + k) % 3 === 0 ? 0.2 : 0.95} />;
            })}
          </g>
        );
      }))}
      <rect x={0} y={base} width={1920} height={180} fill="#C9D3C7" />
      {flash > 0 && <rect x={0} y={0} width={1920} height={1080} fill="#FFFFFF" opacity={flash} />}
    </g>
  );
};

export const Hook: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [c0, c1, c2] = cues;
  const tilt = ramp(f, c1 - 14, c1 + 10);
  const L2 = ends[2] - c2;
  const tShort = c2, tWind = c2 + L2 * 0.22, tShared = c2 + L2 * 0.45;
  const size = 640, ax = (1920 - size) / 2, ay = 150;
  const cand = [0, 1, 2].map(i => [0, 1, 2].map(p => ramp(f, c1 + 10 + (i * 3 + p) * 5, c1 + 34 + (i * 3 + p) * 5)));
  const showShort = Math.min(ramp(f, tShort, tShort + 8), 1 - ramp(f, tWind - 4, tWind + 4));
  const wind = ramp(f, tWind, tWind + 10);
  const shared = ramp(f, tShared, tShared + 14);
  const choice = [0, 0, 0];
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <g opacity={1 - tilt} transform={`translate(0 ${-tilt * 260})`}>
          <Storm f={f} snap={c0 + 22} />
        </g>
        <g opacity={tilt} transform={`translate(960 520) scale(${lerp(1.18, 1, tilt)}) translate(-960 -520)`}>
          <Airspace x={ax} y={ay} size={size} candidates={cand} candidateOpacity={lerp(0.28, 0.16, shared)}
            choice={shared > 0 ? choice : null} choiceDraw={shared} fly={ramp(f, tShared + 6, ends[2] + 10)}
            shared={shared} pulse={f} wind={wind * (1 - shared * 0.6)} costs={ramp(f, tWind, tWind + 10)}
            highlightCorridor={showShort > 0.05 ? [1, 0] : null} />
          <Tag x={ax + size + 70} y={ay + 40} o={tilt} title="3 drones" sub="3 candidate routes each" />
          <Tag x={ax - 70} y={ay + 300} o={showShort} title="Short" sub="drone 2, cost 6" anchor="end" color={C.drones[1]} />
          <Tag x={ax + size + 70} y={ay + 300} o={wind * (1 - shared)} title="Headwind" sub="cost-3 segments" />
          <Tag x={ax + size + 70} y={ay + 300} o={shared} title={`${planConflicts(choice)} shared segments`} sub="drones crowd the same sky" color={C.magenta} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
