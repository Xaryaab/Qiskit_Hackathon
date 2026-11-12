import React from 'react';
import { C, COND } from '../theme';

/** A two-line label set in the chart's type: bold condensed title + quiet sub-line, with a colour tick */
export const Tag: React.FC<{ x: number; y: number; o: number; title: string; sub?: string; anchor?: 'start' | 'end'; color?: string; size?: number }> = ({
  x, y, o, title, sub, anchor = 'start', color = C.ink, size = 44,
}) => {
  if (o <= 0.01) return null;
  const dx = anchor === 'start' ? 22 : -22;
  return (
    <g opacity={o} transform={`translate(${(1 - o) * (anchor === 'start' ? 24 : -24)} 0)`}>
      <rect x={anchor === 'start' ? x : x - 7} y={y - size * 0.82} width={7} height={size * (sub ? 1.75 : 1)} rx={3} fill={color} />
      <text x={x + dx} y={y} fontFamily={COND} fontSize={size} fontWeight={700} fill={C.ink} textAnchor={anchor}>{title}</text>
      {sub && <text x={x + dx} y={y + size * 0.78} fontSize={size * 0.6} fill={C.inkSoft} textAnchor={anchor}>{sub}</text>}
    </g>
  );
};

/** Rounded panel with a heading, used for side-by-side comparisons */
export const Card: React.FC<{ x: number; y: number; w: number; h: number; o?: number; title?: string; accent?: string; children?: React.ReactNode }> = ({
  x, y, w, h, o = 1, title, accent = C.ink, children,
}) => (
  <g opacity={o}>
    <rect x={x} y={y} width={w} height={h} rx={14} fill={C.panel} stroke={C.rule} strokeWidth={2} />
    <rect x={x} y={y} width={8} height={h} rx={4} fill={accent} />
    {title && <text x={x + 34} y={y + 58} fontFamily={COND} fontSize={42} fontWeight={700} fill={C.ink}>{title}</text>}
    {children}
  </g>
);

/** One qubit drawn as a dial: filled when it reads 1 */
export const Qubit: React.FC<{ x: number; y: number; r?: number; on: number; color: string; o?: number; label?: string }> = ({ x, y, r = 44, on, color, o = 1, label }) => (
  <g opacity={o}>
    <circle cx={x} cy={y} r={r} fill={C.panel} stroke={color} strokeWidth={4} />
    <circle cx={x} cy={y} r={r * 0.82 * on} fill={color} opacity={0.9} />
    <text x={x} y={y + r * 0.32} textAnchor="middle" fontSize={r * 0.9} fontWeight={700} fill={on > 0.5 ? '#fff' : C.inkSoft}>{on > 0.5 ? '1' : '0'}</text>
    {label && <text x={x} y={y + r + 30} textAnchor="middle" fontSize={22} fill={C.inkSoft}>{label}</text>}
  </g>
);

export const Arrow: React.FC<{ d: string; o?: number; color?: string; w?: number; dash?: string; id: string }> = ({ d, o = 1, color = C.ink, w = 3, dash, id }) => (
  <g opacity={o}>
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill={color} />
      </marker>
    </defs>
    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} markerEnd={`url(#${id})`} />
  </g>
);

/** Big condensed headline at the top-left of a scene */
export const Heading: React.FC<{ text: string; o: number; y?: number }> = ({ text, o, y = 112 }) => (
  <text x={110} y={y} fontFamily={COND} fontSize={64} fontWeight={700} fill={C.ink} opacity={o}>{text}</text>
);
