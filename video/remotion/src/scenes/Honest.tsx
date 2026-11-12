import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Card, Heading } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, COND, ramp } from '../theme';

const POINTS = [
  { title: 'Correct and verified', body: 'Ising mapping exact on all 512 bitstrings. Browser simulator matches Qiskit to 5 × 10⁻⁹.' },
  { title: 'The design choice that matters', body: 'Rule built into the circuit: 3–10× better than guessing. Rule as a fine: no better.' },
  { title: 'The gap to real fleets, measured', body: '1% gate error: 32% → 3%. Chip wiring: 2.4–2.7× more CNOTs. 12 qubits: harder to tune.' },
];

export const Honest: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [o0, o1] = cues;
  const cards = Math.min(ramp(f, o0, o0 + 12), 1 - ramp(f, o1 - 8, o1 + 4));
  const verdict = ramp(f, o0 + 14, o0 + 26);
  const L1 = ends[1] - o1;
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Heading text={f < o1 ? 'Is quantum faster here?' : 'What SkyLanes shows'} o={ramp(f, 0, 12)} />
        <g opacity={cards}>
          <Card x={150} y={210} w={760} h={520} title="Classical: check every plan" accent={C.ink}>
            <text x={184} y={360} fontFamily={COND} fontSize={96} fontWeight={700} fill={C.ink}>µs</text>
            <text x={184} y={420} fontSize={32} fill={C.ink}>2–5 µs in the browser, 0.09 ms in Python</text>
            <text x={184} y={500} fontFamily={COND} fontSize={64} fontWeight={700} fill={C.good}>Always exact</text>
            <text x={184} y={560} fontSize={30} fill={C.inkSoft}>Wins easily at 27 plans.</text>
          </Card>
          <Card x={1010} y={210} w={760} h={520} title="QAOA (simulated)" accent={C.airway}>
            <text x={1044} y={360} fontFamily={COND} fontSize={96} fontWeight={700} fill={C.airway}>1–130 s</text>
            <text x={1044} y={420} fontSize={32} fill={C.ink}>of classical tuning per configuration</text>
            <text x={1044} y={500} fontFamily={COND} fontSize={64} fontWeight={700} fill={C.airway}>32–52% per shot</text>
            <text x={1044} y={560} fontSize={30} fill={C.inkSoft}>best plan always among 4,096 shots</text>
          </Card>
          <g opacity={verdict} transform={`translate(960 815) scale(${1.2 - 0.2 * verdict})`}>
            <rect x={-330} y={-62} width={660} height={104} rx={16} fill={C.magenta} fillOpacity={0.12} stroke={C.magenta} strokeWidth={3} />
            <text x={0} y={10} textAnchor="middle" fontFamily={COND} fontSize={60} fontWeight={700} fill={C.magenta}>Faster at this size? No.</text>
          </g>
        </g>
        {POINTS.map((p, i) => {
          const o = ramp(f, o1 + L1 * (0.05 + i * 0.27), o1 + L1 * (0.05 + i * 0.27) + 12);
          const y = 250 + i * 210;
          return (
            <g key={i} opacity={o} transform={`translate(${(1 - o) * 30} 0)`}>
              <circle cx={220} cy={y + 40} r={44} fill={C.good} fillOpacity={0.14} stroke={C.good} strokeWidth={3} />
              <path d={`M${200} ${y + 42} l 14 16 l 26 -32`} fill="none" stroke={C.good} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
              <text x={300} y={y + 30} fontFamily={COND} fontSize={56} fontWeight={700} fill={C.ink}>{p.title}</text>
              <text x={300} y={y + 84} fontSize={34} fill={C.inkSoft}>{p.body}</text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
