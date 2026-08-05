import type { Puzzle } from '../../puzzles/types';

export const CHECKERS_PUZZLES: Puzzle[] = [
  {
    id: 'checkers-001',
    game: 'checkers',
    position: 'W:W26,27:B6,15,22,23',
    playerColor: 'white',
    goal: 'best-move',
    prompt: 'White must capture. Two jumps are on offer — take the right one.',
    difficulty: 'medium',
    rating: 1100,
    themes: ['double-jump', 'promotion'],
    steps: [{ move: 'e2c8' }],
    explanation:
      'Captures are compulsory, so the only question is which one. The eye-catching jump is ' +
      'c2–e4–g6, taking two pieces and stopping there. The e2 man instead runs g4–e6–c8: ' +
      'three pieces, and it finishes on the back row and crowns. Follow every jump chain to ' +
      'its end before choosing between them.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-002',
    game: 'checkers',
    position: 'W:W26,27,29:B18,19',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. Give something up first.',
    difficulty: 'medium',
    rating: 1250,
    themes: ['shot', 'sacrifice', 'double-jump'],
    steps: [
      {
        move: 'c2d3',
        reply: 'e4c2',
        note: 'Captures are compulsory, so Black has exactly one legal reply.',
      },
      { move: 'b1b5' },
    ],
    explanation:
      'A shot. The quiet move c2–d3 hangs a man where Black is compelled to take it, and the ' +
      'capture drags the black man from e4 onto c2 — straight into the line of the b1 man, ' +
      'which jumps it and carries on over c4 to b5. Two pieces back for one, and Black has ' +
      'nothing left on the board.',
    source: 'Composed for GameExplorer',
  },
];
