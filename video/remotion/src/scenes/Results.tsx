import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import data from '../data.json';
import { Heading } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, COND, ramp } from '../theme';

const MUS = [0.25, 0.75, 1.5];
const get = (mu: number, mixer: string) => data.runs.find(r => r.mu === mu && r.mixer === mixer && r.reps === 3)!;
const ROWS = MUS.map(mu => {
  const xy = get(mu, 'xy'), pen = get(mu, 'x');
  const guess = xy.random_guess_p_optimal * 512 / 27;
  return { mu, xy: xy.p_optimal, pen: pen.p_optimal, guess };
});

const X0 = 330, Y0 = 860, HMAX = 560, VMAX = 0.6;
const Y = (v: number) => Y0 - (v / VMAX) * HMAX;

export const Results: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [r0, r1] = cues;
  const grow = ramp(f, r0 + 6, r0 + 40);
  const mult = ramp(f, r0 + (ends[0] - r0) * 0.55, r0 + (ends[0] - r0) * 0.7);
  const focus = ramp(f, r1, r1 + 10);
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Heading text="Chance a single shot is an exact best plan (depth 3, 9 qubits)" o={ramp(f, 0, 12)} />
        {[0, 0.2, 0.4, 0.6].map(t => (
          <g key={t}>
            <line x1={X0 - 20} x2={1700} y1={Y(t)} y2={Y(t)} stroke={C.rule} strokeWidth={2} />
            <text x={X0 - 34} y={Y(t) + 10} textAnchor="end" fontSize={28} fill={C.inkSoft}>{`${Math.round(t * 100)}%`}</text>
          </g>
        ))}
        {ROWS.map((r, g) => {
          const gx = X0 + 40 + g * 450;
          const bars = [
            { v: r.guess, fill: 'none', stroke: C.inkSoft, label: 'Random valid plan', dash: '8 6' },
            { v: r.pen, fill: C.inkSoft, stroke: C.inkSoft, label: 'Penalty QAOA' },
            { v: r.xy, fill: C.airway, stroke: C.airway, label: 'XY-mixer QAOA' },
          ];
          return (
            <g key={g}>
              {bars.map((b, k) => {
                const h = (b.v / VMAX) * HMAX * grow;
                const dim = focus > 0 && k === 2 ? 1 - 0.55 * focus : 1;
                return (
                  <g key={k} opacity={dim}>
                    <rect x={gx + k * 120} y={Y0 - h} width={100} height={h} fill={b.fill} fillOpacity={k === 1 ? 0.55 : 0.9}
                      stroke={b.stroke} strokeWidth={k === 0 ? 3 : 0} strokeDasharray={b.dash} />
                    <text x={gx + k * 120 + 50} y={Y0 - h - 14} textAnchor="middle" fontSize={30} fontWeight={600} fill={C.ink} opacity={grow}>{`${(b.v * 100).toFixed(0)}%`}</text>
                  </g>
                );
              })}
              <text x={gx + 170} y={Y0 + 50} textAnchor="middle" fontSize={32} fontWeight={600} fill={C.ink}>{`µ = ${r.mu}`}</text>
              <g opacity={mult * (1 - 0.55 * focus)}>
                <text x={gx + 290} y={Y(r.xy) - 60} textAnchor="middle" fontFamily={COND} fontSize={54} fontWeight={700} fill={C.airway}>{`${(r.xy / r.guess).toFixed(1)}×`}</text>
              </g>
              <g opacity={focus}>
                <path d={`M${gx - 6} ${Y(Math.max(r.pen, r.guess)) - 70} h 232`} stroke={C.magenta} strokeWidth={4} />
                <text x={gx + 110} y={Y(Math.max(r.pen, r.guess)) - 84} textAnchor="middle" fontSize={28} fontWeight={700} fill={C.magenta}>{`${(r.pen / r.guess).toFixed(1)}× = guessing`}</text>
              </g>
            </g>
          );
        })}
        {/* legend */}
        <g transform="translate(330 960)" opacity={ramp(f, r0, r0 + 14)}>
          {[['Random valid plan', 'none', C.inkSoft], ['Penalty QAOA (rule as a fine)', C.inkSoft, C.inkSoft], ['XY-mixer QAOA (rule built in)', C.airway, C.airway]].map(([l, fill, st], i) => (
            <g key={i} transform={`translate(${i * 470} 0)`}>
              <rect x={0} y={-24} width={32} height={32} fill={fill} fillOpacity={i === 1 ? 0.55 : 0.9} stroke={st} strokeWidth={i === 0 ? 3 : 0} strokeDasharray={i === 0 ? '6 4' : undefined} />
              <text x={46} y={2} fontSize={28} fill={C.ink}>{l}</text>
            </g>
          ))}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
