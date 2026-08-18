import { Text, View } from 'react-native';
import { COLORS, ChessPiece, useThemeName } from '@gameexplorer/ui';
import type { PieceType } from '@gameexplorer/shared';
import { FONTS } from '@/theme/typography';

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
 * The capture tray under a player card — every piece that player has taken, as
 * the real board icons, plus a "+N" badge when they're ahead on material.
 *
 * Icons come straight from the board's `ChessPiece`, so a captured knight looks
 * like the knight the player just took. The badge reads material off the board
 * (see `summarizeMaterial`), which is why it can show +8 with an empty tray
 * after a promotion — that is the truthful number, not a mismatch.
 */
export function CapturedTray({ pieces, color, advantage, ownerLabel }: CapturedTrayProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  // Nothing to say yet — keep the card compact until the first capture.
  if (pieces.length === 0 && advantage <= 0) return null;

  return (
    <View
      accessible
      accessibilityLabel={capturedLabel(pieces, advantage, ownerLabel)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {pieces.map((type, i) => (
          <ChessPiece
            key={i}
            type={type}
            color={color}
            size={ICON}
            style={i === 0 ? undefined : { marginLeft: OVERLAP }}
          />
        ))}
      </View>
      {advantage > 0 && (
        <Text style={{ color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.bodyBold }}>
          +{advantage}
        </Text>
      )}
    </View>
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
