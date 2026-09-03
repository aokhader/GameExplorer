import { useState } from 'react';
import { View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import { EMOTES, type Emote } from '@finesse/shared';
import { Sheet } from '@/components/ui/Sheet';
import { BarButton, useTwoTapConfirm } from '@/game/BarButton';
import { MenuRow } from '@/game/MenuRow';
import type { GameAccent } from '@/game/GameScreenLayout';

export interface OnlineGameBarProps {
  accent: GameAccent;
  /** The game is running — only then is there something to concede or agree. */
  active: boolean;
  /** Turn the board around. Omitted for reversi, whose board never flips. */
  onFlipBoard?: () => void;
  /** Offer a draw. Omitted for reversi, which has no draw offers. */
  onOfferDraw?: () => void;
  /**
   * Abort without a rating change. Omitted once the game is past
   * `ABORT_MOVE_LIMIT` moves, at which point the only way out is to resign.
   */
  onAbort?: () => void;
  onResign: () => void;
  onOpenChat: () => void;
  /** Messages that arrived while the chat sheet was closed. */
  unread: number;
  onSendEmote: (emote: Emote) => void;
  /** Share a spectate link for this game. */
  onShareSpectate?: () => void;
  /** Open the block/report sheet. Omitted when the opponent has no user id. */
  onOpponentMenu?: () => void;
}

/**
 * The in-game bar for an online game — the counterpart to single-player's
 * `GameBar`, built from the same `BarButton`/`MenuRow` parts so the two read as
 * one control in different modes.
 *
 * The action set is what actually differs. There is no history scrubbing here:
 * an online game's state is a single server snapshot, not a local timeline, so
 * the ◀ ▶ pair has nothing to step through. In their place are the two things
 * only a game against a person needs — chat and reactions.
 */
export function OnlineGameBar({
  accent,
  active,
  onFlipBoard,
  onOfferDraw,
  onAbort,
  onResign,
  onOpenChat,
  unread,
  onSendEmote,
  onShareSpectate,
  onOpponentMenu,
}: OnlineGameBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [menuOpen, setMenuOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const accentColor = GAME_ACCENTS[accent].base;

  // Resigning a rated game against a person is the most expensive tap in the
  // app, so it asks twice — same treatment as single-player.
  const { armed: confirming, press: handleResign } = useTwoTapConfirm(onResign);

  const run = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

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
          glyph="💬"
          label={unread > 0 ? `Chat — ${unread} unread` : 'Chat'}
          badge={unread > 0 ? String(unread) : undefined}
          onPress={onOpenChat}
        />
        <BarButton
          glyph="😀"
          label="Send a reaction"
          onPress={() => setEmoteOpen(true)}
          disabled={!active}
        />

        {/* Hairline between the talking and the conceding. */}
        <View style={{ width: 1, marginVertical: 6, backgroundColor: COLORS.border }} />

        <BarButton
          glyph="⚑"
          label={confirming ? 'Confirm resign' : 'Resign'}
          hint={confirming ? undefined : 'Tap twice to resign the game'}
          onPress={handleResign}
          disabled={!active}
          danger={confirming}
        />
      </View>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} closeLabel="Close menu">
        {onFlipBoard && (
          <MenuRow glyph="🔄" label="Flip board" onPress={run(onFlipBoard)} accent={accentColor} />
        )}
        {onOfferDraw && (
          <MenuRow
            glyph="🤝"
            label="Offer a draw"
            onPress={run(onOfferDraw)}
            disabled={!active}
            accent={accentColor}
          />
        )}
        {onAbort && (
          <MenuRow
            glyph="🛑"
            label="Abort game"
            detail="No rating change — only in the first few moves"
            onPress={run(onAbort)}
            disabled={!active}
            accent={accentColor}
          />
        )}
        {onShareSpectate && (
          <MenuRow
            glyph="📺"
            label="Share spectate link"
            detail="Let someone watch this game live"
            onPress={run(onShareSpectate)}
            accent={accentColor}
          />
        )}
        {onOpponentMenu && (
          <MenuRow
            glyph="🚩"
            label="Block or report"
            danger
            onPress={run(onOpponentMenu)}
            accent={accentColor}
          />
        )}
      </Sheet>

      <Sheet open={emoteOpen} onClose={() => setEmoteOpen(false)} closeLabel="Close reactions">
        {/* 4-up rather than one row of eight: `BarButton` splits its row evenly,
            and eight cells on a phone lands each one under the 44pt minimum. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 }}>
          {EMOTES.map((e) => (
            <View key={e} style={{ flexBasis: '22%', flexGrow: 1, minHeight: 56 }}>
              <BarButton
                glyph={e}
                label={`Send ${e}`}
                onPress={() => {
                  setEmoteOpen(false);
                  onSendEmote(e);
                }}
              />
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}
