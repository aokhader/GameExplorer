import type { Puzzle } from '../../puzzles/types';

export const REVERSI_PUZZLES: Puzzle[] = [
  {
    id: 'reversi-001',
    game: 'reversi',
    position: 'OXXXXXX./OXXXXXXO/OXXOOOXO/OXOXOXXO/OOXXXOXO/OOOOOXXO/OOOOOOXO/.OOOOOOX b',
    playerColor: 'black',
    goal: 'best-move',
    prompt: 'Two corners are open and Black can take either. Only one of them wins.',
    difficulty: 'medium',
    rating: 1150,
    themes: ['corner', 'endgame', 'parity'],
    steps: [{ move: 'h8' }],
    explanation:
      'Both a1 and h8 are corners, so the usual "always take the corner" rule is no help — ' +
      'the question is which one, and the answer is decided by what the opponent gets to do ' +
      'next. h8 wins the game; a1 loses it, because it hands White the last corner and the ' +
      'edge that comes with it.',
    source: 'Composed endgame — the same frame as reversi-002, one exchange later',
  },
  {
    id: 'reversi-002',
    game: 'reversi',
    position: '.XXXXXX./XXXXXXXO/XXXOOOXO/XXOXOXXO/XOXXOOXO/XOOOOOXO/OOOOOOOO/.OOOOOO. b',
    playerColor: 'black',
    goal: 'win-game',
    prompt: 'Four corners, four empty squares, Black to play. Win the game.',
    difficulty: 'hard',
    rating: 1500,
    themes: ['corner', 'endgame', 'parity', 'forced-pass'],
    steps: [
      { move: 'h1', reply: 'a8', note: 'a1 first loses — the corners have to be taken in order.' },
      {
        move: 'h8',
        note: 'White has no legal move now and passes automatically, so Black moves again.',
      },
      { move: 'a1' },
    ],
    explanation:
      'Every remaining square is a corner, so this is pure parity: whoever is on move when ' +
      'the squares run out takes the rest. h1 first, and after White answers a8, h8 leaves ' +
      'White with nothing to play — the pass hands the move straight back, and a1 finishes ' +
      'the board with Black ahead. Starting with a1 instead reverses the whole sequence.',
    source: 'Composed for GameExplorer',
  },
];
