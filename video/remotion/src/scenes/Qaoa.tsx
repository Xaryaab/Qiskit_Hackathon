import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import data from '../data.json';
import { Arrow, Card, Heading } from '../components/Bits';
import type { SceneProps } from '../SkyLanes';
import { C, COND, lerp, ramp } from '../theme';

// Real output of the recorded Qiskit run (mu = 1.5, XY mixer, depth 2), summed per valid plan
const RUN = data.runs.find(r => r.mu === 1.5 && r.mixer === 'xy' && r.reps === 2)!;
const PLANS = (data.instance.feasible as number[][]).map(([a, b, c, cost, k]) => {
  const z = (1 << a) | (1 << (3 + b)) | (1 << (6 + c));
  return { choice: [a, b, c], p: RUN.probs[z], f: cost + 1.5 * k };
}).sort((x, y) => y.p - x.p);
const BEST = Math.min(...PLANS.map(p => p.f));

const NODES = [
  { x: 250, label: 'Equal mix', sub: 'of all plans' },
  { x: 620, label: 'Score layer', sub: 'angle γ' },
  { x: 990, label: 'Mix layer', sub: 'angle β' },
  { x: 1360, label: 'Measure', sub: 'one plan per shot' },
  { x: 1710, label: 'Optimiser', sub: 'classical, tunes γ, β' },
];
const NY = 250, NW = 300, NH = 96;

