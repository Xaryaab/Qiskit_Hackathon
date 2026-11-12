import { loadFont as loadBarlow } from '@remotion/google-fonts/Barlow';
import { loadFont as loadCond } from '@remotion/google-fonts/BarlowCondensed';
import { Easing, interpolate } from 'remotion';

export const { fontFamily: BODY } = loadBarlow('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });
export const { fontFamily: COND } = loadCond('normal', { weights: ['500', '600', '700'], subsets: ['latin'] });

// Same aeronautical-chart palette as the dashboard
export const C = {
  paper: '#EEF2EC',
  paperDeep: '#E2E9E3',
  panel: '#F7F9F5',
  ink: '#1B2A4A',
  inkSoft: '#4A5A78',
  rule: '#C3CFC8',
  airway: '#2C5DA8',
  magenta: '#B0287A',
  good: '#2E8B57',
  storm: '#3A4560',
  drones: ['#2C5DA8', '#C98A1B', '#2E8B73'],
};

export const W = 1920;
export const H = 1080;
export const FPS = 30;

const ease = Easing.bezier(0.33, 0, 0.2, 1);

/** 0 -> 1 between frames a and b, eased and clamped */
export const ramp = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/** fade in over `inF` frames from a, fade out over `outF` frames ending at b */
export const window = (f: number, a: number, b: number, inF = 12, outF = 12) =>
  Math.min(ramp(f, a, a + inF), 1 - ramp(f, b - outF, b));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
