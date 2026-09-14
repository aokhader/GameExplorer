import { Text, View } from 'react-native';
import {
  LiquidateEngine,
  formatCredits,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { ViewHeader, ViewActionBar, AccentButton, GhostButton } from './ViewChrome';
import { TradePanel } from './TradePanel';

export interface TradeReviewViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
}

/**
 * An incoming offer.
 *
 * Not in the design mock, which has only the outgoing builder — but bots do
 * propose trades, and `trade-review` blocks the game until the recipient
 * answers, so without this screen the match deadlocks with no reachable control.
 *
 * Reads from the recipient's side: what the offer gives THEM sits first.
 */
export function TradeReviewView({ state, dispatch, onBack }: TradeReviewViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const trade = state.pendingTrade;
  const from = state.players.find((p) => p.id === trade?.fromId) ?? null;
  const to = state.players.find((p) => p.id === trade?.toId) ?? null;
  const board = LiquidateEngine.board(state);

  if (!trade || !from || !to) {
    return (
      <View style={{ flex: 1 }}>
        <ViewHeader title="Trade" sub="Nothing pending" onBack={onBack} />
      </View>
    );
  }

  const incoming = trade.offerTiles.map((id) => board[id]!);
  const outgoing = trade.requestTiles.map((id) => board[id]!);
  // What they hand over, minus what they ask for, from the recipient's side.
  const net =
    incoming.reduce((s, t) => s + ('price' in t ? t.price : 0), 0) +
    trade.offerCredits -
    (outgoing.reduce((s, t) => s + ('price' in t ? t.price : 0), 0) + trade.requestCredits);

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader title="Incoming offer" sub={`from ${from.name}`} onBack={onBack} />

      <View style={{ flex: 1, paddingHorizontal: 18, gap: SPACING[3] }}>
        <TradePanel
          title="You get"
          dotColor={P.you}
          tiles={incoming}
          credits={trade.offerCredits}
          creditsLabel={`from ${from.name}'s reserve`}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[2] }}>
          <View style={{ flex: 1, height: 1, backgroundColor: P.line }} />
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: RADIUS.full,
              borderWidth: 1,
              borderColor: P.line,
              backgroundColor: P.panel,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: FONT_SIZES.sm, color: P.accent }}>⇅</Text>
          </View>
          <View style={{ flex: 1, height: 1, backgroundColor: P.line }} />
        </View>

        <TradePanel
          title="You give up"
          dotColor={P.dim}
          tiles={outgoing}
          credits={trade.requestCredits}
          creditsLabel="from your reserve"
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 13,
            paddingVertical: 11,
            borderRadius: RADIUS.xl,
            borderWidth: 1,
            borderColor: P.hintLine,
            backgroundColor: P.hint,
          }}
        >
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.xs, color: P.hintInk }}>
            Net to you
          </Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: FONT_SIZES.body, color: P.hintInk }}>
            {net >= 0 ? '+' : ''}
            {formatCredits(net)}
          </Text>
        </View>
      </View>

      <ViewActionBar>
        <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
          <GhostButton
            label="Decline"
            onPress={() => dispatch({ type: 'respond-trade', accept: false })}
            style={{ width: 110 }}
          />
          <AccentButton
            label="Accept offer"
            onPress={() => dispatch({ type: 'respond-trade', accept: true })}
            style={{ flex: 1 }}
          />
        </View>
      </ViewActionBar>
    </View>
  );
}
