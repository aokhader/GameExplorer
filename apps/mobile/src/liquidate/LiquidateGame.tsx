import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  LIQUIDATE_CONFIGS,
  LiquidateEngine,
  dockSlots,
  focusView,
  formatCredits,
  primaryAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import {
  LIQUIDATE_BOARD_COLORS,
  LIQUIDATE_PANEL_COLORS,
  useThemeName,
} from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { GameResultScreen } from '@/game/GameResultScreen';
import { Button } from '@/components/ui';
import { FONTS } from '@/theme/typography';
import { LiquidateBoard, BoardWellCaption } from './LiquidateBoard';
import { Dice } from './Dice';
import { HomeSheet } from './HomeSheet';
import { seatColor } from './lqTheme';
import { sfxForLogLine } from './liquidateSfx';
import type { useLiquidateGame } from './useLiquidateGame';
import type { LqView } from './views/types';
import { FullBoardView } from './views/FullBoardView';
import { StandingsView } from './views/StandingsView';
import { MenuView } from './views/MenuView';
import { AuctionView } from './views/AuctionView';
import { TradeBuilderView } from './views/TradeBuilderView';
import { TradeReviewView } from './views/TradeReviewView';
import { DebtView } from './views/DebtView';
import { HoldingsView } from './views/HoldingsView';

/** How long a drawn card stays on the sheet before the property card returns. */
const CARD_BANNER_MS = 2600;

export interface LiquidateGameProps {
  game: ReturnType<typeof useLiquidateGame>;
  mode: 'bot' | 'local';
  onQuit: () => void;
}

/**
 * The in-game shell: the board screen plus the eight views it opens.
 *
 * Views are in-component state rather than Expo Router sub-routes. Two reasons,
 * both load-bearing. The bot loop's pending `setTimeout` must survive a view
 * switch — here a switch is a re-render, so the effect's deps are unchanged and
 * its cleanup never fires, whereas a route push would need the hook hoisted into
 * a layout and a context this app has nowhere. And the view the game *demands*
 * is derived from state on every render, so a settled auction simply stops being
 * demanded; a pushed route would leave a dead screen on the stack.
 */
