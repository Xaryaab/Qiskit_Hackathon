import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Quad } from '../components/Airspace';
import type { SceneProps } from '../SkyLanes';
import { C, COND, lerp, ramp } from '../theme';

export const Title: React.FC<SceneProps> = ({ dur }) => {
  const f = useCurrentFrame();
  const a = ramp(f, 0, 18), b = ramp(f, 10, 30), c = ramp(f, 22, 42);
  const fly = ramp(f, 0, dur - 4);
  const px = lerp(-80, 2000, fly), py = 760 - 90 * Math.sin(fly * Math.PI);
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <path d={`M-80 760 Q 960 580 2000 760`} fill="none" stroke={C.airway} strokeWidth={4} strokeDasharray="14 12" opacity={0.45 * b} />
        <g opacity={a} transform={`translate(0 ${(1 - a) * 30})`}>
          <path d="M760 420 L840 270 L920 420 L840 380 Z" fill={C.ink} transform="translate(-40 0)" />
          <text x={900} y={420} fontFamily={COND} fontSize={210} fontWeight={700} fill={C.ink}>SkyLanes</text>
        </g>
        <text x={960} y={520} textAnchor="middle" fontSize={50} fill={C.inkSoft} opacity={b}>Conflict-aware drone routing with QAOA, built in Qiskit</text>
        <g opacity={c}>
          {['UAVs and robotics', '9 qubits', 'Exact classical baseline'].map((t, i) => (
            <g key={t} transform={`translate(${520 + i * 300} 590)`}>
              <rect x={0} y={0} width={280} height={60} rx={30} fill="none" stroke={C.ink} strokeWidth={2.5} />
              <text x={140} y={40} textAnchor="middle" fontSize={27} fontWeight={600} fill={C.ink}>{t}</text>
            </g>
          ))}
        </g>
        <Quad x={px} y={py} color={C.airway} s={1.6} rot={Math.atan2(-90 * Math.PI * Math.cos(fly * Math.PI), 2080) * 180 / Math.PI} />
      </svg>
    </AbsoluteFill>
  );
};
