import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { C, ramp } from '../theme';

type Clip = { id: string; from: number; dur: number; cues: number[] };
const STEPS: Record<string, string> = {
  dash_intro: 'The flight plan',
  dash_mu: 'Safety weight µ',
  dash_mixer: 'Rule style',
  dash_shots: '4,096 shots',
  dash_live: 'Live mode',
};

const WW = 1760, BAR = 46, VH = WW * 1080 / 1920, WX = (1920 - WW) / 2, WY = 14;

const ClipView: React.FC<{ id: string; dur: number }> = ({ id, dur }) => {
  const f = useCurrentFrame();
  const o = Math.min(ramp(f, 0, 8), 1 - ramp(f, dur, dur + 8));
  const z = 1 + 0.025 * ramp(f, 0, dur);
  return (
    <AbsoluteFill style={{ opacity: o, overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', transform: `scale(${z})`, transformOrigin: '50% 40%' }}>
        <OffthreadVideo src={staticFile(`clips/${id}.mp4`)} muted style={{ width: '100%', height: '100%' }} />
      </div>
    </AbsoluteFill>
  );
};

export const Dashboard: React.FC<{ dur: number; scenes: Clip[] }> = ({ scenes }) => {
  const f = useCurrentFrame();
  const cur = scenes.findIndex((s, i) => f >= s.from && (i === scenes.length - 1 || f < scenes[i + 1].from));
  const enter = ramp(f, 0, 18);
  return (
    <AbsoluteFill style={{ background: C.paperDeep }}>
      {/* browser window */}
      <div style={{
        position: 'absolute', left: WX, top: WY + (1 - enter) * 40, width: WW, height: BAR + VH, borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 18px 50px rgba(27,42,74,0.22)', border: `1.5px solid ${C.rule}`, background: C.paper,
      }}>
        <div style={{ height: BAR, background: C.ink, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
          {['#E06C5F', '#E9B949', '#5FB86A'].map(c => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
          <div style={{
            marginLeft: 22, flex: 1, maxWidth: 420, height: 28, borderRadius: 14, background: 'rgba(238,242,236,0.12)',
            color: C.paper, fontSize: 18, display: 'flex', alignItems: 'center', padding: '0 16px', letterSpacing: 0.2,
          }}>skylanes-dashboard.vercel.app</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {scenes.map((s, i) => {
              const on = i === cur;
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 5px', borderRadius: 16,
                  background: on ? C.airway : 'transparent', opacity: on ? 1 : 0.55,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11, border: `1.5px solid ${C.paper}`, color: C.paper,
                    fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</div>
                  <div style={{ color: C.paper, fontSize: 17, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap' }}>{STEPS[s.id]}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ position: 'relative', width: WW, height: VH }}>
          {scenes.map(s => (
            <Sequence key={s.id} from={s.from} durationInFrames={s.dur + 8} layout="none">
              <div style={{ position: 'absolute', inset: 0 }}><ClipView id={s.id} dur={s.dur} /></div>
            </Sequence>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
