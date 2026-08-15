import React from 'react';
import { ChessPiece } from '@gameexplorer/ui';
import type { PieceType } from '@gameexplorer/shared';

export interface CapturedTrayProps {
  /** Pieces this player has captured, cheapest first (see summarizeMaterial). */
  pieces: PieceType[];
  /** Color of the captured pieces — the opposite of the capturer's. */
  color: 'white' | 'black';
  /**
   * Material lead in pawn units for THIS player. Only a positive value renders
   * (the badge belongs to whoever is ahead); 0 or negative shows nothing.
   */
  advantage: number;
  /** Who this tray belongs to, for the screen-reader summary. */
  ownerLabel: string;
}

const ICON = 18;
/** Pieces sit shoulder-to-shoulder; the SVG viewBox has its own padding. */
const OVERLAP = -5;

/**
 * The capture tray on a player card — every piece that player has taken, drawn
 * with the real board icons, plus a "+N" badge when they're ahead on material.
 *
 * The web twin of `apps/mobile/src/game/CapturedTray.tsx`; both read
 * `summarizeMaterial` from `@gameexplorer/shared`, so the trays and the badge
 * agree across platforms.
 *
 * It renders *inside* the player card rather than as a row beneath it, on
 * purpose: `GameScreenLayout` budgets the board column's height against a fixed
 * 46px card (`PLAYER_CARD_PX`), and on a short desktop screen anything that adds
 * height comes straight out of the board.
 */
export function CapturedTray({ pieces, color, advantage, ownerLabel }: CapturedTrayProps) {
  // Nothing to say yet — stay invisible until the first capture.
  if (pieces.length === 0 && advantage <= 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 min-w-0 overflow-hidden"
      aria-label={capturedLabel(pieces, advantage, ownerLabel)}
      role="img"
    >
      <div className="flex items-center shrink min-w-0">
        {pieces.map((type, i) => (
          <ChessPiece
            key={i}
            type={type}
            color={color}
            size={ICON}
            style={i === 0 ? undefined : { marginLeft: OVERLAP }}
          />
        ))}
      </div>
      {advantage > 0 && (
        <span className="text-[11px] font-bold text-fg-muted tabular-nums shrink-0">
          +{advantage}
        </span>
      )}
    </div>
  );
}

/**
 * "You captured 2 pawns, a knight — up 5" — the tray is pure iconography, so
 * screen readers get the whole thing as one sentence instead of a run of
 * "white pawn" labels from the individual SVGs.
 */
function capturedLabel(pieces: PieceType[], advantage: number, ownerLabel: string): string {
  const counts = new Map<PieceType, number>();
  for (const type of pieces) counts.set(type, (counts.get(type) ?? 0) + 1);

  const parts = [...counts].map(([type, n]) => (n === 1 ? `1 ${type}` : `${n} ${type}s`));
  const captures = parts.length ? `captured ${parts.join(', ')}` : 'captured nothing';
  const lead = advantage > 0 ? ` — up ${advantage} ${advantage === 1 ? 'point' : 'points'}` : '';
  return `${ownerLabel} ${captures}${lead}`;
}
