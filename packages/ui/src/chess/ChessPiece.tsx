/**
 * ChessPiece — web component for chess pieces.
 *
 * Images live in packages/ui/assets/pieces/ and are imported statically so
 * that Turbopack (web) and Metro (React Native) both bundle the same files.
 *
 * Naming convention:  {color}_{type}.svg
 *   white_king.svg   white_queen.svg   white_rook.svg
 *   white_bishop.svg white_knight.svg  white_pawn.svg
 *   black_king.svg   black_queen.svg   black_rook.svg
 *   black_bishop.svg black_knight.svg  black_pawn.svg
 *
 * Replace the placeholder SVGs in packages/ui/assets/pieces/ with your own
 * artwork. Both web and mobile automatically pick up the same files.
 */

import React from 'react';

// Static imports — Turbopack processes these into hashed asset URLs.
import whitePawn   from '../../assets/pieces/white_pawn.svg';
import whiteKnight from '../../assets/pieces/white_knight.svg';
import whiteBishop from '../../assets/pieces/white_bishop.svg';
import whiteRook   from '../../assets/pieces/white_rook.svg';
import whiteQueen  from '../../assets/pieces/white_queen.svg';
import whiteKing   from '../../assets/pieces/white_king.svg';
import blackPawn   from '../../assets/pieces/black_pawn.svg';
import blackKnight from '../../assets/pieces/black_knight.svg';
import blackBishop from '../../assets/pieces/black_bishop.svg';
import blackRook   from '../../assets/pieces/black_rook.svg';
import blackQueen  from '../../assets/pieces/black_queen.svg';
import blackKing   from '../../assets/pieces/black_king.svg';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

const PIECE_IMAGES: Record<string, string> = {
  white_pawn:   whitePawn,
  white_knight: whiteKnight,
  white_bishop: whiteBishop,
  white_rook:   whiteRook,
  white_queen:  whiteQueen,
  white_king:   whiteKing,
  black_pawn:   blackPawn,
  black_knight: blackKnight,
  black_bishop: blackBishop,
  black_rook:   blackRook,
  black_queen:  blackQueen,
  black_king:   blackKing,
};

export interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  /**
   * Rendered size. Pass a pixel number (e.g. 45) or a CSS string such as
   * "100%" to fill the containing element. Defaults to 45.
   */
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function ChessPiece({ type, color, size = 45, className, style }: ChessPieceProps) {
  // Turbopack/webpack returns a StaticImageData object { src, width, height }
  // for static image imports, not a plain string.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = PIECE_IMAGES[`${color}_${type}`];
  const src: string = typeof raw === 'string' ? raw : (raw?.src ?? '');

  return (
    <img
      src={src}
      alt={`${color} ${type}`}
      draggable={false}
      className={className}
      style={{
        display: 'block',
        // Use CSS for dimensions — HTML width/height attributes don't accept
        // percentage strings, but CSS width/height do.
        width: size,
        height: size,
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}

export default ChessPiece;
