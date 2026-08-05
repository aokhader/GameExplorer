import { describe, expect, it } from 'vitest';
import {
  applyOpponentReply,
  applyPlayerMove,
  hintFor,
  markHintUsed,
  retryPuzzle,
  startPuzzle,
} from './runtime';
import { chessPuzzleRules, checkersPuzzleRules, reversiPuzzleRules } from './rules';
import type { Puzzle } from './types';
import type { ChessGameState } from '../types/chess.types';
import type { CheckersGameState } from '../game-logic/checkers/types';
import type { ReversiGameState } from '../game-logic/reversi/types';

const MATE_IN_TWO: Puzzle = {
  id: 'chess-900',
  game: 'chess',
  position: 'r5k1/5ppp/8/8/8/8/1R6/1R4K1 w - - 0 1',
  playerColor: 'white',
  goal: 'mate',
  prompt: 'Mate in two.',
  difficulty: 'medium',
  rating: 1200,
  themes: ['back-rank'],
  steps: [{ move: 'b2b8', reply: 'a8b8' }, { move: 'b1b8' }],
  explanation: 'Deflect the defender, then recapture.',
};

const PROMOTION: Puzzle = {
  ...MATE_IN_TWO,
  id: 'chess-901',
  // Kings kept well apart — adjacent kings make every move self-check, and
  // then nothing is legal.
  position: '8/4P3/8/8/8/8/8/K5k1 w - - 0 1',
  goal: 'best-move',
  steps: [{ move: 'e7e8q' }],
};

const CHECKERS_SHOT: Puzzle = {
  id: 'checkers-900',
  game: 'checkers',
  position: 'W:W26,27,29:B18,19',
  playerColor: 'white',
  goal: 'win-game',
  prompt: 'Win.',
  difficulty: 'medium',
  rating: 1250,
  themes: ['shot'],
  steps: [{ move: 'c2d3', reply: 'e4c2' }, { move: 'b1b5' }],
  explanation: 'A shot.',
};

const REVERSI_PARITY: Puzzle = {
  id: 'reversi-900',
  game: 'reversi',
  position: '.XXXXXX./XXXXXXXO/XXXOOOXO/XXOXOXXO/XOXXOOXO/XOOOOOXO/OOOOOOOO/.OOOOOO. b',
  playerColor: 'black',
  goal: 'win-game',
  prompt: 'Win.',
  difficulty: 'hard',
  rating: 1500,
  themes: ['parity'],
  steps: [{ move: 'h1', reply: 'a8' }, { move: 'h8' }, { move: 'a1' }],
  explanation: 'Parity.',
};

describe('startPuzzle', () => {
  it('opens on the player’s move with a clean sheet', () => {
    const run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    expect(run.phase).toBe('playing');
    expect(run.stepIndex).toBe(0);
    expect(run.attempts).toBe(0);
    expect(run.clean).toBe(true);
    expect(run.state.currentTurn).toBe('white');
  });
});

describe('applyPlayerMove', () => {
  it('advances on the scripted move and waits for the reply', () => {
    const run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    const { run: next, result } = applyPlayerMove(run, chessPuzzleRules, {
      from: 'b2',
      to: 'b8',
    });
    expect(result).toBe('correct');
    expect(next.phase).toBe('replying');
    expect(next.state.currentTurn).toBe('black');
  });

  it('rejects a wrong move and leaves the board untouched', () => {
    const run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    const { run: next, result } = applyPlayerMove(run, chessPuzzleRules, {
      from: 'b1',
      to: 'b8',
    });
    expect(result).toBe('wrong');
    expect(next.phase).toBe('wrong');
    expect(next.attempts).toBe(1);
    expect(next.clean).toBe(false);
    expect(next.wrongMove).toEqual({ from: 'b1', to: 'b8' });
    expect(next.state).toBe(run.state);
  });

  it('treats an outright illegal move as wrong, not as a throw', () => {
    const run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    const { run: next, result } = applyPlayerMove(run, chessPuzzleRules, {
      from: 'h7',
      to: 'a1',
    });
    expect(result).toBe('wrong');
    expect(next.state).toBe(run.state);
  });

  it('ignores moves during the reply beat', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b2', to: 'b8' }).run;

    const { run: after, result } = applyPlayerMove(run, chessPuzzleRules, {
      from: 'b1',
      to: 'b8',
    });
    expect(result).toBe('ignored');
    expect(after).toBe(run);
  });

  it('ignores moves once solved, and after a wrong one', () => {
    let run = startPuzzle<ChessGameState>(PROMOTION, chessPuzzleRules);
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'e7', to: 'e8', promotion: 'queen' }).run;
    expect(run.phase).toBe('solved');
    expect(applyPlayerMove(run, chessPuzzleRules, { from: 'g1', to: 'f1' }).result).toBe('ignored');

    let wrong = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    wrong = applyPlayerMove(wrong, chessPuzzleRules, { from: 'b1', to: 'b8' }).run;
    expect(applyPlayerMove(wrong, chessPuzzleRules, { from: 'b2', to: 'b8' }).result).toBe(
      'ignored',
    );
  });

  it('matches an auto-queened board move against a scripted "e7e8q"', () => {
    const run = startPuzzle<ChessGameState>(PROMOTION, chessPuzzleRules);
    expect(
      applyPlayerMove(run, chessPuzzleRules, { from: 'e7', to: 'e8', promotion: 'queen' }).result,
    ).toBe('solved');
  });

  it('does not accept an underpromotion for a scripted queen promotion', () => {
    const run = startPuzzle<ChessGameState>(PROMOTION, chessPuzzleRules);
    expect(
      applyPlayerMove(run, chessPuzzleRules, { from: 'e7', to: 'e8', promotion: 'knight' }).result,
    ).toBe('wrong');
  });
});

