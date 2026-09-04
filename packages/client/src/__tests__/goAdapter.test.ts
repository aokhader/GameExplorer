/**
 * The Go binding for `useLocalGame`, tested without a renderer.
 *
 * `packages/client` has no DOM and no React testing library — by design, it is
 * the platform-free layer — so what is checked here is the adapter's own
 * contract: the ruleset it hands the engine, the sentinel channel the review
 * rides on, and the `isAwaitingReview` flag every turn-taking part of the loop
 * now consults. The hook's *reaction* to that flag is covered where the hook
 * actually runs, in `apps/mobile/src/__tests__/GoScreen.test.tsx`.
 */
import { describe, it, expect, vi } from 'vitest';
import { GoEngine, detectDeadStones } from '@gameexplorer/shared';

// The adapter imports the game writer, and `@gameexplorer/db` builds a Supabase
// client the moment it is loaded. Nothing here saves anything, so the module
// only has to exist — the same stub both apps' suites install.
vi.mock('@gameexplorer/db', () => ({ saveGoGame: vi.fn(async () => null) }));
import {
  GO_FINALIZE,
  GO_KOMI_PRESETS,
  GO_PASS,
  GO_RATED_KOMI,
  GO_RESUME,
  GO_SCORING_OPTIONS,
  goFinalizeMove,
  goKomiLabel,
  goRulesetSummary,
  makeGoAdapter,
} from '../game/goAdapter';

/** A game that has run to two passes and is waiting on the review. */
function reviewing(adapter = makeGoAdapter()) {
  const start = adapter.newGame();
  const first = adapter.validateMove(start, GO_PASS, GO_PASS).resultingState!;
  return adapter.validateMove(first, GO_PASS, GO_PASS).resultingState!;
}

describe('makeGoAdapter — the chosen ruleset', () => {
  it('defaults to the standard 9×9 game', () => {
    const state = makeGoAdapter().newGame();
    expect(state.size).toBe(9);
    expect(state.komi).toBe(GO_RATED_KOMI);
    expect(state.scoring).toBe('area');
  });

  it('carries the setup screen’s komi and scoring into every new game', () => {
    const adapter = makeGoAdapter({ komi: 0, scoring: 'territory' });
    // Including the second one — "play again" calls `newGame` with no arguments,
    // which is the whole reason this is a factory and not a constant.
    for (const state of [adapter.newGame(), adapter.newGame()]) {
      expect(state.komi).toBe(0);
      expect(state.scoring).toBe('territory');
    }
  });
});

describe('makeGoAdapter — the review', () => {
  const adapter = makeGoAdapter();

  it('reports the review without reporting the game over', () => {
    const state = reviewing();
    expect(state.phase).toBe('marking');
    expect(adapter.isGameOver(state)).toBe(false);
    expect(adapter.isAwaitingReview!(state)).toBe(true);
  });

  it('does not report a review during play or after the score', () => {
    const start = adapter.newGame();
    expect(adapter.isAwaitingReview!(start)).toBe(false);

    const scored = adapter.validateMove(reviewing(), goFinalizeMove([]), '').resultingState!;
    expect(adapter.isAwaitingReview!(scored)).toBe(false);
    expect(adapter.isGameOver(scored)).toBe(true);
  });

  it('refuses a third pass rather than passing out of the review', () => {
    expect(adapter.validateMove(reviewing(), GO_PASS, GO_PASS).valid).toBe(false);
  });

  it('accepts the score through the finalize sentinel, marks and all', () => {
    // A finished corner where Black's group is sealed into a straight three and
    // cannot make two eyes. Built directly rather than replayed — the adapter is
    // what is under test, not the forty moves that would reach this position.
    const black = ['a4', 'b1', 'b2', 'b3', 'b4'];
    const white = ['a5', 'b5', 'c1', 'c2', 'c3', 'c4'];
    const finished = {
      ...GoEngine.newGame(),
      board: GoEngine.newGame().board.map((row, r) =>
        row.map((_, c) => {
          const point = String.fromCharCode(97 + c) + (r + 1);
          if (black.includes(point)) return 'black' as const;
          if (white.includes(point)) return 'white' as const;
          return null;
        }),
      ),
      phase: 'marking' as const,
      consecutivePasses: 2,
    };

    const dead = detectDeadStones(finished);
    expect(dead).not.toEqual([]);

    const scored = adapter.validateMove(finished, goFinalizeMove(dead), '').resultingState!;
    expect(scored.deadStones).toEqual(dead);
    expect(scored.isGameOver).toBe(true);
    expect(scored.winner).toBe('white');
  });

  it('goes back to the board through the resume sentinel', () => {
    const resumed = adapter.validateMove(reviewing(), GO_RESUME, GO_RESUME).resultingState!;
    expect(resumed.phase).toBe('playing');
    expect(resumed.consecutivePasses).toBe(0);
    expect(adapter.isAwaitingReview!(resumed)).toBe(false);
  });

  it('refuses both review sentinels while the game is still being played', () => {
    const playing = adapter.newGame();
    expect(adapter.validateMove(playing, GO_RESUME, GO_RESUME).valid).toBe(false);
    expect(adapter.validateMove(playing, goFinalizeMove([]), '').valid).toBe(false);
  });

  it('reads an empty mark list as "nothing is dead", not as a malformed move', () => {
    const result = adapter.validateMove(reviewing(), `${GO_FINALIZE}:`, '');
    expect(result.valid).toBe(true);
    expect(result.resultingState!.deadStones).toEqual([]);
  });

  it('rejects a placement while the board is being counted', () => {
    expect(adapter.validateMove(reviewing(), 'e5', 'e5').valid).toBe(false);
  });
});

describe('the review hook is opt-in', () => {
  it('is the only adapter member the other four games can leave unset', () => {
    // Every guard added to `useLocalGame` for the review is written as
    // `adapter.isAwaitingReview?.(state)`, so an adapter that does not define it
    // behaves exactly as it did before. Go is the only one that does.
    const adapter = makeGoAdapter();
    expect(typeof adapter.isAwaitingReview).toBe('function');
    expect(adapter.allowsVoluntaryPass).toBe(true);
  });
});

describe('setup tables', () => {
  it('offers the rated komi among the presets', () => {
    expect(GO_KOMI_PRESETS.map((k) => k.value)).toContain(GO_RATED_KOMI);
  });

  it('gives every preset and ruleset a line the player can act on', () => {
    for (const entry of [...GO_KOMI_PRESETS, ...GO_SCORING_OPTIONS]) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it('describes a ruleset the way the setup screens print it', () => {
    expect(goRulesetSummary(9, 7.5, 'area')).toBe('9×9 · area scoring · 7.5 komi to white');
    expect(goRulesetSummary(9, 6.5, 'territory')).toBe(
      '9×9 · territory scoring · 6.5 komi to white',
    );
    // Zero is the one that has to read as a sentence rather than as "0 komi".
    expect(goRulesetSummary(9, 0, 'area')).toBe('9×9 · area scoring · no komi');
    expect(goKomiLabel(0)).toBe('no komi');
    expect(goKomiLabel(7.5)).toBe('7.5 komi');
  });
});