export function LiquidateGame({ game, mode, onQuit }: LiquidateGameProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { reducedMotion } = useSettings();
  const { height: windowH } = useWindowDimensions();
  const router = useRouter();
  const sfx = useGameSfx();

  const [userView, setUserView] = useState<LqView>('board');
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [boardBox, setBoardBox] = useState({ w: 0, h: 0 });

  const state = game.state!;
  const P = LIQUIDATE_PANEL_COLORS;

  /**
   * Seats this device may act for. In pass-and-play every human seat is ours;
   * against bots only the first. Bot seats are never included — the loop plays
   * them, and letting a tap stand in for one would let a player act out of turn.
   */
  const deviceIds = useMemo(
    () =>
      mode === 'local'
        ? state.players.filter((p) => !p.isBot).map((p) => p.id)
        : state.players.slice(0, 1).map((p) => p.id),
    [mode, state.players],
  );

  /**
   * The seat the board follows. Against bots that is always the human; in
   * pass-and-play it is whoever's turn it is, so the "you" halo and the rent
   * ladders track the player actually holding the device.
   */
  const youId = useMemo(() => {
    if (mode === 'bot') return state.players[0]?.id ?? null;
    const acting = LiquidateEngine.actingPlayerId(state);
    return acting && deviceIds.includes(acting) ? acting : (deviceIds[0] ?? null);
  }, [mode, state, deviceIds]);

  const you = state.players.find((p) => p.id === youId) ?? null;
  const youSeat = youId ? state.players.findIndex((p) => p.id === youId) : null;
  const actingId = LiquidateEngine.actingPlayerId(state);
  const acting = state.players.find((p) => p.id === actingId) ?? null;
  const deviceActs = actingId !== null && deviceIds.includes(actingId);

  // Sound + haptics, driven off the newest log line: bot actions never pass
  // through this component, and the log is the one place every event shows up
  // exactly once.
  const lastLoggedRef = useRef(0);
  useEffect(() => {
    const line = state.log[state.log.length - 1];
    if (!line || state.log.length === lastLoggedRef.current) return;
    lastLoggedRef.current = state.log.length;
    const event = sfxForLogLine(line.message);
    if (event) sfx.play(event);
  }, [state.log, sfx]);

  /**
   * The newest drawn card, shown briefly on the sheet.
   *
   * The engine resolves a card inside the same action that drew it — there is
   * no card phase — so the log line is the only trace, and without this the
   * effect (money moving, a ship teleporting) has nothing explaining it.
   *
   * Derived from the log rather than stored: the only piece of state is *which
   * log entry has been shown long enough to dismiss*, so a new draw needs
   * nothing set and cannot race the timer of the one before it.
   */
  const cardIndex = state.log.length - 1;
  const [dismissedCard, setDismissedCard] = useState(-1);
  const cardDraw = useMemo(() => {
    if (cardIndex === dismissedCard) return null;
    const line = state.log[cardIndex];
    const match = line ? / draws: (.+)$/.exec(line.message) : null;
    if (!line || !match) return null;
    // Which deck it came from is not in the message, so read it off the tile the
    // drawer is standing on — they are still there when the card resolves.
    const drawer = state.players.find((p) => p.id === line.playerId);
    const tile = drawer ? LiquidateEngine.board(state)[drawer.tile] : undefined;
    return {
      text: match[1]!,
      deck: (tile?.kind === 'federation' ? 'federation' : 'anomaly') as 'anomaly' | 'federation',
    };
  }, [state, cardIndex, dismissedCard]);

  useEffect(() => {
    if (!cardDraw) return;
    const timer = setTimeout(() => setDismissedCard(cardIndex), CARD_BANNER_MS);
    return () => clearTimeout(timer);
  }, [cardDraw, cardIndex]);

  /**
   * The view the game insists on, overriding whatever the player last opened.
   * Derived every render rather than pushed on a phase change, so it cannot
   * desync from the engine.
   */
  const demanded = focusView(state, deviceIds);

  /**
   * When a demanded view releases, land on the board rather than restoring
   * whatever happened to be open when it took over — a settled auction should
   * not drop the player back into, say, the trade builder they had open.
   *
   * Adjusted during render rather than in an effect: React re-runs this
   * component before committing, so the board is never painted behind a view
   * that has already released.
   */
  const [wasDemanding, setWasDemanding] = useState<LqView | null>(demanded);
  if (wasDemanding !== demanded) {
    setWasDemanding(demanded);
    if (wasDemanding && !demanded && userView !== 'board') setUserView('board');
  }

  const view: LqView = demanded ?? userView;

  // Hardware back walks out of a sub-view before it leaves the match.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (demanded) return true; // the game is blocking; there is nowhere to go
      if (userView !== 'board') {
        setUserView('board');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [userView, demanded]);

  const cta = primaryAction(state, deviceIds);
  const dock = dockSlots(state, deviceIds);

  const board = LiquidateEngine.board(state);
  const focusPlayer = acting ?? you;
  const browsing = selectedTile !== null;
  const focusTile = selectedTile ?? focusPlayer?.tile ?? 0;

  const kicker = browsing
    ? 'Inspecting'
    : state.phase === 'buy-decision'
      ? deviceActs
        ? 'You landed on'
        : `${acting?.name ?? 'They'} landed on`
      : acting && !deviceActs
        ? `${acting.name} is at`
        : you?.inImpound
          ? 'Impounded'
          : 'You are at';

  const maxRounds = LIQUIDATE_CONFIGS[state.config.mode].maxRounds;
  const roundLabel = maxRounds
    ? `Round ${Math.min(state.round, maxRounds)}/${maxRounds}`
    : `Round ${state.round}`;

  const goBoard = () => {
    setSelectedTile(null);
    setUserView('board');
  };

  const openView = (next: LqView) => {
    setSelectedTile(null);
    setUserView(next);
  };

  // ── Sub-views ────────────────────────────────────────────────────────────
  if (view !== 'board') {
    const shared = { state, youId, deviceIds, dispatch: game.dispatch, onBack: goBoard };
    return (
      <Shell>
        {view === 'full' && (
          <FullBoardView
            {...shared}
            placed={game.placed}
            youSeat={youSeat}
            activeTile={focusPlayer?.tile ?? null}
            roundLabel={roundLabel}
          />
        )}
        {view === 'standings' && <StandingsView {...shared} roundLabel={roundLabel} />}
        {view === 'auction' && <AuctionView {...shared} />}
        {view === 'trade' && <TradeBuilderView {...shared} />}
        {view === 'trade-review' && <TradeReviewView {...shared} />}
        {view === 'debt' && <DebtView {...shared} />}
        {view === 'holdings' && <HoldingsView {...shared} />}
        {view === 'menu' && (
          <MenuView
            {...shared}
            roundLabel={roundLabel}
            dock={dock}
            onOpen={openView}
            onSettings={() => router.push('/settings' as never)}
            onResign={onQuit}
          />
        )}
      </Shell>
    );
  }

  // ── Board screen ─────────────────────────────────────────────────────────
  /**
   * The board's edge, in px: the whole of the space between the header and the
   * sheet, squared off.
   *
   * That space is the column's leftover, so this is only safe because the sheet
   * holds one height through an entire turn — `HomeSheet` floors its card block
   * for exactly this reason. The one thing that does move it is the player
   * opening the rent ladder, and then the ring shrinking is the point: they
   * asked to trade board for detail, and can hand it back with a second tap.
   */
  const boardSize = Math.floor(Math.min(boardBox.w || windowH, boardBox.h || windowH));

  return (
    <Shell>
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(220)}
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={
                deviceActs ? `Your turn. ${roundLabel}` : `${acting?.name} is playing. ${roundLabel}`
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: seatColor(
                    state.players.findIndex((p) => p.id === (actingId ?? youId)),
                  ),
                }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONTS.display, fontSize: 15, color: P.ink }}>
                  {deviceActs ? 'Your turn' : `${acting?.name ?? '—'} is playing`}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: FONTS.bodySemi, fontSize: 10.5, color: P.soft, marginTop: 2 }}
                >
                  {you?.name ?? '—'} · {roundLabel}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 12,
                  borderWidth: 1,
                  // Debt is allowed to go below zero under one rule set, and a
                  // negative balance has to be impossible to miss.
                  borderColor: (you?.credits ?? 0) < 0 ? 'rgba(239,95,107,0.5)' : P.line,
                  backgroundColor: (you?.credits ?? 0) < 0 ? 'rgba(239,95,107,0.12)' : P.panel,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.bodySemi,
                    fontSize: 9,
                    letterSpacing: 0.6,
                    color: P.soft,
                  }}
                >
                  CASH
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 16,
                    color: (you?.credits ?? 0) < 0 ? '#ef5f6b' : P.ink,
                  }}
                >
                  {formatCredits(you?.credits ?? 0)}
                </Text>
              </View>

              <Pressable
                onPress={() => openView('menu')}
                accessibilityRole="button"
                accessibilityLabel="Match menu"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: P.line,
                  backgroundColor: P.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 17, lineHeight: 20, color: P.ink }}>⋯</Text>
              </Pressable>
            </View>
          </View>

          {/* Rivals. Scrolls horizontally — five chips at ~110pt overflow a
              358pt column, and a wrap would push the board out of the screen. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, marginTop: 12 }}
          >
            {state.players
              .filter((p) => p.id !== youId)
              .map((p) => {
                const seat = state.players.findIndex((q) => q.id === p.id);
                return (
                  <View
                    key={p.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      borderRadius: 11,
                      borderWidth: 1,
                      borderColor: p.id === actingId ? P.accent : P.line,
                      backgroundColor: P.panel2,
                      opacity: p.bankrupt ? 0.45 : 1,
                      minWidth: 96,
                    }}
                  >
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 4.5,
                        backgroundColor: seatColor(seat),
                      }}
                    />
                    <View style={{ minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: FONTS.bodyBold, fontSize: 10, color: P.ink }}
                      >
                        {p.name}
                      </Text>
                      <Text style={{ fontFamily: FONTS.display, fontSize: 9, color: P.dim }}>
                        {p.bankrupt ? 'folded' : formatCredits(p.credits)}
                      </Text>
                    </View>
                  </View>
                );
              })}
          </ScrollView>
        </View>

        {/* Board */}
        <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 18, gap: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 2,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.bodyBold,
                fontSize: 10,
                letterSpacing: 1,
                color: P.dim,
              }}
            >
              {`BOARD · TILE ${focusTile + 1} OF ${board.length}`}
            </Text>
            <Pressable
              onPress={() => openView('full')}
              accessibilityRole="button"
              accessibilityLabel="Open the full board"
              hitSlop={8}
            >
              <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: P.accent }}>
                tap to zoom ⤢
              </Text>
            </Pressable>
          </View>

          {/*
            The board takes whatever is left between the header and the sheet.
            Nothing else caps it: `boardSize` is this box measured, so the ring
            is as large as the screen allows and the legend sits directly under
            it rather than at the foot of a region the board failed to fill.
          */}
          <View
            onLayout={(e) =>
              setBoardBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
            }
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {boardSize > 0 && (
              <LiquidateBoard
                key="board"
                state={state}
                placed={game.placed}
                size={boardSize}
                youSeat={youSeat}
                activeTile={focusPlayer?.tile ?? null}
                variant="overview"
                onPressBoard={() => openView('full')}
                accessibilityLabel={`Board — tile ${focusTile + 1} of ${board.length}. Open the full board`}
              >
                <BoardWellCaption
                  title={board[focusTile]?.name ?? 'Liquidate'}
                  sub={`${state.players.filter((p) => !p.bankrupt).length} in play`}
                >
                  <View style={{ marginTop: 2 }}>
                    <Dice dice={state.dice} size={Math.max(20, boardSize * 0.075)} />
                  </View>
                </BoardWellCaption>
              </LiquidateBoard>
            )}
          </View>

          {/* The design's key to the board, directly under the ring. */}
          <BoardLegend state={state} youId={youId} />
        </View>
      </Animated.View>

      <HomeSheet
        state={state}
        youId={youId}
        focusTile={focusTile}
        kicker={kicker}
        cta={cta}
        waitingFor={acting && !deviceActs ? `${acting.name} is deciding…` : null}
        dock={dock}
        hideCard={game.boardMoving && !browsing}
        cardDraw={cardDraw}
        dispatch={game.dispatch}
        onOpen={openView}
      />

      <GameResultScreen
        open={(state.isGameOver || !!you?.bankrupt) && !resultDismissed}
        result={resultFor(state, youId, mode)}
        title={titleFor(state, youId, mode)}
        subtitle={subtitleFor(state, roundLabel)}
        actions={
          <>
            <Button label="Play Again" onPress={onQuit} glow />
            <Button
              label="Back to Home"
              variant="secondary"
              onPress={() => router.replace('/' as never)}
            />
          </>
        }
        onReview={() => setResultDismissed(true)}
      />
    </Shell>
  );
}

