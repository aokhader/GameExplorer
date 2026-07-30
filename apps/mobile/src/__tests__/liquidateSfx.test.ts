import { LiquidateEngine } from '@gameexplorer/shared';
import { sfxForLogLine } from '@/liquidate/liquidateSfx';

/**
 * Checked against the engine's real strings, not against paraphrases — the
 * table matches on message text, so a reworded log line silently kills the
 * feedback it earned. The literals below are copied from `engine.ts`.
 */
describe('sfxForLogLine', () => {
  it.each([
    ['Vega rolls 3+3 = 6', 'jump'],
    ['Vega rolls doubles and leaves impound', 'jump'],
    ['Captain claims Cinder for 70', 'promote'],
    ['Dax wins Oxide at auction for 140', 'promote'],
    ['Orin builds colony 2 on Tidal', 'promote'],
    ['Orin raises a megastructure on Tidal', 'promote'],
    ['Captain owes 90 rent to Vega for Ashfall', 'capture'],
    ['Captain owes 200 — Docking Fee', 'capture'],
    ['Captain pays the 100 release fee', 'capture'],
    ['Nyra folds — everything passes to Dax', 'loss'],
    ['Nyra folds — holdings return to the bank', 'loss'],
    ['Vega is the last solvent baron and wins', 'win'],
    ['Kessa wins with a net worth of 3200', 'win'],
    ['Captain is scanned and impounded', 'check'],
    ['Captain rolled 3 doubles — sent to impound', 'check'],
    ['Captain stays in impound', 'check'],
    ['Vega draws: Salvage rights pay out. Collect 150.', 'select'],
    ['Orin bids 180', 'select'],
    ['Orin mortgages Tidal for 115', 'select'],
  ])('maps %s', (message, expected) => {
    expect(sfxForLogLine(message)).toBe(expected);
  });

  it('stays silent on a line that earns no feedback', () => {
    expect(sfxForLogLine('Bluereach draws no bids and stays unclaimed')).toBeNull();
  });

  it('does not mistake an auction win for winning the match', () => {
    expect(sfxForLogLine('Dax wins Oxide at auction for 140')).not.toBe('win');
  });

  it('treats a roll out of impound as a roll, not an impound event', () => {
    expect(sfxForLogLine('Vega rolls doubles and leaves impound')).toBe('jump');
  });

  /**
   * The guard that matters: drive a real game and check nothing throws and the
   * common lines are recognised. If the engine's phrasing drifts, this notices
   * that the table has gone quiet rather than that one literal changed.
   */
  it('recognises most of what a real game writes', () => {
    let state = LiquidateEngine.newGame({
      players: [{ name: 'Ada' }, { name: 'Bo', isBot: true }],
      mode: 'quick',
      seed: 3,
    });

    for (let i = 0; i < 250 && !state.isGameOver; i++) {
      const legal = LiquidateEngine.getLegalActions(state);
      if (legal.length === 0) break;
      const result = LiquidateEngine.applyAction(state, legal[0]!);
      if (!result.valid || !result.resultingState) break;
      state = result.resultingState;
    }

    expect(state.log.length).toBeGreaterThan(20);
    const matched = state.log.filter((l) => sfxForLogLine(l.message) !== null).length;
    expect(matched / state.log.length).toBeGreaterThan(0.6);
  });
});