describe('applyOpponentReply', () => {
  it('plays the scripted answer and hands the turn back', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b2', to: 'b8' }).run;
    run = applyOpponentReply(run, chessPuzzleRules);

    expect(run.phase).toBe('playing');
    expect(run.stepIndex).toBe(1);
    expect(run.state.currentTurn).toBe('white');
  });

  it('is a no-op when no reply is owed, so a double-fired timer cannot play twice', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b2', to: 'b8' }).run;
    const once = applyOpponentReply(run, chessPuzzleRules);
    expect(applyOpponentReply(once, chessPuzzleRules)).toBe(once);
  });

  it('solves the puzzle when the last step is played', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b2', to: 'b8' }).run;
    run = applyOpponentReply(run, chessPuzzleRules);
    const last = applyPlayerMove(run, chessPuzzleRules, { from: 'b1', to: 'b8' });

    expect(last.result).toBe('solved');
    expect(last.run.phase).toBe('solved');
    expect(last.run.clean).toBe(true);
    expect(last.run.state.isCheckmate).toBe(true);
  });
});

describe('retryPuzzle', () => {
  it('restores the start position but keeps the score', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    const start = run.state;
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b1', to: 'b8' }).run;
    run = retryPuzzle(run, chessPuzzleRules);

    expect(run.phase).toBe('playing');
    expect(run.stepIndex).toBe(0);
    expect(run.wrongMove).toBeNull();
    expect(run.attempts).toBe(1);
    expect(run.clean).toBe(false);
    expect(chessPuzzleRules.encode(run.state)).toBe(chessPuzzleRules.encode(start));
  });

  it('rewinds mid-line too', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b2', to: 'b8' }).run;
    run = applyOpponentReply(run, chessPuzzleRules);
    run = retryPuzzle(run, chessPuzzleRules);

    expect(run.stepIndex).toBe(0);
    expect(chessPuzzleRules.encode(run.state)).toBe(MATE_IN_TWO.position);
  });
});

describe('hints', () => {
  it('reveals the move for the current step, and nothing when it is not your turn', () => {
    let run = startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules);
    expect(hintFor(run, chessPuzzleRules)).toEqual({ from: 'b2', to: 'b8', promotion: undefined });

    run = applyPlayerMove(run, chessPuzzleRules, { from: 'b2', to: 'b8' }).run;
    expect(hintFor(run, chessPuzzleRules)).toBeNull();

    run = applyOpponentReply(run, chessPuzzleRules);
    expect(hintFor(run, chessPuzzleRules)).toEqual({ from: 'b1', to: 'b8', promotion: undefined });
  });

  it('costs the clean solve', () => {
    const run = markHintUsed(startPuzzle<ChessGameState>(MATE_IN_TWO, chessPuzzleRules));
    expect(run.hintUsed).toBe(true);
    expect(run.clean).toBe(false);
    expect(markHintUsed(run)).toBe(run);
  });
});

describe('checkers in the loop', () => {
  it('answers a multi-jump by its start and end squares', () => {
    let run = startPuzzle<CheckersGameState>(CHECKERS_SHOT, checkersPuzzleRules);
    run = applyPlayerMove(run, checkersPuzzleRules, { from: 'c2', to: 'd3' }).run;
    run = applyOpponentReply(run, checkersPuzzleRules);

    // The board reports only where the piece was picked up and put down; the
    // engine resolves the chain over c2 and c4.
    const last = applyPlayerMove(run, checkersPuzzleRules, { from: 'b1', to: 'b5' });
    expect(last.result).toBe('solved');
    expect(last.run.state.isGameOver).toBe(true);
    expect(last.run.state.winner).toBe('white');
  });
});

describe('reversi in the loop', () => {
  it('auto-passes for the opponent and hands the move straight back', () => {
    let run = startPuzzle<ReversiGameState>(REVERSI_PARITY, reversiPuzzleRules);

    run = applyPlayerMove(run, reversiPuzzleRules, { from: 'h1', to: 'h1' }).run;
    run = applyOpponentReply(run, reversiPuzzleRules);
    expect(run.state.currentTurn).toBe('black');

    // White has no legal move after h8, so the step carries no reply and the
    // runtime settles the pass itself rather than stalling on 'replying'.
    const second = applyPlayerMove(run, reversiPuzzleRules, { from: 'h8', to: 'h8' });
    expect(second.result).toBe('correct');
    expect(second.run.phase).toBe('playing');
    expect(second.run.stepIndex).toBe(2);
    expect(second.run.state.currentTurn).toBe('black');

    const third = applyPlayerMove(second.run, reversiPuzzleRules, { from: 'a1', to: 'a1' });
    expect(third.result).toBe('solved');
    expect(third.run.state.isGameOver).toBe(true);
    expect(third.run.state.winner).toBe('black');
  });

  it('calls the losing corner wrong', () => {
    const run = startPuzzle<ReversiGameState>(REVERSI_PARITY, reversiPuzzleRules);
    expect(applyPlayerMove(run, reversiPuzzleRules, { from: 'a1', to: 'a1' }).result).toBe('wrong');
  });
});
