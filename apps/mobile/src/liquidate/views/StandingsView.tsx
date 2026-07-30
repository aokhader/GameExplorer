import { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { seatColor } from '../lqTheme';
import { ViewHeader, ViewSection } from './ViewChrome';

/** Log lines rendered. The engine's log outgrows any screen; the tail is enough. */
const LOG_LIMIT = 60;

export interface StandingsViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
  roundLabel: string;
}

/** Everyone's net worth, and the match's history. */
export function StandingsView({ state, youId, roundLabel, onBack }: StandingsViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const ranked = state.players
    .map((p) => {
      const seat = state.players.findIndex((q) => q.id === p.id);
      const holdings = LiquidateEngine.board(state).filter(
        (t) => isOwnable(t) && state.tiles[t.id]!.ownerId === p.id,
      );
      const colonies = holdings.reduce((sum, t) => sum + state.tiles[t.id]!.level, 0);
      return {
        player: p,
        seat,
        worth: LiquidateEngine.getNetWorth(state, p.id),
        tiles: holdings.length,
        colonies,
      };
    })
    .sort((a, b) => b.worth - a.worth);

  // The newest entry is the one worth reading, and it is at the bottom.
  const logRef = useRef<ScrollView>(null);
  useEffect(() => {
    const t = setTimeout(() => logRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(t);
  }, [state.log.length]);

  const log = state.log.slice(-LOG_LIMIT);

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader
        title="Standings & log"
        sub={`${roundLabel} · everyone's net worth`}
        onBack={onBack}
      />

      <View style={{ paddingHorizontal: 18, paddingBottom: 6, gap: 8 }}>
        {ranked.map((row, i) => {
          const isYou = row.player.id === youId;
          return (
            <View
              key={row.player.id}
              accessible
              accessibilityLabel={`${i + 1}. ${row.player.name}, net worth ${formatCredits(row.worth)}, ${row.tiles} ${row.tiles === 1 ? 'tile' : 'tiles'}, ${row.colonies} ${row.colonies === 1 ? 'colony' : 'colonies'}${row.player.bankrupt ? ', folded' : ''}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                paddingHorizontal: 13,
                paddingVertical: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isYou ? P.you : P.line,
                backgroundColor: P.panel,
                opacity: row.player.bankrupt ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  width: 22,
                  textAlign: 'center',
                  fontFamily: FONTS.display,
                  fontSize: 15,
                  color: P.dim,
                }}
              >
                {i + 1}
              </Text>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: seatColor(row.seat),
                }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: P.ink }}
                >
                  {row.player.name}
                  {isYou ? ' · you' : ''}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: FONTS.bodySemi, fontSize: 10.5, color: P.soft, marginTop: 1 }}
                >
                  {row.player.bankrupt
                    ? 'folded'
                    : `${row.tiles} ${row.tiles === 1 ? 'tile' : 'tiles'} · ${row.colonies} ${row.colonies === 1 ? 'colony' : 'colonies'}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: FONTS.display, fontSize: 15, color: P.ink }}>
                  {formatCredits(row.worth)}
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.bodySemi,
                    fontSize: 9,
                    letterSpacing: 0.5,
                    color: P.dim,
                  }}
                >
                  NET WORTH
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <ScrollView ref={logRef} contentContainerStyle={{ padding: 18, paddingTop: 10 }}>
        <ViewSection>Game log</ViewSection>
        <View>
          {log.map((entry, i) => {
            const seat = state.players.findIndex((p) => p.id === entry.playerId);
            return (
              <View key={`${i}-${entry.message}`} style={{ flexDirection: 'row', gap: 11, paddingBottom: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 4.5,
                      marginTop: 3,
                      backgroundColor: seat >= 0 ? seatColor(seat) : P.soft,
                    }}
                  />
                  {i < log.length - 1 && (
                    <View style={{ flex: 1, width: 2, marginTop: 3, backgroundColor: P.line }} />
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 2 }}>
                  <Text
                    style={{ fontFamily: FONTS.bodySemi, fontSize: 12.5, lineHeight: 18, color: P.ink }}
                  >
                    {entry.message}
                  </Text>
                  {/* The engine's log has no clock — only the round it happened in. */}
                  <Text
                    style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: P.soft, marginTop: 2 }}
                  >
                    Round {entry.round}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