/**
 * The design's key to the board: what a colour bar means, and who each seat is.
 *
 * Wraps rather than scrolls — with six seats it runs to two rows, which is the
 * space it is there to fill.
 */
function BoardLegend({ state, youId }: { state: LiquidateGameState; youId: string | null }) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const chips = [
    { key: 'gate', label: 'Gate', color: P.gate },
    { key: 'utility', label: 'Utility', color: P.utility },
    ...state.players
      .filter((p) => !p.bankrupt)
      .map((p, i) => ({
        key: p.id,
        label: p.id === youId ? 'You' : p.name,
        color: seatColor(state.players.findIndex((q) => q.id === p.id) ?? i),
      })),
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: 12,
        rowGap: 5,
        paddingHorizontal: 2,
      }}
    >
      {chips.map((c) => (
        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: c.color }}
          />
          <Text
            style={{ fontFamily: FONTS.bodySemi, fontSize: 10, lineHeight: 13, color: P.soft }}
          >
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The board's own page surface.
 *
 * Not `GameScreenLayout`: that shell paints `COLORS.surface` and puts its body
 * in one ScrollView, while this screen is three fixed regions on the board's own
 * frame colour — which is the whole reason `LIQUIDATE_BOARD_COLORS` exists as a
 * family separate from the page tokens.
 */
function Shell({ children }: { children: React.ReactNode }) {
  useThemeName();
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: LIQUIDATE_BOARD_COLORS.frame }}
    >
      {children}
    </SafeAreaView>
  );
}

