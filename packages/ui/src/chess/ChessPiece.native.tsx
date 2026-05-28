/**
 * ChessPiece — React Native version.
 * Same public API as ChessPiece.tsx.
 *
 * Metro bundler requires static require() calls for images — they cannot be
 * computed at runtime. Add your piece images to the React Native app's
 * assets/pieces/ directory and update the PIECE_IMAGES map below.
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps automatically
 * pick up this file when they import from '@gameexplorer/ui'.
 *
 * Excluded from the web TypeScript build via tsconfig.json "exclude" list.
 */

import React from 'react';
import { Image, ImageStyle } from 'react-native';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

export interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  /** Rendered size in logical pixels (square). Defaults to 45. */
  size?: number;
  style?: ImageStyle;
}

// ---------------------------------------------------------------------------
// Static require map — Metro needs these to be literal require() calls.
// Update paths to match your mobile app's asset location.
// ---------------------------------------------------------------------------
const PIECE_IMAGES: Record<string, ReturnType<typeof require>> = {
  white_king:   require('../../../assets/pieces/white_king.png'),
  white_queen:  require('../../../assets/pieces/white_queen.png'),
  white_rook:   require('../../../assets/pieces/white_rook.png'),
  white_bishop: require('../../../assets/pieces/white_bishop.png'),
  white_knight: require('../../../assets/pieces/white_knight.png'),
  white_pawn:   require('../../../assets/pieces/white_pawn.png'),
  black_king:   require('../../../assets/pieces/black_king.png'),
  black_queen:  require('../../../assets/pieces/black_queen.png'),
  black_rook:   require('../../../assets/pieces/black_rook.png'),
  black_bishop: require('../../../assets/pieces/black_bishop.png'),
  black_knight: require('../../../assets/pieces/black_knight.png'),
  black_pawn:   require('../../../assets/pieces/black_pawn.png'),
};

export function ChessPiece({ type, color, size = 45, style }: ChessPieceProps) {
  const key = `${color}_${type}`;
  const source = PIECE_IMAGES[key];

  return (
    <Image
      source={source}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel={`${color} ${type}`}
    />
  );
}

export default ChessPiece;
