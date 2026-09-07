/**
 * The pure half of the Lichess import.
 *
 * The transform that matters most is the setup-move one, and it is the easiest
 * to get silently wrong: `FEN` is the position *before* the opponent's move and
 * `Moves[0]` is that move, so an importer that reads the FEN as the puzzle
 * position produces puzzles that are all off by one ply — legal, plausible, and
 * asking the wrong side to move.
 */

import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../game-logic/chess/engine';
import { fenToState, stateToFen } from '../game-logic/chess/fen';
import { parseUciMoveString } from '../game-logic/chess/uci';
import {
  LICHESS_FILTERS,
  lichessDifficulty,
  lichessGoal,
  lichessMetadata,
  lichessPrompt,
  lichessRowPasses,
  lichessSteps,
  mapLichessThemes,
  parseLichessRow,
  type LichessRow,
} from './lichess';

/**
 * A row in the dump's real shape, built from a position the engine agrees with.
 *
 * Derived from the shipped `chess-001` back-rank mate rather than copied from
 * the dump, so every move in it is provably legal: the FEN is one ply earlier
 * with Black to move, `f8g8` is the setup move that produces the puzzle, and
 * `a1a8` is the mate. An invented-looking row is easy to write and impossible
 * to trust — the first draft of this fixture had a setup move whose origin
 * square was empty, and every engine assertion below failed on it.
 */
const LINE =
  '00sHx,5k2/5ppp/8/8/8/8/8/R5K1 b - - 0 1,f8g8 a1a8,1760,74,94,7876,backRankMate mateIn1 short endgame,https://lichess.org/x/black#34,';

describe('parseLichessRow', () => {
  it('reads every column used downstream', () => {
    const row = parseLichessRow(LINE)!;
    expect(row.puzzleId).toBe('00sHx');
    expect(row.moves).toEqual(['f8g8', 'a1a8']);
    expect(row.rating).toBe(1760);
    expect(row.ratingDeviation).toBe(74);
    expect(row.popularity).toBe(94);
    expect(row.nbPlays).toBe(7876);
    expect(row.themes).toContain('backRankMate');
  });

  it('rejects a malformed line rather than importing garbage', () => {
    expect(parseLichessRow('')).toBeNull();
    expect(parseLichessRow('a,b,c')).toBeNull();
    // A line with only the setup move is not a puzzle.
    expect(
      parseLichessRow('id,8/8/8/8/8/8/8/8 w - - 0 1,e2e4,1500,50,90,1000,fork,url,'),
    ).toBeNull();
  });
});

describe('lichessSteps — the setup move is not part of the puzzle', () => {
  it('pairs the remaining moves as player/opponent', () => {
    // Pure pairing, so arbitrary strings are the honest fixture here — the
    // engine-legality half is covered separately below.
    expect(lichessSteps(['e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'])).toEqual([
      { move: 'e6e7', reply: 'b2b1' },
      { move: 'b3c1', reply: 'b1c1' },
      { move: 'h6c1' },
    ]);
  });

  it('leaves the final step without a reply — that is what solved means', () => {
    expect(lichessSteps(['a1a2'])).toEqual([{ move: 'a1a2' }]);
    expect(lichessSteps(['a1a2', 'b1b2'])).toEqual([{ move: 'a1a2', reply: 'b1b2' }]);
  });

  it('produces a position whose side to move is the solver', () => {
    // The whole point of applying the setup move. Read the FEN raw and the side
    // to move is the OPPONENT; apply Moves[0] and it is the player.
    const row = parseLichessRow(LINE)!;
    const raw = fenToState(row.fen);
    expect(raw.currentTurn).toBe('black');

    const setup = parseUciMoveString(row.moves[0])!;
    const after = ChessEngine.validateMove(raw, setup.from, setup.to, false, setup.promotion);
    expect(after.valid).toBe(true);
    expect(after.resultingState!.currentTurn).toBe('white');

    // …and it round-trips, which the content gate asserts for every puzzle.
    const position = stateToFen(after.resultingState!);
    expect(stateToFen(fenToState(position))).toBe(position);
  });
});

describe('mapLichessThemes', () => {
  it('maps the themes we have and drops the ones we do not', () => {
    expect(mapLichessThemes(['fork', 'crushing', 'middlegame'])).toEqual(['fork']);
    expect(mapLichessThemes(['crushing', 'short'])).toEqual([]);
  });

  it('collapses the endgame family to one tag without duplicating it', () => {
    expect(mapLichessThemes(['rookEndgame', 'endgame', 'pawnEndgame'])).toEqual(['endgame']);
  });

  it('maps advancedPawn onto promotion, which is what it means for us', () => {
    expect(mapLichessThemes(['advancedPawn'])).toEqual(['promotion']);
  });
});

