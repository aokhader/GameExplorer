/**
 * ChessPiece — React Native version.
 * Same public API as ChessPiece.tsx.
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps
 * automatically pick up this file when they import from '@gameexplorer/ui'.
 *
 * Images are imported from the same packages/ui/assets/pieces/ directory as
 * the web version — one source of truth for both platforms. Metro requires
 * static require() / import calls (no dynamic paths), so they are listed here
 * explicitly, just like the web version.
 */

import React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
// expo-image (not RN core Image) — its renderer decodes SVG assets on native.
// RN's core <Image> only handles raster formats, so chess SVGs render blank.
import { Image } from 'expo-image';

// Same asset paths as ChessPiece.tsx — Metro bundles these at compile time.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PIECE_IMAGES: Record<string, any> = {
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
  /** Rendered size in logical pixels (square). Defaults to 45. */
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function ChessPiece({ type, color, size = 45, style }: ChessPieceProps) {
  const source = PIECE_IMAGES[`${color}_${type}`];

  return (
    <Image
      source={source}
      style={[{ width: size, height: size }, style as ImageStyle]}
      contentFit="contain"
      accessibilityLabel={`${color} ${type}`}
    />
  );
}

export default ChessPiece;
