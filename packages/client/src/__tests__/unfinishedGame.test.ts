import { describe, expect, it, vi } from 'vitest';
import { CheckersEngine, ChessEngine, GoEngine, ReversiEngine } from '@gameexplorer/shared';

// The rules registry imports the game writers, and the db barrel builds a
// Supabase client on import. Nothing here saves.
vi.mock('@gameexplorer/db', () => ({
  saveGame: vi.fn(),
  saveCheckersGame: vi.fn(),
  saveReversiGame: vi.fn(),
  saveGoGame: vi.fn(),
}));

import { CHECKERS_RULES, CHESS_RULES, REVERSI_RULES, actionsFromHistory, localRulesFor } from '../game/localRules';
import {
  localGameResult,
  parseUnfinishedGame,
  replayActions,
  serializeUnfinishedGame,
  unfinishedGameKey,
  unfinishedGameSummary,
  type UnfinishedGame,
} from '../game/unfinishedGame';
import { GO_PASS } from '../game/goAdapter';

function saved(overrides: Partial<UnfinishedGame> = {}): UnfinishedGame {
  return {
    v: 1,
    game: 'chess',
    mode: 'bot',
    userId: 'u1',
    rated: true,
    playerColor: 'white',
    botElo: 1200,
    setup: { elo: 1200, color: 'white', rated: true, custom: false },
    actions: [{ from: 'e2', to: 'e4' }],
    hintsUsed: 0,
    startedAt: 1,
    savedAt: 2,
    ...overrides,
  };
}

describe('unfinishedGame — keys and parsing', () => {
  it('keeps one slot per game and account, with guests apart', () => {
    expect(unfinishedGameKey('go', 'abc')).toBe('gx:inprogress:go:abc');
    expect(unfinishedGameKey('go', null)).toBe('gx:inprogress:go:guest');
  });

  it('round-trips a snapshot', () => {
    const game = saved({ end: 'resign', hintsUsed: 2 });
    expect(parseUnfinishedGame(serializeUnfinishedGame(game))).toEqual(game);
  });

  it.each([
    ['nothing', null],
    ['not json', '{'],
    ['a future version', JSON.stringify(saved({ v: 2 as 1 }))],
    ['an unknown game', JSON.stringify({ ...saved(), game: 'liquidate' })],
    ['no moves', JSON.stringify(saved({ actions: [] }))],
    ['a malformed move', JSON.stringify({ ...saved(), actions: [{ from: 'e2' }] })],
    ['a rated guest game', JSON.stringify(saved({ userId: null, rated: true }))],
    ['an unknown ending', JSON.stringify({ ...saved(), end: 'abandoned' })],
  ])('rejects %s', (_label, raw) => {
    expect(parseUnfinishedGame(raw)).toBeNull();
  });

  it('refuses a snapshot filed under another game or account', () => {
    const raw = serializeUnfinishedGame(saved());
    expect(parseUnfinishedGame(raw, { game: 'chess', userId: 'u1' })).not.toBeNull();
    expect(parseUnfinishedGame(raw, { game: 'checkers', userId: 'u1' })).toBeNull();
    expect(parseUnfinishedGame(raw, { game: 'chess', userId: 'someone-else' })).toBeNull();
    expect(parseUnfinishedGame(raw, { game: 'chess', userId: null })).toBeNull();
  });
});

describe('unfinishedGame — replay', () => {
  it('rebuilds a chess timeline', () => {
    const timeline = replayActions(CHESS_RULES, [
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
    ]);
    expect(timeline).toHaveLength(4);
    expect(timeline![3].currentTurn).toBe('black');
    expect(timeline![3].moveHistory).toHaveLength(3);
  });

  it('returns null at the first move the rules reject', () => {
    expect(replayActions(CHESS_RULES, [{ from: 'e2', to: 'e4' }, { from: 'e2', to: 'e4' }])).toBeNull();
  });

  it("replays reversi's forced pass as the loop recorded it", () => {
    const start = ReversiEngine.newGame();
    const move = ReversiEngine.getAllLegalMoves(start)[0];
    const timeline = replayActions(REVERSI_RULES, [{ from: move, to: move }, { pass: true }]);
    expect(timeline).toHaveLength(3);
    // A pass hands the turn back without placing a disc.
    expect(timeline![2].currentTurn).toBe(start.currentTurn);
  });

  it('cannot replay a pass for a game that has none', () => {
    expect(replayActions(CHESS_RULES, [{ pass: true }])).toBeNull();
  });

  it("replays Go on the board size it was started with, sentinels and all", () => {
    const rules = localRulesFor({ game: 'go', mode: 'bot', setup: { size: 13, komi: 6.5, scoring: 'area' } });
    // k10 exists on 13×13 and not on 9×9, so this fails on the wrong board.
    const timeline = replayActions(rules, [
      { from: 'k10', to: 'k10' },
      { from: GO_PASS, to: GO_PASS },
    ]);
    expect(timeline).not.toBeNull();
    const last = timeline![2] as ReturnType<typeof GoEngine.newGame>;
    expect(last.size).toBe(13);
    expect(last.komi).toBe(6.5);

    const nine = localRulesFor({ game: 'go', mode: 'bot', setup: {} });
    expect(replayActions(nine, [{ from: 'k10', to: 'k10' }])).toBeNull();
  });
});

