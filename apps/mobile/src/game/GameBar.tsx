import { useState } from 'react';
import { View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { Sheet } from '@/components/ui/Sheet';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { BarButton, useTwoTapConfirm } from '@/game/BarButton';
import { MenuRow } from '@/game/MenuRow';
import type { GameAccent } from '@/game/GameScreenLayout';

export interface GameBarProps {
  /** Index into the timeline currently on the board (0 = starting position). */
  viewIndex: number;
  /** Timeline length — `total - 1` moves have been played. */
  total: number;
  /** Seek to a timeline index. Callers don't need to clamp; the bar does. */
  onSeek: (index: number) => void;
  /** Game accent for the menu highlights. */
  accent: GameAccent;
  /**
   * Turn the board around. Omit for games that can't flip — reversi's
   * `playerColor` doubles as its pass-and-play tap gate, so flipping it would
   * hand the turn to the wrong player.
   */
  onFlipBoard?: () => void;
  /** End the game as a draw. Omit for games without draws (reversi). */
  onAgreeDraw?: () => void;
  /** Abandon this game and go back to setup. */
  onNewGame: () => void;
  /** Forfeit. Asks for a second tap first, so a stray touch can't throw a game. */
  onResign: () => void;
  /**
   * Go only — pass the turn. A first-class button rather than a menu row
   * because in Go a pass is an ordinary move and two of them are how every game
   * ends; burying it would hide the only way to finish. Omitted by the other
   * three games, whose bars render exactly as before.
   */
  onPass?: () => void;
  /** Not the player's live turn — there is no turn to pass. */
  passDisabled?: boolean;
  /** Game already over — nothing left to concede or agree. */
  gameOver?: boolean;
  /**
   * Training only — reveal the best move at a rating cost. Omit it in the other
   * modes and the button stays the disabled "coming soon" placeholder.
   */
  onHint?: () => void;
  /** Not the player's live turn — a hint has nothing to answer right now. */
  hintDisabled?: boolean;
  /** A hint search is in flight. */
  hintPending?: boolean;
  /** Hints taken so far, shown as a badge on the button. */
  hintsUsed?: number;
  /**
   * Open game review. Omit and the menu row stays the "coming soon"
   * placeholder. Screens only pass it once the game is over — mid-game it would
   * be a free, unlimited hint, which is exactly what training charges for.
   */
  onAnalysis?: () => void;
}

/**
 * The in-game control bar, pinned under the board for the whole game.
 *
 * Everything a player reaches for mid-game lives here rather than scattered
 * between the header and the sidebar: the overflow menu (flip / draw / analysis
 * / new game), the resign flag, hints, and stepping through the history. It
 * replaces the four 28px arrows that used to sit in the move-list header — below
 * the 44pt touch minimum, and scrolled off screen exactly when a player wanted
 * them.
 *
 * Hint and Review are opt-in: a screen that passes the handler gets a live
 * control, and one that doesn't keeps the disabled "coming soon" placeholder, so
 * an unsupported mode reads as unbuilt rather than broken. Hint is training's;
 * Review is offered once the game is over.
 */
export function GameBar({
  viewIndex,
  total,
  onSeek,
  accent,
  onFlipBoard,
  onAgreeDraw,
  onNewGame,
  onResign,
  onPass,
  passDisabled = false,
  gameOver = false,
  onHint,
  hintDisabled = false,
  hintPending = false,
  hintsUsed = 0,
  onAnalysis,
}: GameBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { play } = useGameSfx();
  const [menuOpen, setMenuOpen] = useState(false);

  const last = total - 1;
  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < last;

  const seek = (index: number) => {
    const next = Math.max(0, Math.min(last, index));
    if (next === viewIndex) return;
    play('select');
    onSeek(next);
  };

  // Resign asks for a second tap first, so a stray touch can't throw a game.
  const { armed: confirming, press: handleResign } = useTwoTapConfirm(onResign);

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
        }}
      >
        <BarButton glyph="☰" label="Game menu" onPress={() => setMenuOpen(true)} />
        <BarButton
          glyph="⚑"
          label={confirming ? 'Confirm resign' : 'Resign'}
          hint={confirming ? undefined : 'Tap twice to resign the game'}
          onPress={handleResign}
          disabled={gameOver}
          danger={confirming}
        />
        {onPass && (
          <BarButton
            glyph="⇥"
            label="Pass"
            hint="Hand the turn over — two passes in a row end the game"
            onPress={onPass}
            disabled={gameOver || passDisabled}
          />
        )}
        {onHint ? (
          <BarButton
            glyph={hintPending ? '⏳' : '💡'}
            label={hintsUsed > 0 ? `Hint — ${hintsUsed} used` : 'Hint'}
            hint="Shows the best move — costs 2 rating points"
            badge={hintsUsed > 0 ? String(hintsUsed) : undefined}
            onPress={onHint}
            disabled={gameOver || hintDisabled || hintPending}
          />
        ) : (
          <BarButton glyph="💡" label="Hint (coming soon)" onPress={() => {}} disabled />
        )}

        {/* Hairline between the game actions and the history controls. */}
        <View style={{ width: 1, marginVertical: 6, backgroundColor: COLORS.border }} />

        <BarButton
          glyph="◀"
          label="Previous move"
          onPress={() => seek(viewIndex - 1)}
          disabled={!canGoBack}
        />
        <BarButton
          glyph="▶"
          label="Next move"
          onPress={() => seek(viewIndex + 1)}
          disabled={!canGoForward}
        />
      </View>

      <GameMenu
        open={menuOpen}
        accent={accent}
        gameOver={gameOver}
        onClose={() => setMenuOpen(false)}
        onFlipBoard={onFlipBoard}
        onAgreeDraw={onAgreeDraw}
        onNewGame={onNewGame}
        onAnalysis={onAnalysis}
      />
    </>
  );
}

/**
 * The bar's overflow menu — a bottom sheet over a dim backdrop, matching
 * `GameResultScreen`'s Modal treatment. Actions close the sheet before firing so
 * the screen underneath isn't repainting behind a dismissing modal.
 */
function GameMenu({
  open,
  accent,
  gameOver,
  onClose,
  onFlipBoard,
  onAgreeDraw,
  onNewGame,
  onAnalysis,
}: {
  open: boolean;
  accent: GameAccent;
  gameOver: boolean;
  onClose: () => void;
  onFlipBoard?: () => void;
  onAgreeDraw?: () => void;
  onNewGame: () => void;
  onAnalysis?: () => void;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const accentColor = GAME_ACCENTS[accent].base;

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <Sheet open={open} onClose={onClose} closeLabel="Close menu">
      {onFlipBoard && (
        <MenuRow glyph="🔄" label="Flip board" onPress={run(onFlipBoard)} accent={accentColor} />
      )}
      {onAgreeDraw && (
        <MenuRow
          glyph="🤝"
          label="Agree to a draw"
          onPress={run(onAgreeDraw)}
          disabled={gameOver}
          accent={accentColor}
        />
      )}
      {onAnalysis ? (
        <MenuRow glyph="📈" label="Review game" onPress={run(onAnalysis)} accent={accentColor} />
      ) : (
        <MenuRow glyph="📈" label="Analysis" soon accent={accentColor} />
      )}
      <MenuRow glyph="♟️" label="New game" onPress={run(onNewGame)} accent={accentColor} />
    </Sheet>
  );
}
