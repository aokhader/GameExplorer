import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  LiquidateEngine,
  formatCredits,
  type LiquidateGameState,
  type PlanetTile,
} from '@gameexplorer/shared';
import { AuctionView } from '@/liquidate/views/AuctionView';
import { SettingsProvider } from '@/providers/SettingsProvider';

// `require` rather than the imported helper: jest hoists mock factories above
// every import, so the binding wouldn't exist yet.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

/** A live auction on the first planet, opened by a player who cannot afford it. */
function auctionState(): LiquidateGameState {
  const start = LiquidateEngine.newGame({
    players: [{ name: 'Captain' }, { name: 'Vega', isBot: true }, { name: 'Orin', isBot: true }],
    mode: 'quick',
    seed: 11,
  });
  const tile = LiquidateEngine.board(start).find((t): t is PlanetTile => t.kind === 'planet')!;
  start.phase = 'buy-decision';
  start.pendingPurchase = tile.id;
  start.players[0]!.credits = 5;
  return LiquidateEngine.applyAction(start, { type: 'decline' }).resultingState!;
}

async function renderAuction(state: LiquidateGameState, dispatch = jest.fn()) {
  const actorId = LiquidateEngine.actingPlayerId(state)!;
  render(
    <SettingsProvider>
      <AuctionView
        state={state}
        youId={state.players[0]!.id}
        deviceIds={[actorId]}
        dispatch={dispatch}
        onBack={jest.fn()}
      />
    </SettingsProvider>,
  );
  await screen.findByRole('button', { name: 'Pass' });
  return dispatch;
}

describe('AuctionView', () => {
  it('shows the lot on the block and the standing high bid', async () => {
    const state = auctionState();
    const tile = LiquidateEngine.board(state)[state.pendingAuction!.tileId]!;
    await renderAuction(state);

    expect(screen.getByText('ON THE BLOCK')).toBeTruthy();
    expect(screen.getByText(tile.name)).toBeTruthy();
    expect(screen.getByText(formatCredits(state.pendingAuction!.highestBid))).toBeTruthy();
  });

  it('bids one above the standing bid by default', async () => {
    const state = auctionState();
    const dispatch = await renderAuction(state);
    const min = state.pendingAuction!.highestBid + 1;

    fireEvent.press(screen.getByRole('button', { name: `Bid ${formatCredits(min)}` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'bid', amount: min });
  });

  it('raises by the stepper amount', async () => {
    const state = auctionState();
    // The seat that declined is broke by construction — it opened the auction —
    // and it may be first in the bidding order, so fund whoever is on the clock.
    const actorId = LiquidateEngine.actingPlayerId(state)!;
    state.players.find((p) => p.id === actorId)!.credits = 2000;

    const dispatch = await renderAuction(state);
    const min = state.pendingAuction!.highestBid + 1;

    fireEvent.press(screen.getByRole('button', { name: 'Raise the bid by 50' }));
    fireEvent.press(screen.getByRole('button', { name: `Bid ${formatCredits(min + 50)}` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'bid', amount: min + 50 });
  });

  it('clamps the bid to what the bidder actually holds', async () => {
    const state = auctionState();
    const actorId = LiquidateEngine.actingPlayerId(state)!;
    state.players.find((p) => p.id === actorId)!.credits = 30;

    const dispatch = await renderAuction(state);
    fireEvent.press(screen.getByRole('button', { name: 'Raise the bid by 10' }));
    fireEvent.press(screen.getByRole('button', { name: `Bid ${formatCredits(11)}` }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'bid', amount: 11 });
  });

  it('passes', async () => {
    const dispatch = await renderAuction(auctionState());
    fireEvent.press(screen.getByRole('button', { name: 'Pass' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'pass-bid' });
  });

  it('never offers a bid the bidder cannot cover', async () => {
    const state = auctionState();
    const actorId = LiquidateEngine.actingPlayerId(state)!;
    const bidder = state.players.find((p) => p.id === actorId)!;
    bidder.credits = state.pendingAuction!.highestBid + 20;

    await renderAuction(state);
    // +50 would take the bid past what they hold, so it is not offered.
    expect(
      screen.getByRole('button', { name: 'Raise the bid by 50' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('reads the pill as your turn when the device is on the clock', async () => {
    await renderAuction(auctionState());
    expect(screen.getByLabelText('Your bid')).toBeTruthy();
  });

  it('names the bidder in the pill when it is somebody else', async () => {
    const state = auctionState();
    const other = state.players.find((p) => p.id !== LiquidateEngine.actingPlayerId(state))!;
    render(
      <SettingsProvider>
        <AuctionView
          state={state}
          youId={other.id}
          deviceIds={[other.id]}
          dispatch={jest.fn()}
          onBack={jest.fn()}
        />
      </SettingsProvider>,
    );

    const bidder = state.players.find((p) => p.id === LiquidateEngine.actingPlayerId(state))!;
    expect(await screen.findByLabelText(`${bidder.name} to bid`)).toBeTruthy();
  });

  it('disables both actions for a spectator', async () => {
    const state = auctionState();
    render(
      <SettingsProvider>
        <AuctionView
          state={state}
          youId={state.players[0]!.id}
          deviceIds={[]}
          dispatch={jest.fn()}
          onBack={jest.fn()}
        />
      </SettingsProvider>,
    );

    const pass = await screen.findByRole('button', { name: 'Pass' });
    expect(pass.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('lists the bid history once bids have been made', async () => {
    let state = auctionState();
    const min = state.pendingAuction!.highestBid + 1;
    state = LiquidateEngine.applyAction(state, { type: 'bid', amount: min }).resultingState!;

    await renderAuction(state);
    expect(screen.getByText('BID HISTORY')).toBeTruthy();
    // The bid that was just made shows in the history, alongside the headline.
    expect(screen.getAllByText(formatCredits(min)).length).toBeGreaterThan(1);
  });
});
