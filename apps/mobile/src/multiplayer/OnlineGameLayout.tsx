import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ABORT_MOVE_LIMIT } from '@finesse/shared';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import { Button, Screen, BackHeader, GlowBackdrop } from '@/components/ui';
import { GameScreenLayout, type GameAccent } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { WEB_URL } from '@/config/support';
import { FONTS } from '@/theme/typography';
import { Clock } from './Clock';
import { ChatSheet } from './ChatSheet';
import { EmoteOverlay } from './EmoteOverlay';
import { OpponentSheet } from './OpponentSheet';
import { MatchmakingPanel, type TimeControlOption } from './MatchmakingPanel';
import { OnlineGameBar } from './OnlineGameBar';
import { useEmotes } from './useEmotes';
import { useReconnectOnForeground } from './useReconnectOnForeground';
import type { GameSession } from './session';

export interface OnlineGameLayoutProps {
  session: GameSession;
  accent: GameAccent;
  /** Heading on the matchmaking panel, e.g. "Online Chess". */
  title: string;
  /** Where the header back arrow points with no navigation history. */
  backHref: string;
  timeControls: TimeControlOption[];
  /** The board, already wired to `session.sendMove` by the screen. */
  board: ReactNode;
  /** Move rows, formatted per game by the screen. */
  moveList: ReactNode;
  /** Optional content above the opponent card (reversi's disc-count bar). */
  topExtras?: ReactNode;
  /** Chess and checkers offer draws; reversi does not. */
  showDraw?: boolean;
  clockFormat: (ms: number) => string;
  /** Below this many ms the running clock enters the danger state. */
  lowClockMs?: number;
  /** Turn the board around. Omit for reversi. */
  onFlipBoard?: () => void;
  /** Leave online mode and go back to the game's setup screen. */
  onExit: () => void;
}

/**
 * The native online-game shell — the counterpart to web's `GameLayout`, over the
 * same `useGameSession` from `packages/client`. Nothing about the protocol,
 * clocks, matchmaking or invites is re-implemented here; this file is markup and
 * phone-shaped layout decisions, which is what Phase 4 was always meant to be.
 *
 * Where the two platforms differ, it is because a phone has one column:
 *  - Web's side rail (moves, chat, actions) becomes the scrolling area under the
 *    board plus a pinned bar; chat moves behind a sheet with an unread badge.
 *  - The matchmaking panel is a whole screen rather than a centred card.
 *  - Reactions float over the board instead of stacking in the rail.
 */
