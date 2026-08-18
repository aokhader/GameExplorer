import { Text, View } from 'react-native';
import {
  LiquidateEngine,
  formatCredits,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { HoldingsView } from './HoldingsView';
import { ViewActionBar, GhostButton } from './ViewChrome';

export interface DebtViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
}

/**
 * Settling up.
 *
 * Not in the design mock, but mandatory: `settling-debt` blocks every other
 * player until the debtor raises the money or folds, so without a screen for it
 * the game deadlocks with no reachable control.
 *
 * Reuses `HoldingsView` in `raiseOnly` mode rather than growing a second list —
 * the rows are identical and the engine has already removed the actions that do
 * not raise money (there is no `unmortgage` and no `end-turn` in this phase).
 */
export function DebtView({ state, youId, deviceIds, dispatch, onBack }: DebtViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const debt = state.pendingDebt;
  const debtor = state.players.find((p) => p.id === debt?.debtorId) ?? null;
  const creditor = state.players.find((p) => p.id === debt?.creditorId) ?? null;
  const owed = debt?.amount ?? 0;
  const raisable = debtor ? LiquidateEngine.liquidatableValue(state, debtor.id) : 0;
  const hopeless = raisable < owed;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>
        <View
          accessible
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(239,95,107,0.4)',
            backgroundColor: 'rgba(239,95,107,0.12)',
            padding: 14,
          }}
        >
          <Text
            style={{ fontFamily: FONTS.bodyBold, fontSize: 9, letterSpacing: 0.9, color: LIQUIDATE_PANEL_COLORS.danger }}
          >
            PAYMENT DUE
          </Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: 24, color: P.ink, marginTop: 4 }}>
            You owe {formatCredits(owed)}
          </Text>
          <Text
            style={{ fontFamily: FONTS.bodySemi, fontSize: 12, color: P.dim, marginTop: 4 }}
          >
            {creditor ? `to ${creditor.name}` : 'to the bank'} · you can raise{' '}
            {formatCredits(raisable)} from what you hold
          </Text>
        </View>
      </View>

      <HoldingsView
        state={state}
        youId={youId}
        deviceIds={deviceIds}
        dispatch={dispatch}
        onBack={onBack}
        raiseOnly
      />

      <ViewActionBar>
        <GhostButton
          label="Fold — hand everything over"
          accessibilityLabel="Fold and hand your holdings over"
          danger
          onPress={() => dispatch({ type: 'declare-bankruptcy' })}
        />
        {hopeless && (
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 11,
              color: P.dim,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Everything you own still falls short of the bill.
          </Text>
        )}
      </ViewActionBar>
    </View>
  );
}