export const Qaoa: React.FC<SceneProps> = ({ cues, ends }) => {
  const f = useCurrentFrame();
  const [a0, a1, a2, a3] = cues;
  const loopO = Math.min(ramp(f, a0, a0 + 14), 1 - ramp(f, a1 - 10, a1)) ;
  const cycle = (f - a0 - 12) / ((ends[0] - a0 - 16) / 3);
  const tok = Math.max(0, cycle) % 1, rounds = Math.min(3, Math.max(0, cycle));
  const learn = ramp(rounds, 0, 3);
  // token travels nodes 0..4 then back along the return arc
  const seg = tok * 5, k = Math.min(4, Math.floor(seg)), u = seg - k;
  const tx = k < 4 ? lerp(NODES[k].x, NODES[k + 1].x, u) : lerp(NODES[4].x, NODES[1].x, u);
  const ty = k < 4 ? NY : NY + 130 * Math.sin(u * Math.PI);
  const barsO = loopO;
  const v1 = Math.min(ramp(f, a1, a1 + 12), 1 - ramp(f, a3 - 8, a3 + 4));
  const v2 = Math.min(ramp(f, a2, a2 + 12), 1 - ramp(f, a3 - 8, a3 + 4));
  const base = ramp(f, a3, a3 + 12);
  return (
    <AbsoluteFill>
      <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
        <Heading text={f < a1 ? 'QAOA: shape the odds in rounds' : f < a3 ? 'Two ways to keep the one-route rule' : 'Every answer is checked exactly'} o={ramp(f, 0, 12)} />
        {/* --- the loop --- */}
        <g opacity={loopO}>
          {NODES.map((n, i) => (
            <g key={i}>
              <rect x={n.x - NW / 2 + 20} y={NY - NH / 2} width={NW - 40} height={NH} rx={12} fill={i === 1 || i === 2 ? C.airway : C.panel}
                fillOpacity={i === 1 || i === 2 ? 0.12 : 1} stroke={i === 1 || i === 2 ? C.airway : C.ink} strokeWidth={i === 1 || i === 2 ? 3 : 2} />
              <text x={n.x} y={NY - 6} textAnchor="middle" fontFamily={COND} fontSize={38} fontWeight={700} fill={C.ink}>{n.label}</text>
              <text x={n.x} y={NY + 30} textAnchor="middle" fontSize={24} fill={C.inkSoft}>{n.sub}</text>
              {i < 4 && <Arrow id={`qa${i}`} d={`M${n.x + NW / 2 - 18} ${NY} L${NODES[i + 1].x - NW / 2 + 16} ${NY}`} color={C.ink} />}
            </g>
          ))}
          <Arrow id="qaret" d={`M${NODES[4].x} ${NY + NH / 2} Q ${(NODES[4].x + NODES[1].x) / 2} ${NY + 230} ${NODES[1].x} ${NY + NH / 2 + 4}`} color={C.magenta} dash="10 8" />
          <text x={(NODES[4].x + NODES[1].x) / 2} y={NY + 170} textAnchor="middle" fontSize={26} fontWeight={600} fill={C.magenta}>new angles, repeat</text>
          {f > a0 + 12 && <circle cx={tx} cy={ty} r={13} fill={C.magenta} />}
          <text x={1820} y={NY + 120} textAnchor="end" fontSize={26} fill={C.inkSoft}>{`round ${Math.min(3, Math.floor(rounds) + 1)}`}</text>
        </g>
        {/* --- the 27 plans, odds sharpening --- */}
        <g opacity={barsO}>
          <text x={150} y={520} fontSize={28} fill={C.inkSoft}>Chance of each of the 27 valid plans (recorded Qiskit run, µ = 1.5, depth 2). Green = exact best plan.</text>
          <line x1={150} x2={1770} y1={860} y2={860} stroke={C.ink} strokeWidth={2} />
          {PLANS.map((p, i) => {
            const v = lerp(1 / 27, p.p, learn);
            const h = v / 0.2 * 300;
            const best = Math.abs(p.f - BEST) < 1e-9;
            return <rect key={i} x={160 + i * 59.5} y={860 - h} width={46} height={h} rx={3} fill={best ? C.good : C.airway} opacity={best ? 0.95 : 0.7} />;
          })}
          <line x1={150} x2={1770} y1={860 - (1 / 27) / 0.2 * 300} y2={860 - (1 / 27) / 0.2 * 300} stroke={C.inkSoft} strokeDasharray="4 6" strokeWidth={2} />
          <text x={1775} y={860 - (1 / 27) / 0.2 * 300 - 8} textAnchor="end" fontSize={22} fill={C.inkSoft}>equal odds, 1 in 27</text>
        </g>
        {/* --- version 1: penalty --- */}
        <Card x={110} y={190} w={820} h={640} o={v1} title="Version 1: the rule as a fine" accent={C.inkSoft}>
          <text x={144} y={300} fontSize={28} fill={C.inkSoft}>All 512 bitstrings are possible; breaking the rule costs a penalty.</text>
          {Array.from({ length: 512 }, (_, z) => {
            const ok = (data.instance.feasible as number[][]).some(([a, b, c]) => z === ((1 << a) | (1 << (3 + b)) | (1 << (6 + c))));
            const col = z % 32, row = Math.floor(z / 32);
            const fined = !ok && (z * 37) % 11 === 0 && f > a1 + 20 + (z % 9) * 3;
            return <rect key={z} x={150 + col * 23.5} y={340 + row * 27} width={18} height={20} rx={3}
              fill={ok ? C.airway : fined ? C.magenta : C.rule} opacity={ok ? 0.95 : fined ? 0.7 : 0.8} />;
          })}
          <text x={144} y={800} fontSize={30} fontWeight={600} fill={C.ink}>27 valid (blue) of 512. Fines in magenta.</text>
        </Card>
        {/* --- version 2: XY mixer --- */}
        <Card x={990} y={190} w={820} h={640} o={v2} title="Version 2: the rule built in" accent={C.airway}>
          <text x={1024} y={300} fontSize={28} fill={C.inkSoft}>XY mixer: swaps a drone's route only for another of its own.</text>
          {[0, 1, 2].map(i => {
            const phase = (f - a2) / 26 + i * 0.7;
            const pos = ((Math.floor(phase) % 3) + 3) % 3, frac = phase - Math.floor(phase);
            const xs = [0, 1, 2].map(p => 1260 + p * 160), y = 410 + i * 140;
            const nx = xs[(pos + 1) % 3];
            const e = Math.min(1, frac * 2.2);
            const cx = lerp(xs[pos], pos === 2 ? xs[0] : nx, e);
            return (
              <g key={i}>
                <text x={1190} y={y + 12} textAnchor="end" fontFamily={COND} fontSize={34} fontWeight={700} fill={C.drones[i]}>Drone {i + 1}</text>
                {xs.map((x, p) => <circle key={p} cx={x} cy={y} r={40} fill={C.panel} stroke={C.drones[i]} strokeWidth={3.5} />)}
                <path d={`M${xs[0]} ${y - 46} Q ${xs[1]} ${y - 90} ${xs[2]} ${y - 46}`} fill="none" stroke={C.inkSoft} strokeWidth={2} strokeDasharray="6 6" />
                <circle cx={cx} cy={y} r={30} fill={C.drones[i]} opacity={0.9} />
              </g>
            );
          })}
          <text x={1024} y={800} fontSize={30} fontWeight={600} fill={C.ink}>Only the 27 valid plans are ever reachable.</text>
        </Card>
        {/* --- exact baseline --- */}
        <g opacity={base}>
          <text x={110} y={260} fontSize={34} fill={C.ink}>Brute force scores all 27 plans; Qiskit's NumPyMinimumEigensolver confirms the same optimum.</text>
          {PLANS.slice().sort((x, y) => x.f - y.f).map((p, i) => {
            const chk = ramp(f, a3 + 14 + i * 4, a3 + 22 + i * 4);
            const best = Math.abs(p.f - BEST) < 1e-9;
            const x = 130 + (i % 9) * 190, y = 330 + Math.floor(i / 9) * 150;
            return (
              <g key={i}>
                <rect x={x} y={y} width={170} height={120} rx={10} fill={best ? C.good : C.panel} fillOpacity={best ? 0.16 : 1}
                  stroke={best ? C.good : C.rule} strokeWidth={best ? 3 : 2} />
                <text x={x + 85} y={y + 48} textAnchor="middle" fontSize={30} fontWeight={600} fill={C.ink}>{`(${p.choice.map(c => c + 1).join(',')})`}</text>
                <text x={x + 85} y={y + 90} textAnchor="middle" fontSize={26} fill={C.inkSoft} opacity={chk}>{`score ${p.f.toFixed(1)}`}</text>
                <path d={`M${x + 138} ${y + 20} l 8 10 l 16 -20`} fill="none" stroke={C.good} strokeWidth={4} opacity={chk} />
              </g>
            );
          })}
          <text x={110} y={840} fontFamily={COND} fontSize={46} fontWeight={700} fill={C.good} opacity={ramp(f, ends[3] - 50, ends[3] - 30)}>
            Exact optimum at µ = 1.5: score 22.0, three tied plans
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