export function OnlineGameLayout({
  session: s,
  accent,
  title,
  backHref,
  timeControls,
  board,
  moveList,
  topExtras,
  showDraw = true,
  clockFormat,
  lowClockMs = 10_000,
  onFlipBoard,
  onExit,
}: OnlineGameLayoutProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [opponentOpen, setOpponentOpen] = useState(false);
  // Messages already read, as a count rather than a flag so the badge can say
  // how many arrived. Only *closing* the sheet records it: while the sheet is
  // open the player is looking at the log, so unread is zero by definition and
  // nothing has to be synced from an effect as messages stream in.
  const [seenChat, setSeenChat] = useState(0);
  const emotes = useEmotes(s);
  useReconnectOnForeground();

  const inGame = s.status === 'active' || s.status === 'ended';
  const isActive = s.status === 'active';
  const unread = chatOpen ? 0 : Math.max(0, s.chatLog.length - seenChat);

  const closeChat = () => {
    setSeenChat(s.chatLog.length);
    setChatOpen(false);
  };

  const shareSpectate = () => {
    if (!s.gameId) return;
    const url = `${WEB_URL}/spectate/${s.gameId}`;
    void Share.share({ message: url, url }).catch(() => {});
  };

  // ── Matchmaking ───────────────────────────────────────────────────────────
  if (!inGame) {
    return (
      <Screen>
        <GlowBackdrop
          blooms={[
            { cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: GAME_ACCENTS[accent].base, opacity: 0.16 },
          ]}
        />
        <BackHeader fallbackHref={backHref} />
        <Text
          style={{
            color: COLORS.fg,
            fontFamily: FONTS.display,
            fontSize: 26,
            marginBottom: 6,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 14, marginBottom: 24 }}>
          Play a real opponent on a server clock.
        </Text>

        {/* An invite link opens this screen directly, bypassing the setup screen
            and its sign-in card — so the requirement has to be stated here too.
            Without it a signed-out player who taps a friend's link waits on
            "Connecting…" forever, since the socket authenticates with a Supabase
            token they do not have. */}
        {!s.loading && !s.user ? (
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.warning,
              backgroundColor: COLORS.surfaceMuted,
              padding: 20,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.bodyBold, fontSize: 15 }}>
              Sign in to play online
            </Text>
            <Text
              style={{ color: COLORS.warningHover, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}
            >
              Online games are matched on your rating and saved to your history,
              so they need an account.
            </Text>
            <Button
              label="Sign in"
              variant="secondary"
              onPress={() => router.push('/(auth)/sign-in' as never)}
            />
            <Button label="Back to setup" variant="ghost" onPress={onExit} />
          </View>
        ) : /* Redeeming an invite link takes a round trip; without this the
              screen sits on the matchmaking form and looks like the tap did
              nothing. */
        s.accepting ? (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 14 }}>
            <ActivityIndicator size="large" color={GAME_ACCENTS[accent].base} />
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 18 }}
            >
              Joining game…
            </Text>
          </View>
        ) : (
          <MatchmakingPanel
            session={s}
            accent={accent}
            timeControls={timeControls}
            onExit={onExit}
          />
        )}
      </Screen>
    );
  }

  // ── Live game ─────────────────────────────────────────────────────────────
  const oppName = s.opponent?.username ?? 'Opponent';
  const oppRating = s.opponent?.rating;
  const yourTurn = isActive && s.activeColor === s.myColor;
  const oppTurn = isActive && s.activeColor !== s.myColor;

  const oppSubline =
    oppRating != null ? `${oppRating}${oppTurn ? ' · thinking…' : ''}` : oppTurn ? 'thinking…' : undefined;

  // All three game states carry a `moveHistory`, but the union has no common
  // member the compiler will read without narrowing — and the layout is
  // deliberately game-agnostic.
  const moveCount = (s.gameState as { moveHistory?: unknown[] } | null)?.moveHistory?.length ?? 0;

  return (
    <>
      <GameScreenLayout
        accent={accent}
        backHref={backHref}
        title={title}
        topCard={
          <>
            {topExtras}
            <PlayerCard
              name={oppName}
              initial={(oppName.trim()[0] ?? 'O').toUpperCase()}
              subline={oppSubline}
              active={oppTurn}
              right={
                <Clock
                  ms={s.oppClockMs}
                  active={isActive && s.activeColor !== s.myColor}
                  format={clockFormat}
                  lowClockMs={lowClockMs}
                />
              }
            />
            {/* Your own connection, not theirs. Without this the board simply
                stops accepting moves and the clock keeps running, which reads
                as the app having frozen. */}
            {!s.connected && (
              <View
                accessibilityLiveRegion="assertive"
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.danger,
                  backgroundColor: COLORS.dangerMuted,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                {/* The server pauses the clock and holds the game for 60s before
                    forfeiting (DISCONNECT_GRACE_TTL in websocket/index.ts), so
                    the honest message is "you have a minute", not "you are
                    losing time". */}
                <Text
                  style={{
                    color: COLORS.dangerHover,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  Reconnecting… your game is held for about a minute.
                </Text>
              </View>
            )}

            {s.opponentGone && (
              <View
                accessibilityLiveRegion="polite"
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  // No warning-tint token exists (only danger has one), so this
                  // follows `TrainingSetup`: muted surface, warning border and
                  // warning text.
                  borderColor: COLORS.warning,
                  backgroundColor: COLORS.surfaceMuted,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    color: COLORS.warningHover,
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  {`Opponent disconnected — waiting ${Math.ceil(s.opponentGraceMs / 1000)}s`}
                </Text>
              </View>
            )}
          </>
        }
        board={board}
        bottomCard={
          <PlayerCard
            name={`You (${s.username})`}
            initial={(s.username?.trim()[0] ?? 'Y').toUpperCase()}
            isYou
            active={yourTurn}
            subline={yourTurn ? 'your move' : 'waiting…'}
            right={
              <Clock
                ms={s.myClockMs}
                active={isActive && s.activeColor === s.myColor}
                format={clockFormat}
                lowClockMs={lowClockMs}
              />
            }
          />
        }
        sidebar={
          <>
            {/* A draw offer expires with the game, so it sits above everything
                else the player might be reading. */}
            {showDraw && s.drawOffered && (
              <View
                accessibilityLiveRegion="polite"
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.accent,
                  backgroundColor: COLORS.accentMuted,
                  padding: 12,
                  gap: 10,
                }}
              >
                <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>
                  Opponent offers a draw
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Accept" onPress={s.acceptDraw} style={{ flex: 1 }} />
                  <Button label="Decline" variant="danger" onPress={s.declineDraw} style={{ flex: 1 }} />
                </View>
              </View>
            )}

            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceAlt,
                padding: 12,
                gap: 6,
              }}
            >
              <Text
                style={{
                  color: COLORS.fgMuted,
                  fontFamily: FONTS.displaySemi,
                  fontSize: 12,
                  letterSpacing: 0.6,
                }}
              >
                MOVES
              </Text>
              {moveList}
            </View>
          </>
        }
        bottomBar={
          <OnlineGameBar
            accent={accent}
            active={isActive}
            onFlipBoard={onFlipBoard}
            onOfferDraw={showDraw ? s.offerDraw : undefined}
            onAbort={moveCount < ABORT_MOVE_LIMIT ? s.abort : undefined}
            onResign={s.resign}
            onOpenChat={() => setChatOpen(true)}
            unread={unread}
            onSendEmote={emotes.send}
            onShareSpectate={s.gameId ? shareSpectate : undefined}
            onOpponentMenu={s.opponent?.userId ? () => setOpponentOpen(true) : undefined}
          />
        }
      />

      <EmoteOverlay reactions={emotes.reactions} />

      <ChatSheet
        open={chatOpen}
        onClose={closeChat}
        log={s.chatLog}
        myUserId={s.user?.id ?? null}
        text={s.chatText}
        onChangeText={s.setChatText}
        onSend={s.sendChat}
        canSend={isActive}
      />

      {s.opponent?.userId && (
        <OpponentSheet
          open={opponentOpen}
          onClose={() => setOpponentOpen(false)}
          opponentId={s.opponent.userId}
          opponentName={oppName}
          gameId={s.gameId}
        />
      )}

      <OnlineResult session={s} onExit={onExit} />
    </>
  );
}

