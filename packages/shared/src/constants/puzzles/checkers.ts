import type { Puzzle } from '../../puzzles/types';

/**
 * Endgames, mostly two or three men a side, because that is where checkers
 * tactics are legible: with captures compulsory, a single tempo decides who
 * runs out of squares first.
 *
 * `puzzles.test.ts` holds every one of these to the engine's own choice at
 * depth 6 — if a position ever stops being a win, or a different move becomes
 * better, the build says so instead of a player discovering it.
 */
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
    source: 'Composed for Finesse',
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
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-003',
    game: 'checkers',
    position: 'W:W18,28,29:B14,15,23',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White has to jump, and there are two ways to do it. One of them wins.',
    difficulty: 'medium',
    rating: 1350,
    themes: ['double-jump', 'shot'],
    steps: [
      {
        move: 'g2g6',
        reply: 'd5b3',
        note: 'Black jumps back over c4 — captures are compulsory for both sides.',
      },
      { move: 'g6h7', reply: 'b3c2' },
      { move: 'b1d3' },
    ],
    explanation:
      'Both chains start g2–e4. From there the jump can turn onto d5 and finish at c6, or ' +
      'carry on over f5 to g6 — two men either way, so material does not choose for you. ' +
      'Take the f5 man: the survivor on d5 jumps back to b3 and then has nowhere to go but ' +
      'c2, where the b1 man is waiting. Ending a chain in the wrong corner is how a won ' +
      'checkers endgame gets drawn.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-004',
    game: 'checkers',
    position: 'W:W13,26,30:B6,18,19',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. Something has to be given up.',
    difficulty: 'hard',
    rating: 1450,
    themes: ['shot', 'sacrifice', 'double-jump'],
    steps: [
      {
        move: 'c2d3',
        reply: 'c4e2',
        note: 'Either black man may take it, and either one loses the same way.',
      },
      { move: 'd1d5', reply: 'd7e6' },
      { move: 'd5f7' },
    ],
    explanation:
      'The classic two-for-one. c2–d3 puts a man between two black men, and since captures ' +
      'are compulsory one of them has to take it — which lands it on e2 or c2, right in front ' +
      'of the man on d1. The recapture is a double jump, f3 and then d5, and White comes out ' +
      'a man up with the last black piece cut off. Offering a man to force where the enemy ' +
      'lands is the whole art of the shot.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-005',
    game: 'checkers',
    position: 'W:W16,26:B8,14',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Two men each. White to play and win.',
    difficulty: 'medium',
    rating: 1200,
    themes: ['trapped-piece', 'endgame'],
    steps: [
      {
        move: 'c2d3',
        reply: 'd5e4',
        note: 'c4 loses the man the same way — both of its squares are covered.',
      },
      { move: 'd3f5', reply: 'h7g6' },
      { move: 'f5h7' },
    ],
    explanation:
      'Nothing is attacked yet, so this is about squares rather than captures. c2–d3 covers ' +
      'both c4 and e4 — the only two squares the black man on d5 can reach — while the man on ' +
      'h5 already covers g6, the only square open to h7. Black is left with three legal moves ' +
      'and all three walk into a jump. Count the enemy’s squares, not his men.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-006',
    game: 'checkers',
    position: 'W:W19,26:B8,18',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Two men each. White to play and win.',
    difficulty: 'medium',
    rating: 1250,
    themes: ['endgame', 'trapped-piece'],
    steps: [
      { move: 'e4f5', reply: 'c4d3' },
      { move: 'c2e4', reply: 'h7g6' },
      { move: 'f5h7' },
    ],
    explanation:
      'e4–f5 does two things at once: it steps out of reach of the man on c4 and takes g6 ' +
      'away from the man on h7, which is the only square that man has. Black is reduced to ' +
      'shuffling the c4 man, and d3 runs straight into the jump from c2. Moving a man ' +
      'forward to take away a square is worth more here than any attack.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-007',
    game: 'checkers',
    position: 'W:W15,21:B8,10',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win a man — quietly.',
    difficulty: 'easy',
    rating: 950,
    themes: ['fork', 'endgame'],
    steps: [
      {
        move: 'b3c4',
        reply: 'c6d5',
        note: 'b5 is no better — the same man on c4 jumps either way.',
      },
      { move: 'c4e6', reply: 'h7g6' },
      { move: 'f5h7' },
    ],
    explanation:
      'A man on c4 attacks nothing, but it stands in front of both squares the black man on ' +
      'c6 could use — b5 and d5 — so whichever it picks, it is jumped. Meanwhile f5 covers ' +
      'g6, the only move the h7 man has. Every legal black move loses a piece, and that is a ' +
      'fork without a single capture on the board.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-008',
    game: 'checkers',
    position: 'W:W19,30:B8,22',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win a man — quietly.',
    difficulty: 'easy',
    rating: 1000,
    themes: ['fork', 'endgame'],
    steps: [
      { move: 'e4f5', reply: 'd3e2', note: 'c2 is covered by the same man on d1.' },
      { move: 'd1f3', reply: 'h7g6' },
      { move: 'f5h7' },
    ],
    explanation:
      'The man on d1 already covers c2 and e2 — both squares the black man on d3 can move to ' +
      '— so that man is lost as soon as it has to move. e4–f5 handles the other one by taking ' +
      'g6 away from h7. Black is in what checkers players call a squeeze: every move is a ' +
      'losing move, and no capture was needed to arrange it.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-009',
    game: 'checkers',
    position: 'W:W6,19:B1,11',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. Start with the obvious move.',
    difficulty: 'medium',
    rating: 1150,
    themes: ['promotion', 'endgame'],
    steps: [
      { move: 'd7c8', reply: 'e6f5', note: 'The new king now covers b7, the a8 man’s only square.' },
      { move: 'e4g6', reply: 'a8b7' },
      { move: 'c8a6' },
    ],
    explanation:
      'Crown first. The man on d7 walks in to c8, and the king it becomes covers b7 — which ' +
      'happens to be the only square the black man buried in the a8 corner can move to. The ' +
      'other black man runs into the e4 man, and then the corner man has to step out and be ' +
      'taken. A king is worth the tempo it costs almost every time.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-010',
    game: 'checkers',
    position: 'W:WK20,31:B16,24',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White has the king. Use it without giving it away.',
    difficulty: 'medium',
    rating: 1300,
    themes: ['endgame', 'trapped-piece'],
    steps: [
      { move: 'g4f3', reply: 'h3g2' },
      { move: 'f1h3', reply: 'h5g4' },
      { move: 'f3h5' },
    ],
    explanation:
      'Two black men are stuck on the h-file, where each has exactly one square to move to. ' +
      'The king steps back to f3, and now g2 is covered by the man on f1 and g4 is covered by ' +
      'the king itself. Neither black man can move without being jumped, and there is nothing ' +
      'else on the board to move instead. The edge of the board does most of the work.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-011',
    game: 'checkers',
    position: 'W:W18,19,K29:B6,9,25',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. One black man is already out of the game.',
    difficulty: 'hard',
    rating: 1400,
    themes: ['trapped-piece', 'endgame'],
    steps: [
      { move: 'e4d5', reply: 'a6b5' },
      { move: 'c4a6', reply: 'd7e6' },
      { move: 'd5f7' },
    ],
    explanation:
      'Look at a2 before anything else: it is on the edge, so its only move is b1 — and the ' +
      'white king is sitting on b1. That man will never move again, which means Black is ' +
      'effectively playing two against three. Pick off the other two and the game ends with ' +
      'pieces still on the board, because a player with no legal move has lost.',
    source: 'Composed for Finesse',
  },
  {
    id: 'checkers-012',
    game: 'checkers',
    position: 'W:W14,16:B1,8',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Both black men are on the edge. White to play and win.',
    difficulty: 'medium',
    rating: 1350,
    themes: ['trapped-piece', 'promotion', 'endgame'],
    steps: [
      { move: 'd5c6', reply: 'h7g6' },
      { move: 'h5f7', reply: 'a8b7' },
      { move: 'c6a8' },
    ],
    explanation:
      'A man in a corner has one move, and both black men are in one. c6 covers b7, the only ' +
      'square open to a8; h5 already covers g6, the only square open to h7. Black has to ' +
      'unstack one of them, and whichever goes first is jumped — the second follows, and the ' +
      'jump that takes it lands on a8 and crowns.',
    source: 'Composed for Finesse',
  },
];
