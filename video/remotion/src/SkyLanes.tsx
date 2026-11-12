import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import timeline from './timeline.json';
import { BODY, C, ramp } from './theme';
import { Hook } from './scenes/Hook';
import { Problem } from './scenes/Problem';
import { Title } from './scenes/Title';
import { Qubits } from './scenes/Qubits';
import { Qaoa } from './scenes/Qaoa';
import { Dashboard } from './scenes/Dashboard';
import { Results } from './scenes/Results';
import { Hardware } from './scenes/Hardware';
import { Honest } from './scenes/Honest';
import { End } from './scenes/End';

export type Scene = (typeof timeline.scenes)[number];
export type SceneProps = { cues: number[]; ends: number[]; dur: number };

const byId = (id: string) => timeline.scenes.find(s => s.id === id)!;

/** Scene start (absolute frame) — the first scene starts at frame 0 so the lead-in has picture */
const start = (s: Scene) => (s.id === timeline.scenes[0].id ? 0 : s.from);

function propsFor(s: Scene, from: number): SceneProps {
  return {
    cues: s.lines.map(l => l.from - from),
    ends: s.lines.map(l => l.from + l.dur - from),
    dur: s.from + s.dur - from,
  };
}

const Fade: React.FC<{ dur: number; children: React.ReactNode; fin?: number; fout?: number }> = ({ dur, children, fin = 10, fout = 10 }) => {
  const f = useCurrentFrame();
  const o = Math.min(fin ? ramp(f, 0, fin) : 1, fout ? 1 - ramp(f, dur - fout, dur) : 1);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const PLAIN: Record<string, React.FC<SceneProps>> = {
  hook: Hook, problem: Problem, title: Title, qubits: Qubits, qaoa: Qaoa,
  results: Results, hardware: Hardware, honest: Honest, end: End,
};
const DASH = ['dash_intro', 'dash_mu', 'dash_mixer', 'dash_shots', 'dash_live'];

const Subtitles: React.FC = () => {
  const f = useCurrentFrame();
  const lines = timeline.scenes.flatMap(s => s.lines);
  const k = lines.findIndex((l, i) => f >= l.from - 4 && f < (i + 1 < lines.length ? Math.min(lines[i + 1].from - 4, l.from + l.dur + 20) : l.from + l.dur + 20));
  if (k < 0) return null;
  const l = lines[k];
  const o = Math.min(ramp(f, l.from - 4, l.from + 2), 1 - ramp(f, l.from + l.dur + 12, l.from + l.dur + 20));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', opacity: o, pointerEvents: 'none' }}>
      <div style={{
        maxWidth: 1480, padding: '12px 26px', background: 'rgba(247,249,245,0.94)', borderRadius: 10,
        border: `1.5px solid ${C.rule}`, color: C.ink, fontFamily: BODY, fontSize: 34, fontWeight: 500, lineHeight: 1.3, textAlign: 'center',
        boxShadow: '0 4px 18px rgba(27,42,74,0.10)',
      }}>{l.show}</div>
    </div>
  );
};

export const SkyLanes: React.FC = () => {
  const d0 = byId(DASH[0]), d1 = byId(DASH[DASH.length - 1]);
  const dashFrom = d0.from, dashDur = d1.from + d1.dur - d0.from;
  const dashScenes = DASH.map(id => {
    const s = byId(id);
    return { id, from: s.from - dashFrom, dur: s.dur, cues: s.lines.map(l => l.from - s.from) };
  });
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: BODY }}>
      {timeline.scenes.filter(s => PLAIN[s.id]).map((s, i, arr) => {
        const from = start(s);
        const p = propsFor(s, from);
        const Comp = PLAIN[s.id];
        const isFirst = i === 0, isLast = i === arr.length - 1;
        return (
          <Sequence key={s.id} from={from} durationInFrames={p.dur} name={s.id}>
            <Fade dur={p.dur} fin={isFirst ? 0 : 10} fout={isLast ? 24 : 10}><Comp {...p} /></Fade>
          </Sequence>
        );
      })}
      <Sequence from={dashFrom} durationInFrames={dashDur} name="dashboard">
        <Fade dur={dashDur}><Dashboard dur={dashDur} scenes={dashScenes} /></Fade>
      </Sequence>
      <Subtitles />
      <Audio src={staticFile('mix.wav')} />
    </AbsoluteFill>
  );
};
