import type { Puzzle } from '../../puzzles/types';

/**
 * Endgames with a handful of empty squares left, because that is the part of
 * reversi a player can actually calculate — and the part where the rules of
 * thumb ("always take the corner") start being wrong.
 *
 * Every key move here is the analyzer's own choice at depth 6, checked by
 * `puzzles.test.ts`; several of these positions have three or four legal moves
 * where exactly one wins, which is what makes them worth solving.
 */
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
  {
    id: 'reversi-003',
    game: 'reversi',
    position: 'OXX.XXO./.X.XXX.O/OXXXXXOX/OOOOOOXX/OXOXOOOX/OOXOXOXX/OOOXXXXX/OXXXXXXX w',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Five squares left and four ways to play. Only one of them wins.',
    difficulty: 'medium',
    rating: 1250,
    themes: ['parity', 'x-square', 'endgame'],
    steps: [
      { move: 'd8', reply: 'c7', note: 'a7 and c7 both lose; g7, the x-square, only draws.' },
      { move: 'a7', reply: 'g7' },
      { move: 'h8' },
    ],
    explanation:
      'The move that wins is the one that leaves h8 for last. d8 turns six discs and, more ' +
      'importantly, does not touch the corner or the square next to it — so when the dust ' +
      'settles White is still the one who gets to take h8, and takes five discs with it. ' +
      'Playing g7 first, the square beside the corner, is what hands that corner over.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-004',
    game: 'reversi',
    position: 'OOOOOO../OOOOXOOO/OXOOXXXX/OOOXOOOO/OOOXOO.O/OXXXOOOO/XXXOOOOO/XXO.OOXO b',
    playerColor: 'black',
    goal: 'win-game',
    prompt: 'Four squares left, and one of them is a corner. Black to play and win.',
    difficulty: 'medium',
    rating: 1350,
    themes: ['corner', 'parity', 'forced-pass', 'endgame'],
    steps: [
      { move: 'd1', note: 'Taking h8 here loses. So does g4, and so does g8.' },
      { move: 'g4', note: 'White has no legal move and passes — Black is on move again.' },
      { move: 'h8' },
      { move: 'g8' },
    ],
    explanation:
      'The corner is the losing move. Take h8 now and White has an answer; play the quiet d1 ' +
      'first and White has no legal move at all, so the pass hands the turn straight back and ' +
      'Black plays every one of the last four squares — including the corner, at leisure. ' +
      'When the board is nearly full, having a move matters more than what the move takes.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-005',
    game: 'reversi',
    position: 'OOOXXOXX/OOOXXOXX/O.OOXXXX/OOOOOOXX/OXOXXOXX/OXOOOOXX/OXXOO.X./OX.XXXXO b',
    playerColor: 'black',
    goal: 'win-game',
    prompt: 'Three legal moves, four empty squares. Black to play and win.',
    difficulty: 'easy',
    rating: 1050,
    themes: ['parity', 'endgame'],
    steps: [
      { move: 'c1', reply: 'f2', note: 'The other two moves both lose.' },
      { move: 'b6', reply: 'h2' },
    ],
    explanation:
      'c1 flips only three discs and b6 flips eight, so the greedy order is the wrong one: ' +
      'played first, c1 keeps b6 available for later, and the eight-disc flip lands at the ' +
      'end of the game where nothing can be turned back. Reversi counts discs once, at the ' +
      'end — what you flip early is only on loan.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-006',
    game: 'reversi',
    position: 'XXXXXXXO/OOOOOXXO/..XXXOXO/OXXXOOXO/OOXOXXOO/O.OXXOXO/.OXX.XXX/O.X.XXXO w',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Seven squares left. Two of White’s four moves look identical — one wins.',
    difficulty: 'hard',
    rating: 1450,
    themes: ['parity', 'endgame'],
    steps: [
      { move: 'd1', reply: 'a2', note: 'b1 is the near-miss: strong, but it does not win.' },
      { move: 'b3', reply: 'b1' },
      { move: 'e2', reply: 'a6' },
      { move: 'b6' },
    ],
    explanation:
      'b1 and d1 are both edge squares on the same rank and both look like the move. d1 wins ' +
      'and b1 does not, because d1 leaves the b-file empty for later and b1 spends it now. ' +
      'Seven squares is far enough out that counting flips will not tell you which — the ' +
      'thing to count is who runs out of moves first.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-007',
    game: 'reversi',
    position: 'X.XXXOX./XXOXOOOX/XXXOXOXO/XOXOOXXO/XXXXXXXO/XXXOO.XO/XXXXXXXO/X.OOOOO. w',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play. Four moves, and this time the corner really is the one.',
    difficulty: 'medium',
    rating: 1150,
    themes: ['corner', 'forced-pass', 'endgame'],
    steps: [
      { move: 'h8', reply: 'f3', note: 'b1, b8 and f3 all lose from here.' },
      { move: 'b8', note: 'Black has nothing to play and passes.' },
      { move: 'h1' },
      { move: 'b1' },
    ],
    explanation:
      'The mirror of the corner trap: here h8 is not just safe, it is the only move that ' +
      'wins. Taking it first anchors the bottom edge, and after Black’s one reply the ' +
      'position collapses — Black has no legal move again and again while White walks around ' +
      'the outside taking b8, h1 and b1. A corner is worth having when it comes with the ' +
      'edges attached.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-008',
    game: 'reversi',
    position: 'OOOOOXX./OOOOOOXO/OXXOOXOO/OXXOXOOO/.XXXOXO./XOXXXOOO/OOOOXXO./.OOO.X.O w',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win — and be ready to let Black have a corner.',
    difficulty: 'hard',
    rating: 1550,
    themes: ['corner', 'parity', 'endgame'],
    steps: [
      { move: 'e1', reply: 'a1', note: 'Black takes the corner, and it does not help.' },
      { move: 'a4', reply: 'g1' },
      { move: 'h2', reply: 'h4' },
      { move: 'h8' },
    ],
    explanation:
      'e1 wins; grabbing h8 immediately does not. Black answers by taking the a1 corner and ' +
      'it changes nothing — six discs now, and White finishes 42–22 anyway, because the ' +
      'a-file and the h-file were the real prize and e1 is what kept them. Corners are worth ' +
      'a great deal, but they are not worth the game on their own.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-009',
    game: 'reversi',
    position: '.XOO.OOO/XOOXXXXX/OOOX.XXX/OOOOXOXX/.O.XOOXX/XOXXXOXO/.XOOOXXO/XXXXXXXO b',
    playerColor: 'black',
    goal: 'win-game',
    prompt: 'Black to play. One of the four moves wins, one draws, two lose.',
    difficulty: 'medium',
    rating: 1200,
    themes: ['corner', 'endgame', 'parity'],
    steps: [
      { move: 'a8', reply: 'a2', note: 'e8 only draws; a4 and e6 lose.' },
      { move: 'a4', reply: 'c4' },
      { move: 'e6', reply: 'e8' },
    ],
    explanation:
      'a8 first, and the a-file behind it does the rest — the same two moves, a4 and e6, that ' +
      'lose when played immediately are winners once the corner is anchored. Order is almost ' +
      'everything in a reversi ending: the moves are usually the same ones, and only the ' +
      'sequence separates 38–26 from a loss.',
    source: 'Position from a played-out game',
  },
  {
    id: 'reversi-010',
    game: 'reversi',
    position: 'OX..O.X./XXXOOX../XXOXXOOO/XXOXXOO./XXXXXOOO/XXXXOOXO/XXOOXXOO/XOOOOOOO w',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Three legal moves and seven empty squares. White to play and win.',
    difficulty: 'hard',
    rating: 1400,
    themes: ['parity', 'x-square', 'endgame'],
    steps: [
      { move: 'f8', reply: 'd8', note: 'g7 is the x-square and c8 loses too — f8 is the only one.' },
      { move: 'c8', reply: 'h5' },
      { move: 'h8', reply: 'g7' },
      { move: 'h7' },
    ],
    explanation:
      'f8 turns a single disc, which is exactly why it works: it takes a square on the bottom ' +
      'edge without opening anything for Black, and it keeps h8 in reserve. The corner falls ' +
      'two moves later, Black is reduced to the x-square beside it, and h7 collects the ' +
      'edge. The smallest-looking move in a reversi ending is very often the right one.',
    source: 'Position from a played-out game',
  },
];
