import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import {
  unfinishedGameName,
  unfinishedGameSummary,
  type UnfinishedGame,
} from '@gameexplorer/client/game/unfinishedGame';
import type { SettleOutcome } from '@gameexplorer/client/game/settleUnfinishedGame';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Button } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';

type Settle = (options: { resign: boolean }) => Promise<SettleOutcome>;

/** What the player reads after a settle that did not close the game. */
function settleMessage(outcome: SettleOutcome | Error): string | null {
  if (outcome instanceof Error) return "Couldn't save the result. Check your connection and try again.";
  if (outcome.kind === 'busy') return 'That result is still being saved. Try again in a moment.';
  return null;
}

export interface ContinueCardProps {
  saved: UnfinishedGame;
  onResume: () => void;
  onSettle: Settle;
  settling: boolean;
  /** Name the game and show its piece — on the launcher, where it could be any of them. */
  showGame?: boolean;
}

/**
 * An unfinished game, with *Resume* and *Discard* (`ux-fix-ideas.md` §2.4).
 *
 * Discarding a **rated** game resigns it, so that tap asks first and says so in
 * plain words — no dialog: the question replaces the buttons in place, and the
 * card stays where it was. A casual game just goes.
 *
 * A game that ended while its rated result could not be written has nothing
 * left to resume, so it offers only *Save result*.
 */
export function ContinueCard({ saved, onResume, onSettle, settling, showGame = false }: ContinueCardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const settle = (resign: boolean) => {
    setMessage(null);
    onSettle({ resign })
      .then((outcome) => {
        setConfirming(false);
        setMessage(settleMessage(outcome));
      })
      .catch((err: Error) => setMessage(settleMessage(err)));
  };

  const owed = !!saved.end;
  const name = unfinishedGameName(saved.game);
  const title = owed ? `${name} result not saved` : showGame ? `Continue ${name}` : 'Game in progress';

  let actions: ReactNode;
  if (owed) {
    actions = <Button label="Save result" onPress={() => settle(false)} loading={settling} />;
  } else if (confirming) {
    actions = (
      <View style={{ gap: SPACING['2.5'] }}>
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.label }}>
          Discarding a rated game counts as a loss.
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
          <Button
            label="Resign it"
            variant="danger"
            haptic="warning"
            loading={settling}
            onPress={() => settle(true)}
            style={{ flex: 1 }}
          />
          <Button label="Keep it" variant="secondary" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
        </View>
      </View>
    );
  } else {
    actions = (
      <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
        <Button label="Resume" onPress={onResume} style={{ flex: 1 }} />
        <Button
          label="Discard"
          variant="secondary"
          loading={settling}
          onPress={() => (saved.rated ? setConfirming(true) : settle(true))}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: RADIUS['2xl'],
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
        gap: SPACING[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3] }}>
        {showGame && <GamePieceIcon game={saved.game} size={30} />}
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body }}>{title}</Text>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label, marginTop: 2 }}>
            {unfinishedGameSummary(saved)}
          </Text>
        </View>
      </View>
      {actions}
      {message && (
        <Text accessibilityLiveRegion="polite" style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
          {message}
        </Text>
      )}
    </View>
  );
}

export interface SetupStartFooterProps {
  label: string;
  onStart: () => void;
  disabled?: boolean;
  /** This game's unfinished game, if any. Only a rated one stands in the way of Start. */
  saved: UnfinishedGame | null;
  onResume: () => void;
  onSettle: Settle;
  settling: boolean;
  /** Start leaves for another screen (puzzles, matchmaking) rather than replacing the saved game. */
  leavesGame?: boolean;
}

/**
 * The pinned Start button, with the one question a rated unfinished game makes
 * it ask (`ux-fix-ideas.md` §2.4): there is one unfinished game per game type,
 * and a rated one closes only by finishing or resigning — so starting another
 * means resuming it or resigning it first. A casual one is simply replaced by
 * the new game's first move, and Start asks nothing.
 *
 * While a game is waiting, Start steps down to a secondary button: the Continue
 * card's *Resume* is the screen's main action then.
 */
export function SetupStartFooter({
  label,
  onStart,
  disabled,
  saved,
  onResume,
  onSettle,
  settling,
  leavesGame = false,
}: SetupStartFooterProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const blocks = !!saved && saved.rated && !leavesGame;

  if (!blocks || !asking) {
    return (
      <Button
        label={label}
        onPress={() => (blocks ? setAsking(true) : onStart())}
        disabled={disabled}
        variant={saved && !leavesGame ? 'secondary' : 'primary'}
      />
    );
  }

  const owed = !!saved.end;
  const replace = () => {
    setMessage(null);
    onSettle({ resign: !owed })
      .then((outcome) => {
        const problem = settleMessage(outcome);
        if (problem) setMessage(problem);
        else {
          setAsking(false);
          onStart();
        }
      })
      .catch((err: Error) => setMessage(settleMessage(err)));
  };

  return (
    <View style={{ gap: SPACING['2.5'] }}>
      <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.sm, textAlign: 'center' }}>
        {owed
          ? `Your last rated ${unfinishedGameName(saved.game).toLowerCase()} result isn't saved yet.`
          : `You have an unfinished rated ${unfinishedGameName(saved.game).toLowerCase()} game.`}
      </Text>
      {message && (
        <Text style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: FONT_SIZES.label, textAlign: 'center' }}>
          {message}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
        {!owed && <Button label="Resume it" onPress={onResume} style={{ flex: 1 }} />}
        <Button
          label={owed ? 'Save it and start' : 'Resign and start'}
          variant={owed ? 'primary' : 'danger'}
          haptic={owed ? undefined : 'warning'}
          loading={settling}
          onPress={replace}
          style={{ flex: 1 }}
        />
      </View>
      <Button label="Cancel" variant="ghost" onPress={() => setAsking(false)} />
    </View>
  );
}
