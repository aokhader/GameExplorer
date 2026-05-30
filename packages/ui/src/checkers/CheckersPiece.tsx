import React from 'react';

export type CheckersPieceType = 'man' | 'king';
export type CheckersColor = 'white' | 'black';

export interface CheckersPieceProps {
  type: CheckersPieceType;
  color: CheckersColor;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function CheckersPiece({
  type,
  color,
  size = 45,
  className,
  style,
}: CheckersPieceProps) {
  const isWhite = color === 'white';

  const fill      = isWhite ? '#faf0e0' : '#2c1b08';
  const stroke    = isWhite ? '#5c3d1e' : '#e8d5b7';
  const highlight = isWhite ? '#ffffff' : '#5c4033';
  const shadow    = isWhite ? '#c8b49a' : '#1a0f08';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 45 45"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Drop shadow */}
      <circle cx="23" cy="24.5" r="17" fill={shadow} opacity="0.35" />

      {/* Main disc */}
      <circle cx="22.5" cy="22" r="17" fill={fill} stroke={stroke} strokeWidth="1.5" />

      {/* Highlight sheen (top-left quadrant) */}
      <ellipse cx="17" cy="16.5" rx="6.5" ry="4.5" fill={highlight} opacity="0.35" />

      {/* King indicator: inner ring */}
      {type === 'king' && (
        <circle
          cx="22.5"
          cy="22"
          r="11"
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          opacity="0.8"
        />
      )}
    </svg>
  );
}
