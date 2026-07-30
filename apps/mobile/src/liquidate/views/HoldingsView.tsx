import { ScrollView, Text, View } from 'react-native';
import {
  LiquidateEngine,
  MAX_COLONY_LEVEL,
  formatCredits,
  groupLabel,
  isOwnable,
  mortgageValueFor,
  unmortgageCostFor,
  type LiquidateAction,
  type LiquidateGameState,
  type OwnableTile,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { tileAccent } from '../lqTheme';
import { ViewHeader, ViewSection, GhostButton } from './ViewChrome';

export interface HoldingsViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
  /**
   * Debt mode drops building and clearing — while settling up, the engine only
   * offers ways to RAISE money, and offering the others would be a dead tap.
   */
  raiseOnly?: boolean;
}

/**
 * Build, sell, mortgage and clear.
 *
 * Every button is gated on `getLegalActions` rather than on a local reading of
 * the rules, so the even-build requirement, the "sell the colonies first" rule
 * and affordability all come from the engine and cannot drift.
 */
export function HoldingsView({
  state,
  youId,
  deviceIds,
  dispatch,
  onBack,
  raiseOnly = false,
}: HoldingsViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const actorId = LiquidateEngine.actingPlayerId(state);
  const ownerId = actorId !== null && deviceIds.includes(actorId) ? actorId : youId;
  const legal = LiquidateEngine.getLegalActions(state);

  const can = (type: LiquidateAction['type'], tileId: number) =>
    legal.some((a) => a.type === type && 'tile' in a && a.tile === tileId);

  const holdings = LiquidateEngine.board(state).filter(
    (t): t is OwnableTile => isOwnable(t) && state.tiles[t.id]!.ownerId === ownerId,
  );

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader
        title={raiseOnly ? 'Raise funds' : 'Manage holdings'}
        sub={`${holdings.length} ${holdings.length === 1 ? 'holding' : 'holdings'}`}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}>
        {holdings.length === 0 ? (
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 13,
              color: P.dim,
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            You hold nothing yet.
          </Text>
        ) : (
          <>
            <ViewSection>Your holdings</ViewSection>
            <View style={{ gap: 10 }}>
              {holdings.map((tile) => {
                const owned = state.tiles[tile.id]!;
                const canBuild = !raiseOnly && can('build', tile.id);
                const canSell = can('sell-building', tile.id);
                const canMortgage = can('mortgage', tile.id);
                const canClear = !raiseOnly && can('unmortgage', tile.id);

                return (
                  <View
                    key={tile.id}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: P.line,
                      backgroundColor: P.panel,
                      padding: 13,
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                      <View
                        style={{
                          width: 6,
                          height: 30,
                          borderRadius: 3,
                          backgroundColor: tileAccent(tile),
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: P.ink }}
                        >
                          {tile.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: P.soft, marginTop: 1 }}
                        >
                          {groupLabel(tile)}
                          {owned.mortgaged ? ' · mortgaged' : ''}
                          {tile.kind === 'planet' && owned.level > 0
                            ? owned.level === MAX_COLONY_LEVEL
                              ? ' · megastructure'
                              : ` · ${owned.level} ${owned.level === 1 ? 'colony' : 'colonies'}`
                            : ''}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: FONTS.display, fontSize: 13, color: P.ink }}>
                        {formatCredits(tile.price)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {tile.kind === 'planet' && (
                        <GhostButton
                          label={
                            owned.level === MAX_COLONY_LEVEL - 1
                              ? `Megastructure ${formatCredits(tile.colonyCost)}`
                              : `Build ${formatCredits(tile.colonyCost)}`
                          }
                          accessibilityLabel={`Build a colony on ${tile.name} for ${formatCredits(tile.colonyCost)}`}
                          disabled={!canBuild}
                          onPress={() => dispatch({ type: 'build', tile: tile.id })}
                          style={{ flexGrow: 1, flexBasis: '47%' }}
                        />
                      )}
                      {tile.kind === 'planet' && (
                        <GhostButton
                          label="Sell colony"
                          accessibilityLabel={`Sell a colony on ${tile.name}`}
                          disabled={!canSell}
                          onPress={() => dispatch({ type: 'sell-building', tile: tile.id })}
                          style={{ flexGrow: 1, flexBasis: '47%' }}
                        />
                      )}
                      {!owned.mortgaged && (
                        <GhostButton
                          label={`Mortgage ${formatCredits(mortgageValueFor(tile.price))}`}
                          accessibilityLabel={`Mortgage ${tile.name} for ${formatCredits(mortgageValueFor(tile.price))}`}
                          disabled={!canMortgage}
                          onPress={() => dispatch({ type: 'mortgage', tile: tile.id })}
                          style={{ flexGrow: 1, flexBasis: '47%' }}
                        />
                      )}
                      {owned.mortgaged && (
                        <GhostButton
                          label={`Clear ${formatCredits(unmortgageCostFor(tile.price))}`}
                          accessibilityLabel={`Clear the mortgage on ${tile.name} for ${formatCredits(unmortgageCostFor(tile.price))}`}
                          disabled={!canClear}
                          onPress={() => dispatch({ type: 'unmortgage', tile: tile.id })}
                          style={{ flexGrow: 1, flexBasis: '47%' }}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