/**
 * Pass-and-play has no "you", so a first-person result would be a lie for
 * everyone at the table but one. It always reads as a win — the game WAS won —
 * with the winner named in the title. `'draw'` is never right: the engine sorts
 * on net worth and takes the top seat, so it cannot produce a tie.
 */
function resultFor(
  state: LiquidateGameState,
  youId: string | null,
  mode: 'bot' | 'local',
): 'win' | 'loss' {
  if (mode === 'local') return 'win';
  if (!state.isGameOver) return 'loss'; // the human folded while bots play on
  return state.winnerId === youId ? 'win' : 'loss';
}

function titleFor(
  state: LiquidateGameState,
  youId: string | null,
  mode: 'bot' | 'local',
): string {
  if (!state.isGameOver) return 'You folded';
  const winner = state.players.find((p) => p.id === state.winnerId);
  if (mode === 'bot' && state.winnerId === youId) return 'You win';
  return winner ? `${winner.name} wins` : 'Match over';
}

function subtitleFor(state: LiquidateGameState, roundLabel: string): string {
  if (!state.isGameOver) return 'Your holdings are gone — the others play on.';
  const winner = state.players.find((p) => p.id === state.winnerId);
  if (!winner) return roundLabel;
  return `Net worth ${formatCredits(LiquidateEngine.getNetWorth(state, winner.id))} · ${roundLabel}`;
}
