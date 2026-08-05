import type { Puzzle } from '../../puzzles/types';

export const CHESS_PUZZLES: Puzzle[] = [
  {
    id: 'chess-001',
    game: 'chess',
    position: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 800,
    themes: ['back-rank', 'mate-in-1'],
    steps: [{ move: 'a1a8' }],
    explanation:
      'Ra8 is mate. The king has no way out along the back rank, and the three pawns it ' +
      'never moved are the reason — f7, g7 and h7 cover every escape square themselves. ' +
      'This is why a "luft" square matters in the endgame.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'chess-002',
    game: 'chess',
    position: 'r5k1/5ppp/8/8/8/8/1R6/1R4K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in two.',
    difficulty: 'medium',
    rating: 1200,
    themes: ['back-rank', 'mate-in-2', 'deflection', 'sacrifice'],
    steps: [
      {
        move: 'b2b8',
        reply: 'a8b8',
        note: 'The rook cannot be declined — capturing is Black’s only legal move.',
      },
      { move: 'b1b8' },
    ],
    explanation:
      'The back rank is already fatal; the only thing holding it together is the rook on a8. ' +
      'Rb8+ offers a rook to remove that defender, and Black has no choice — every king move ' +
      'runs into the rook and there is nothing to interpose. After Rxb8, the second rook ' +
      'recaptures and mates. Doubling the rooks first is what makes the sacrifice work.',
    source: 'Composed for GameExplorer',
  },
];
