import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import data from '../data.json';
import { Heading } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, COND, lerp, ramp } from '../theme';

const N = data.per_mu['1.5'];
const NX = N.noise_x, NXY = N.noise_xy;

const CX0 = 170, CY0 = 830, CW = 680, CH = 500, VMAX = 0.35;
const px = (i: number) => CX0 + 60 + i * ((CW - 120) / 2);
const py = (v: number) => CY0 - (v / VMAX) * CH;

export const Hardware: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [h0, h1] = cues;
  const draw = ramp(f, h0 + 8, h0 + 60);
  const chain = ramp(f, h1, h1 + 14);
  const bars = ramp(f, h1 + (ends[1] - h1) * 0.45, h1 + (ends[1] - h1) * 0.65);
  const series = [
    { name: 'XY mixer', color: C.airway, pts: NXY.noise.map(n => n.p_optimal) },
    { name: 'Penalty', color: C.inkSoft, pts: NX.noise.map(n => n.p_optimal) },
  ];
  const labels = NX.noise.map(n => (n.two_qubit_error === 0 ? 'no noise' : `${(n.two_qubit_error * 100).toFixed(1)}%`));
  // SWAP chain: qubits on a line; a coupling between distant qubits needs swaps along the way
  const qx = (k: number) => 1060 + k * 86, qy = 470;
  const hop = Math.max(0, (f - h1 - 20) / 14);
  const moving = Math.min(4, Math.floor(hop)), frac = hop - Math.floor(hop);
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Heading text="On real hardware: noise and wiring" o={ramp(f, 0, 12)} />
        {/* noise chart */}
        <text x={CX0} y={240} fontSize={30} fontWeight={600} fill={C.ink}>Best-plan shots vs two-qubit gate error</text>
        {[0, 0.1, 0.2, 0.3].map(t => (
          <g key={t}>
            <line x1={CX0} x2={CX0 + CW} y1={py(t)} y2={py(t)} stroke={C.rule} strokeWidth={2} />
            <text x={CX0 - 14} y={py(t) + 9} textAnchor="end" fontSize={24} fill={C.inkSoft}>{`${Math.round(t * 100)}%`}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={i} x={px(i)} y={CY0 + 40} textAnchor="middle" fontSize={26} fill={C.inkSoft}>{l}</text>)}
        {series.map(s => {
          const d = s.pts.map((v, i) => `${i ? 'L' : 'M'}${px(i)} ${py(v)}`).join(' ');
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.name === 'XY mixer' ? 6 : 4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
              {s.pts.map((v, i) => (
                <g key={i} opacity={ramp(draw, i / 2 - 0.05, i / 2 + 0.05)}>
                  <circle cx={px(i)} cy={py(v)} r={9} fill={s.color} />
                  <text x={px(i) + (i === 2 ? 18 : 0)} y={py(v) + (s.name === 'Penalty' && i === 2 ? 44 : s.name === 'Penalty' ? 40 : -20)} textAnchor={i === 2 ? 'start' : 'middle'} fontSize={28} fontWeight={700} fill={s.color}>{`${(v * 100).toFixed(0)}%`}</text>
                </g>
              ))}
              <text x={CX0 + CW + 14} y={py(s.pts[0]) + 8} fontSize={26} fontWeight={600} fill={s.color} opacity={draw}>{s.name}</text>
            </g>
          );
        })}
        {/* routing on a chain of qubits */}
        <g opacity={chain}>
          <text x={1020} y={240} fontSize={30} fontWeight={600} fill={C.ink}>Chip qubits only talk to neighbours</text>
          {Array.from({ length: 9 }, (_, k) => (
            <g key={k}>
              {k < 8 && <line x1={qx(k) + 28} x2={qx(k + 1) - 28} y1={qy} y2={qy} stroke={C.ink} strokeWidth={4} />}
              <circle cx={qx(k)} cy={qy} r={28} fill={C.panel} stroke={C.ink} strokeWidth={3} />
              <text x={qx(k)} y={qy + 9} textAnchor="middle" fontSize={24} fontWeight={600} fill={C.ink}>{k}</text>
            </g>
          ))}
          <path d={`M${qx(0)} ${qy - 30} Q ${(qx(0) + qx(5)) / 2} ${qy - 170} ${qx(5)} ${qy - 30}`} fill="none" stroke={C.magenta} strokeWidth={4} strokeDasharray="10 8" />
          <text x={(qx(0) + qx(5)) / 2} y={qy - 150} textAnchor="middle" fontSize={26} fontWeight={600} fill={C.magenta}>a coupling the circuit needs</text>
          <circle cx={lerp(qx(moving), qx(Math.min(5, moving + 1)), hop >= 5 ? 0 : frac)} cy={qy} r={20} fill={C.magenta} opacity={0.85} />
          <text x={qx(4)} y={qy + 80} textAnchor="middle" fontSize={26} fill={C.inkSoft}>SWAP gates carry the qubit along the chain first</text>
        </g>
        <g opacity={bars}>
          <text x={1020} y={660} fontSize={30} fontWeight={600} fill={C.ink}>CNOT gates after compiling (depth 3)</text>
          {[['Penalty', NX.cx_all_to_all, NX.cx_linear_chain], ['XY mixer', NXY.cx_all_to_all, NXY.cx_linear_chain]].map(([name, a, b], i) => {
            const y = 710 + i * 110;
            const s = 1.1;
            return (
              <g key={String(name)}>
                <text x={1020} y={y + 36} fontSize={26} fontWeight={600} fill={C.ink}>{name}</text>
                <rect x={1170} y={y} width={(a as number) * s * bars} height={34} fill={C.inkSoft} opacity={0.5} />
                <text x={1180 + (a as number) * s} y={y + 26} fontSize={24} fill={C.ink}>{`${a} any-to-any`}</text>
                <rect x={1170} y={y + 42} width={(b as number) * s * bars} height={34} fill={C.magenta} opacity={0.75} />
                <text x={1180 + (b as number) * s} y={y + 68} fontSize={24} fontWeight={700} fill={C.magenta}>{`${b} on a chain (${((b as number) / (a as number)).toFixed(1)}×)`}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
