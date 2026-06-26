import React from 'react';
import { REVERSI_DISC_COLORS } from './tokens';

export type ReversiDiscColor = 'black' | 'white';

export interface ReversiDiscProps {
  color: ReversiDiscColor;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function ReversiDisc({ color, size = 40, className, style }: ReversiDiscProps) {
  // Consume the shared token so web + the native primitive (ReversiDisc.native.tsx)
  // draw identical discs from one source of truth.
  const { fill, stroke, highlight, shadow } = REVERSI_DISC_COLORS[color];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Drop shadow */}
      <circle cx="20.5" cy="21.5" r="16" fill={shadow} opacity="0.4" />
      {/* Main disc */}
      <circle cx="20" cy="20" r="16" fill={fill} stroke={stroke} strokeWidth="1" />
      {/* Top-left sheen */}
      <ellipse cx="15" cy="14.5" rx="6" ry="4" fill={highlight} opacity="0.35" />
    </svg>
  );
}
