import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  LiquidateEngine,
  bidHistory,
  formatCredits,
  groupLabel,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { seatColor, tileAccent } from '../lqTheme';
import { ViewHeader, ViewSection, ViewActionBar, AccentButton, GhostButton } from './ViewChrome';

const STEPS = [10, 50];

export interface AuctionViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
}

/**
 * Live bidding on a declined tile.
 *
 * Opens for spectators as well as bidders: an auction runs many rounds and
 * watching one resolve is the point. The header pill therefore shows *whose bid
 * it is* rather than a countdown — the engine's auctions are strictly
 * turn-based, and a timer that auto-passed would be a rule change, forcing a
 * pass on a human who is still deciding.
 */
export function AuctionView({ state, deviceIds, dispatch, onBack }: AuctionViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const auction = state.pendingAuction;
  const actorId = LiquidateEngine.actingPlayerId(state);
  const bidder = state.players.find((p) => p.id === actorId) ?? null;
  const yourBid = actorId !== null && deviceIds.includes(actorId);

  const minBid = (auction?.highestBid ?? 0) + 1;
  /**
   * How far above the minimum the player has stepped, rather than the bid
   * itself. Storing the raise means the standing bid can climb underneath it
   * without the stepper ever holding an amount the engine would reject — and
   * there is nothing to re-baseline when someone else bids.
   */
  const [raise, setRaise] = useState(0);

  if (!auction) {
    return (
      <View style={{ flex: 1 }}>
        <ViewHeader title="Auction" sub="Settled" onBack={onBack} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: P.dim }}>
            This auction is over.
          </Text>
        </View>
      </View>
    );
  }

  const tile = LiquidateEngine.board(state)[auction.tileId]!;
  const leader = state.players.find((p) => p.id === auction.highestBidderId) ?? null;
  const history = bidHistory(state);
  const ceiling = bidder?.credits ?? 0;
  const canBid = yourBid && ceiling > auction.highestBid;
  const clamped = Math.min(minBid + raise, Math.max(ceiling, minBid));

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader
        title="Auction"
        sub={`${tile.name} declined — open to all`}
        onBack={onBack}
        right={
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={yourBid ? 'Your bid' : `${bidder?.name ?? 'Nobody'} to bid`}
            style={{
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: P.hintLine,
              backgroundColor: P.hint,
            }}
          >
            <Text style={{ fontFamily: FONTS.display, fontSize: 13, color: P.hintInk }}>
              {yourBid ? 'Your bid' : (bidder?.name ?? '—')}
            </Text>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, gap: 14, paddingBottom: 18 }}>
        <View
          style={{
            backgroundColor: P.panel,
            borderWidth: 1,
            borderColor: P.line,
            borderRadius: 16,
            padding: 16,
            alignItems: 'center',
          }}
        >
          <Text
            style={{ fontFamily: FONTS.bodyBold, fontSize: 9, letterSpacing: 0.9, color: P.accent }}
          >
            ON THE BLOCK
          </Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: P.ink, marginTop: 5 }}>
            {tile.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
            <View
              style={{ width: 10, height: 10, borderRadius: 4, backgroundColor: tileAccent(tile) }}
            />
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: P.soft }}>
              {groupLabel(tile)}
              {isOwnable(tile) ? ` · list ${formatCredits(tile.price)}` : ''}
            </Text>
          </View>

          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 9,
              letterSpacing: 0.6,
              color: P.dim,
              marginTop: 14,
            }}
          >
            HIGH BID
          </Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: 38, color: P.accent }}>
            {formatCredits(auction.highestBid)}
          </Text>
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 11, color: P.soft, marginTop: 4 }}>
            {leader ? `by ${leader.name}` : 'no bids yet'}
          </Text>
        </View>

        {history.length > 0 && (
          <View>
            <ViewSection>Bid history</ViewSection>
            <View style={{ gap: 7 }}>
              {history.map((row, i) => {
                const seat = state.players.findIndex((p) => p.id === row.playerId);
                return (
                  <View
                    key={`${i}-${row.playerId}-${row.amount ?? 'pass'}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 9,
                      paddingHorizontal: 11,
                      paddingVertical: 9,
                      borderRadius: 11,
                      borderWidth: 1,
                      borderColor: P.line,
                      backgroundColor: P.panel2,
                      opacity: row.passed ? 0.55 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 4.5,
                        backgroundColor: seat >= 0 ? seatColor(seat) : P.soft,
                      }}
                    />
                    <Text style={{ flex: 1, fontFamily: FONTS.bodyBold, fontSize: 12, color: P.ink }}>
                      {row.name}
                    </Text>
                    <Text style={{ fontFamily: FONTS.display, fontSize: 13, color: P.ink }}>
                      {row.passed ? 'passed' : formatCredits(row.amount!)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <ViewActionBar>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          {STEPS.map((step) => (
            <GhostButton
              key={step}
              label={`+${step}`}
              accessibilityLabel={`Raise the bid by ${step}`}
              disabled={!canBid || minBid + raise + step > ceiling}
              onPress={() => setRaise((r) => r + step)}
              style={{ width: 64 }}
            />
          ))}
          <AccentButton
            label={`Bid ${formatCredits(clamped)}`}
            accessibilityLabel={`Bid ${formatCredits(clamped)}`}
            disabled={!canBid}
            onPress={() => dispatch({ type: 'bid', amount: clamped })}
            style={{ flex: 1 }}
          />
        </View>
        <GhostButton
          label="Pass"
          disabled={!yourBid}
          onPress={() => dispatch({ type: 'pass-bid' })}
          style={{ marginTop: 9 }}
        />
      </ViewActionBar>
    </View>
  );
}
