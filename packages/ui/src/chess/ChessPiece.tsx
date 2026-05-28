/**
 * ChessPiece — image-based chess piece component for web.
 *
 * Renders a simple <img> pointing to a piece image file. Drop your image set
 * into apps/web/public/pieces/ using the naming convention:
 *
 *   {color}_{type}.svg   (or .png — pass imageExt="png")
 *
 * Files needed (12 total):
 *   white_king.svg  white_queen.svg  white_rook.svg
 *   white_bishop.svg  white_knight.svg  white_pawn.svg
 *   black_king.svg  black_queen.svg  black_rook.svg
 *   black_bishop.svg  black_knight.svg  black_pawn.svg
 *
 * Same public API as ChessPiece.native.tsx so callers are portable.
 */

import React from 'react';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

export interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  /**
   * Rendered size. Accepts a pixel number (e.g. 45) or a CSS string
   * (e.g. "100%" to fill the containing element). Defaults to 45.
   */
  size?: number | string;
  /** Base URL for piece images. Defaults to '/pieces'. */
  basePath?: string;
  /** File extension for piece images. Defaults to 'svg'. */
  imageExt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function ChessPiece({
  type,
  color,
  size = 45,
  basePath = '/pieces',
  imageExt = 'svg',
  className,
  style,
}: ChessPieceProps) {
  const src = `${basePath}/${color}_${type}.${imageExt}`;

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={`${color} ${type}`}
      draggable={false}
      className={className}
      style={{ display: 'block', ...style }}
    />
  );
}

export default ChessPiece;
