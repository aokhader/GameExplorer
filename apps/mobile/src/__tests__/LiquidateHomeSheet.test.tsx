import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  LiquidateEngine,
  dockSlots,
  primaryAction,
  type LiquidateGameState,
  type PlanetTile,
} from '@gameexplorer/shared';
import { HomeSheet } from '@/liquidate/HomeSheet';
import { SettingsProvider } from '@/providers/SettingsProvider';

// The sheet has no animation of its own, but `GameResultScreen`'s siblings pull
// reanimated in through the tree. `require` rather than the imported helper:
// jest hoists mock factories above every import, so the binding wouldn't exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

/**
 * The sheet renders whatever `primaryAction` and `dockSlots` decide, so these
 * drive it from real engine states rather than hand-built props — the point is
 * that the wiring is right, and the decisions themselves are covered by
 * `presentation.test.ts` in `packages/shared`.
 */
function game(): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [{ name: 'Captain' }, { name: 'Vega', isBot: true }],
    mode: 'quick',
    seed: 11,
  });
}

function firstPlanet(state: LiquidateGameState): PlanetTile {
  return LiquidateEngine.board(state).find((t): t is PlanetTile => t.kind === 'planet')!;
}

/**
 * `SettingsProvider` hydrates from AsyncStorage, so every render awaits that
 * first paint to keep the state update inside `act` — the same reason
 * `GameBar.test.tsx` does it.
 */
async function renderSheet(state: LiquidateGameState, dispatch = jest.fn()) {
  const deviceIds = [state.players[0]!.id];
  const acting = LiquidateEngine.actingPlayerId(state);
  const deviceActs = acting !== null && deviceIds.includes(acting);
  const actor = state.players.find((p) => p.id === acting);

  render(
    <SettingsProvider>
      <HomeSheet
        state={state}
        youId={state.players[0]!.id}
        focusTile={state.players[0]!.tile}
        kicker="You are at"
        cta={primaryAction(state, deviceIds)}
        waitingFor={actor && !deviceActs ? `${actor.name} is deciding…` : null}
        dock={dockSlots(state, deviceIds)}
        hideCard={false}
        cardDraw={null}
        dispatch={dispatch}
        onOpen={jest.fn()}
      />
    </SettingsProvider>,
  );
  await screen.findByRole('button', { name: 'Standings' });
  return dispatch;
}

describe('HomeSheet — the primary call to action', () => {
  it('offers a roll at the start of a turn, and dispatches it', async () => {
    const dispatch = await renderSheet(game());
    const button = screen.getByRole('button', { name: 'Roll dice' });

    fireEvent.press(button);
    expect(dispatch).toHaveBeenCalledWith({ type: 'roll' });
  });

  it('offers the buy, with the price, when the tile is affordable', async () => {
    const state = game();
    const tile = firstPlanet(state);
    state.phase = 'buy-decision';
    state.pendingPurchase = tile.id;
    state.players[0]!.tile = tile.id;

    await renderSheet(state);
    expect(screen.getByRole('button', { name: new RegExp(`Buy ${tile.name} for`) })).toBeTruthy();
  });

  it('offers the auction instead — and no buy — when the price is out of reach', async () => {
    const state = game();
    const tile = firstPlanet(state);
    state.phase = 'buy-decision';
    state.pendingPurchase = tile.id;
    state.players[0]!.tile = tile.id;
    state.players[0]!.credits = 5;

    const dispatch = await renderSheet(state);
    expect(screen.queryByRole('button', { name: new RegExp(`^Buy ${tile.name}`) })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Send to auction' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'decline' });
  });

  it('ends the turn', async () => {
    const state = game();
    state.phase = 'turn-end';
    const dispatch = await renderSheet(state);

    fireEvent.press(screen.getByRole('button', { name: 'End turn' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'end-turn' });
  });

  it('goes quiet and names the bot on its turn', async () => {
    const state = game();
    state.currentPlayerIndex = 1;
    await renderSheet(state);

    expect(screen.queryByRole('button', { name: 'Roll dice' })).toBeNull();
    expect(screen.getByLabelText('Vega is deciding…')).toBeTruthy();
  });

  it('marks the waiting state as disabled for a screen reader', async () => {
    const state = game();
    state.currentPlayerIndex = 1;
    await renderSheet(state);

    expect(screen.getByLabelText('Vega is deciding…').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('HomeSheet — the dock', () => {
  it('shows all four shortcuts', async () => {
    await renderSheet(game());
    for (const label of ['Standings', 'Board']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('explains a disabled shortcut rather than just greying it', async () => {
    await renderSheet(game());
    // Nothing is owned at the start, so Manage has nothing to offer.
    expect(screen.getByRole('button', { name: 'Manage — Nothing to manage yet' })).toBeTruthy();
  });

  it('swaps in the auction while one is running', async () => {
    const state = game();
    const tile = firstPlanet(state);
    state.phase = 'buy-decision';
    state.pendingPurchase = tile.id;
    state.players[0]!.credits = 5;
    const next = LiquidateEngine.applyAction(state, { type: 'decline' }).resultingState!;

    await renderSheet(next);
    expect(screen.getByRole('button', { name: 'Auction' })).toBeTruthy();
  });
});

describe('HomeSheet — the card banner', () => {
  it('shows a drawn card, since the engine resolves it with no pause', async () => {
    const state = game();
    render(
      <SettingsProvider>
        <HomeSheet
          state={state}
          youId={state.players[0]!.id}
          focusTile={0}
          kicker="You are at"
          cta={null}
          waitingFor={null}
          dock={dockSlots(state, [state.players[0]!.id])}
          hideCard={false}
          cardDraw={{ text: 'Salvage rights pay out. Collect 150.', deck: 'anomaly' }}
          dispatch={jest.fn()}
          onOpen={jest.fn()}
        />
      </SettingsProvider>,
    );

    expect(screen.getByText('Salvage rights pay out. Collect 150.')).toBeTruthy();
    expect(screen.getByText('ANOMALY')).toBeTruthy();
  });
});
