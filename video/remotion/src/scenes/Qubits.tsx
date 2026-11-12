import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import data from '../data.json';
import { Airspace } from '../components/Airspace';
import { Heading, Qubit } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, COND, ramp } from '../theme';

const S = data.instance.shared as number[][];
const GX = 370, GY = 360, DX = 190, DY = 190, QR = 54;
const qx = (p: number) => GX + p * DX, qy = (i: number) => GY + i * DY;
const EXAMPLES = [[1, 0, 1], [0, 2, 1], [1, 0, 1]];

export const Qubits: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [q0, q1, q2, q3] = cues;
  const L0 = ends[0] - q0;
  const ex = f < q0 + L0 * 0.55 ? -1 : Math.min(EXAMPLES.length - 1, Math.floor((f - q0 - L0 * 0.55) / 34));
  const plan = ex < 0 ? [1, 0, 1] : EXAMPLES[ex];
  const lit = (i: number, p: number) => ramp(f, q0 + L0 * 0.4, q0 + L0 * 0.55) * (plan[i] === p ? 1 : 0);
  const invalidRow = f > q3 + 18 && f < ends[3] - 20;
  const bad = invalidRow && Math.floor((f - q3) / 12) % 2 === 0;
  const couple = ramp(f, q2, q2 + 30);
  const formula = ramp(f, q1, q1 + 14);
  const rule = ramp(f, q3, q3 + 14);
  const pairs: [number, number, number][] = [];
  for (let k = 0; k < 9; k++) for (let l = k + 1; l < 9; l++) if (S[k][l] && Math.floor(k / 3) !== Math.floor(l / 3)) pairs.push([k, l, S[k][l]]);
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Heading text="Nine qubits, one per drone and route" o={ramp(f, 0, 12)} />
        {/* column + row labels */}
        {[0, 1, 2].map(p => <text key={p} x={qx(p)} y={GY - 78} textAnchor="middle" fontSize={28} fontWeight={600} fill={C.inkSoft} opacity={ramp(f, 4, 16)}>Route {p + 1}</text>)}
        {[0, 1, 2].map(i => <text key={i} x={GX - 90} y={qy(i) + 12} textAnchor="end" fontFamily={COND} fontSize={44} fontWeight={700} fill={C.drones[i]} opacity={ramp(f, 4, 16)}>Drone {i + 1}</text>)}
        {/* couplings from shared sky (ZZ terms) */}
        <g opacity={couple}>
          {pairs.map(([k, l, s], n) => {
            const [i1, p1, i2, p2] = [Math.floor(k / 3), k % 3, Math.floor(l / 3), l % 3];
            const x1 = qx(p1), y1 = qy(i1), x2 = qx(p2), y2 = qy(i2);
            const bend = (n % 2 ? 1 : -1) * (40 + 18 * (n % 4));
            const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2;
            const draw = ramp(f, q2 + n * 3, q2 + 24 + n * 3);
            return <path key={n} d={`M${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke={C.magenta} strokeWidth={2 + 2.2 * s}
              strokeOpacity={0.55} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />;
          })}
        </g>
        {/* the qubits */}
        {[0, 1, 2].map(i => [0, 1, 2].map(p => {
          const appear = ramp(f, q0 + (i * 3 + p) * 3, q0 + 14 + (i * 3 + p) * 3);
          const on = bad && i === 1 && p === 2 ? 1 : lit(i, p);
          return <Qubit key={`${i}${p}`} x={qx(p)} y={qy(i)} r={QR} on={on} color={bad && i === 1 ? C.magenta : C.drones[i]} o={appear} />;
        }))}
        {/* one-route rule brackets */}
        <g opacity={rule}>
          {[0, 1, 2].map(i => (
            <g key={i}>
              <path d={`M${qx(2) + 74} ${qy(i) - 56} h 18 v 112 h -18`} fill="none" stroke={bad && i === 1 ? C.magenta : C.ink} strokeWidth={3} />
              <text x={qx(2) + 108} y={qy(i) + 10} fontSize={30} fontWeight={600} fill={bad && i === 1 ? C.magenta : C.good}>
                {bad && i === 1 ? '2 routes: not allowed' : 'exactly one'}
              </text>
            </g>
          ))}
        </g>
        {/* right column: mini map, then the score */}
        <g opacity={Math.min(ramp(f, q0 + L0 * 0.5, q0 + L0 * 0.62), 1 - ramp(f, q2 - 10, q2))}>
          <Airspace x={1210} y={250} size={420} candidates={[[1, 1, 1], [1, 1, 1], [1, 1, 1]]} candidateOpacity={0.12}
            choice={plan} shared={formula} pulse={f} costs={formula} />
        </g>
        <g opacity={Math.min(formula, 1 - ramp(f, q2 - 10, q2)) }>
          <rect x={1200} y={760} width={640} height={132} rx={14} fill={C.panel} stroke={C.rule} strokeWidth={2} />
          <text x={1230} y={820} fontSize={38} fill={C.ink}>score = <tspan fontWeight={700}>battery cost</tspan></text>
          <text x={1230} y={872} fontSize={38} fill={C.ink}>{'        + µ × '}<tspan fontWeight={700} fill={C.magenta}>shared segments</tspan></text>
        </g>
        <g opacity={Math.min(couple, 1 - ramp(f, q3 - 6, q3 + 6))}>
          <text x={1250} y={430} fontFamily={COND} fontSize={58} fontWeight={700} fill={C.magenta}>12 couplings</text>
          <text x={1250} y={490} fontSize={34} fill={C.ink}>Two qubits are linked when their</text>
          <text x={1250} y={534} fontSize={34} fill={C.ink}>routes share sky: a ZZ term in the</text>
          <text x={1250} y={578} fontSize={34} fill={C.ink}>Ising Hamiltonian.</text>
          <text x={1250} y={660} fontSize={30} fill={C.inkSoft}>Without them this would be a plain</text>
          <text x={1250} y={700} fontSize={30} fill={C.inkSoft}>assignment problem, easy for classical code.</text>
        </g>
        <g opacity={rule}>
          <text x={1250} y={430} fontFamily={COND} fontSize={58} fontWeight={700} fill={C.ink}>One-route rule</text>
          <text x={1250} y={490} fontSize={34} fill={C.ink}>Each row must hold exactly one 1.</text>
          <text x={1250} y={534} fontSize={34} fill={C.ink}>3 rows × 3 choices = 27 valid plans</text>
          <text x={1250} y={578} fontSize={34} fill={C.ink}>out of 512 bitstrings.</text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