/**
 * Game over. Split out because the rating block has to be derived from the two
 * `RatingInfo` payloads and the abort case has no rating at all — inline, that
 * arithmetic buried the layout above it.
 */
function OnlineResult({ session: s, onExit }: { session: GameSession; onExit: () => void }) {
  const endData = s.endData;
  const aborted = s.aborted && !endData;
  const open = s.status === 'ended' && (!!endData || s.aborted);

  const result: GameResult = aborted
    ? 'aborted'
    : s.myResult === 'win'
      ? 'win'
      : s.myResult === 'loss'
        ? 'loss'
        : 'draw';

  const me = endData ? (s.isWhite ? endData.white : endData.black) : null;
  const rating =
    me && !aborted
      ? {
          // `before` is derived from after − delta; the payload carries no
          // separate field for it.
          before: me.ratingAfter - me.ratingDelta,
          after: me.ratingAfter,
          delta: me.ratingDelta,
        }
      : undefined;

  return (
    <GameResultScreen
      open={open}
      result={result}
      subtitle={
        aborted ? 'No rating change' : endData ? endData.reason.replace(/_/g, ' ') : undefined
      }
      rating={rating}
      actions={
        <>
          <Button label="Play Again" onPress={s.playAgain} glow />
          <Button label="Back to Setup" variant="secondary" onPress={onExit} />
        </>
      }
    />
  );
}
