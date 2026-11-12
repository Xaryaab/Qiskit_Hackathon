import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import data from '../data.json';
import { Quad } from '../components/Airspace';
import type { SceneProps } from '../SkyLanes';
import { C, COND, ramp } from '../theme';

const V = data.versions as Record<string, string>;

export const End: React.FC<SceneProps> = () => {
  const f = useCurrentFrame();
  const a = ramp(f, 0, 16), b = ramp(f, 10, 28);
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        {[0, 1, 2].map(i => {
          const t = f / 90 + i * 2.1;
          return <Quad key={i} x={960 + Math.cos(t) * (820 + i * 20)} y={500 + Math.sin(t) * (400 + i * 15)} color={C.drones[i]} s={1.1}
            rot={(t * 180 / Math.PI) + 90} />;
        })}
        <g opacity={a}>
          <path d="M700 340 L780 190 L860 340 L780 300 Z" fill={C.ink} transform="translate(-30 0)" />
          <text x={840} y={340} fontFamily={COND} fontSize={190} fontWeight={700} fill={C.ink}>SkyLanes</text>
        </g>
        <g opacity={b}>
          <text x={960} y={470} textAnchor="middle" fontSize={40} fill={C.inkSoft}>Conflict-aware drone routing with QAOA</text>
          <text x={960} y={590} textAnchor="middle" fontSize={44} fontWeight={600} fill={C.ink}>Live dashboard: skylanes-dashboard.vercel.app</text>
          <text x={960} y={660} textAnchor="middle" fontSize={44} fontWeight={600} fill={C.ink}>Code and data: github.com/Xaryaab/Qiskit_Hackathon</text>
          <text x={960} y={760} textAnchor="middle" fontSize={30} fill={C.inkSoft}>
            {`Built with Qiskit ${V.qiskit}, qiskit-optimization ${V['qiskit-optimization']} and Qiskit Aer ${V['qiskit-aer']}`}
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