describe('lichessRowPasses', () => {
  const base = parseLichessRow(LINE)!;
  const withFields = (over: Partial<LichessRow>): LichessRow => ({ ...base, ...over });

  it('accepts a well-played, well-rated, themed puzzle', () => {
    expect(lichessRowPasses(base)).toBe(true);
  });

  it('rejects a puzzle nobody has played — the rating is the reason to import', () => {
    expect(lichessRowPasses(withFields({ nbPlays: LICHESS_FILTERS.minPlays - 1 }))).toBe(false);
  });

  it('rejects unpopular and high-deviation rows', () => {
    expect(lichessRowPasses(withFields({ popularity: 10 }))).toBe(false);
    expect(lichessRowPasses(withFields({ ratingDeviation: 200 }))).toBe(false);
  });

  it('rejects a line too long to solve on a phone', () => {
    const long = Array.from({ length: 2 + LICHESS_FILTERS.maxPlayerMoves * 2 }, () => 'a1a2');
    expect(lichessRowPasses(withFields({ moves: long }))).toBe(false);
  });

  it('rejects a row whose themes all map to nothing', () => {
    expect(lichessRowPasses(withFields({ themes: ['crushing', 'short'] }))).toBe(false);
  });

  it('rejects ratings outside the band model’s range', () => {
    expect(lichessRowPasses(withFields({ rating: 100 }))).toBe(false);
    expect(lichessRowPasses(withFields({ rating: 3500 }))).toBe(false);
  });
});

describe('lichessGoal', () => {
  it('claims mate only when the line ends on our move', () => {
    expect(lichessGoal(['mateIn2'], [{ move: 'a', reply: 'b' }, { move: 'c' }])).toBe('mate');
    // Ends on the opponent's reply — not a delivered mate in step form.
    expect(lichessGoal(['mateIn2'], [{ move: 'a', reply: 'b' }])).toBe('best-move');
  });

  it('never claims win-material from themes alone', () => {
    // The gate proves that goal by walking the line, and most Lichess lines
    // stop before the material is actually collected.
    expect(lichessGoal(['hangingPiece', 'crushing'], [{ move: 'a' }])).toBe('best-move');
  });
});

describe('generated copy', () => {
  it('names the side and the mate length', () => {
    expect(lichessPrompt('black', 'mate', [{ move: 'a', reply: 'b' }, { move: 'c' }], [])).toBe(
      'Black to play and mate in two.',
    );
  });

  it('names a motif when there is one, and stays generic when there is not', () => {
    expect(lichessPrompt('white', 'best-move', [{ move: 'a' }], ['back-rank'])).toContain(
      'back rank',
    );
    expect(lichessPrompt('white', 'best-move', [{ move: 'a' }], [])).toBe(
      'White to play. Find the best move.',
    );
  });
});

describe('lichessDifficulty', () => {
  it('splits the range into the three authoring tiers', () => {
    expect(lichessDifficulty(800)).toBe('easy');
    expect(lichessDifficulty(1200)).toBe('medium');
    expect(lichessDifficulty(2100)).toBe('hard');
  });
});

describe('lichessMetadata', () => {
  it('produces a puzzle that satisfies the shipped contract', () => {
    const row = parseLichessRow(LINE)!;
    const raw = fenToState(row.fen);
    const setup = parseUciMoveString(row.moves[0])!;
    const state = ChessEngine.validateMove(raw, setup.from, setup.to, false, setup.promotion)
      .resultingState!;
    const position = stateToFen(state);

    const puzzle = lichessMetadata(row, position, state.currentTurn, 'chess-1000');

    expect(puzzle.id).toMatch(/^chess-\d{3,6}$/);
    expect(puzzle.game).toBe('chess');
    expect(puzzle.playerColor).toBe(state.currentTurn);
    expect(puzzle.rating).toBe(1760);
    expect(puzzle.source).toContain('CC0 1.0');
    expect(puzzle.source).toContain('00sHx');
    // Pure data, because this is the shape a database row deserializes into.
    expect(JSON.parse(JSON.stringify(puzzle))).toEqual(puzzle);
  });

  it('scripts a line the real engine accepts move for move', () => {
    // The strongest check available without the content gate: replay it.
    const row = parseLichessRow(LINE)!;
    const raw = fenToState(row.fen);
    const setup = parseUciMoveString(row.moves[0])!;
    let state = ChessEngine.validateMove(raw, setup.from, setup.to, false, setup.promotion)
      .resultingState!;
    const puzzle = lichessMetadata(row, stateToFen(state), state.currentTurn, 'chess-1000');

    for (const step of puzzle.steps) {
      for (const uci of [step.move, step.reply].filter(Boolean) as string[]) {
        const move = parseUciMoveString(uci)!;
        const result = ChessEngine.validateMove(state, move.from, move.to, false, move.promotion);
        expect(result.valid, `${uci} was rejected`).toBe(true);
        state = result.resultingState!;
      }
    }
  });
});