describe('unfinishedGame — actions read off a move history', () => {
  /** Play random legal moves through the rules, then check the history replays to the same place. */
  function roundTrip<S extends { moveHistory: unknown[] }>(
    game: 'chess' | 'checkers' | 'reversi',
    rules: { newGame(): S; validateMove(s: S, f: string, t: string, p?: string): { valid: boolean; resultingState?: S } },
    legal: (s: S) => { from: string; to: string; promotion?: string }[],
    pass?: (s: S) => S | null,
  ) {
    let state = rules.newGame();
    let seed = 7;
    for (let i = 0; i < 60; i++) {
      const passed = pass?.(state);
      if (passed) {
        state = passed;
        continue;
      }
      const moves = legal(state);
      if (moves.length === 0) break;
      seed = (seed * 16807) % 2147483647;
      const m = moves[seed % moves.length];
      // A pawn reaching the last rank needs a piece named; everything else ignores it.
      const next =
        rules.validateMove(state, m.from, m.to, m.promotion).resultingState ??
        rules.validateMove(state, m.from, m.to, 'queen').resultingState;
      if (!next) break;
      state = next;
    }
    const replayed = replayActions(rules as never, actionsFromHistory(game, state as never)) as S[] | null;
    expect(replayed).not.toBeNull();
    expect(JSON.stringify(replayed![replayed!.length - 1])).toBe(JSON.stringify(state));
  }

  it('replays a chess game to the same position', () => {
    roundTrip('chess', CHESS_RULES, (s) => ChessEngine.getAllLegalMoves(s));
  });

  it('replays a checkers game to the same position', () => {
    roundTrip('checkers', CHECKERS_RULES, (s) => CheckersEngine.getAllLegalMoves(s).map((m) => ({ from: m.from, to: m.to })));
  });

  it("replays a reversi game, forced passes included", () => {
    roundTrip(
      'reversi',
      REVERSI_RULES,
      (s) => ReversiEngine.getAllLegalMoves(s).map((p) => ({ from: p, to: p })),
      (s) => (ReversiEngine.mustPass(s) && !s.isGameOver ? ReversiEngine.executePass(s) : null),
    );
  });
});

describe('unfinishedGame — summary', () => {
  it('says what was chosen, and that it is rated', () => {
    const moves = Array.from({ length: 23 }, () => ({ from: 'a', to: 'b' }));
    expect(unfinishedGameSummary(saved({ botElo: 1500, actions: moves }))).toBe(
      'vs Bot 1500 · Rated · You play White · move 12',
    );
  });

  it('leaves out the side in pass-and-play and counts Go stones', () => {
    expect(
      unfinishedGameSummary(
        saved({ game: 'go', mode: 'pass-and-play', rated: false, setup: { size: 13 }, actions: [{ pass: true }] }),
      ),
    ).toBe('Pass & Play · 13×13 · 1 move in');
    expect(unfinishedGameSummary(saved({ mode: 'training', playerColor: 'black' }))).toBe(
      'Training · Rated · You play Black · move 1',
    );
  });
});

describe('unfinishedGame — result', () => {
  it.each([
    ['a resignation is a loss', 'resign', null, { result: 'black', outcome: 'loss' }],
    ['an agreed draw is a draw', 'draw', 'white', { result: 'draw', outcome: 'draw' }],
    ['a natural win', 'over', 'white', { result: 'white', outcome: 'win' }],
    ['a natural loss', 'over', 'black', { result: 'black', outcome: 'loss' }],
    ['no winner is a draw', 'over', null, { result: 'draw', outcome: 'draw' }],
  ] as const)('%s', (_label, end, winner, expected) => {
    expect(localGameResult({ playerColor: 'white', winner, end })).toEqual(expected);
  });
});
