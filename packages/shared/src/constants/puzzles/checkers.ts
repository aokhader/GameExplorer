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
    position: 'W:W26,27:B7,14,22,23',
    playerColor: 'white',
    goal: 'best-move',
    prompt: 'White must capture. Two jumps are on offer — take the right one.',
    difficulty: 'medium',
    rating: 1100,
    themes: ['double-jump', 'promotion'],
    steps: [{ move: 'd2f8' }],
    explanation:
      'Captures are compulsory, so the only question is which one. The eye-catching jump is ' +
      'f2–d4–b6, taking two pieces and stopping there. The d2 man instead runs b4–d6–f8: ' +
      'three pieces, and it finishes on the back row and crowns. Follow every jump chain to ' +
      'its end before choosing between them.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-002',
    game: 'checkers',
    position: 'W:W26,27,32:B18,19',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. Give something up first.',
    difficulty: 'medium',
    rating: 1250,
    themes: ['shot', 'sacrifice', 'double-jump'],
    steps: [
      {
        move: 'f2e3',
        reply: 'd4f2',
        note: 'Captures are compulsory, so Black has exactly one legal reply.',
      },
      { move: 'g1g5' },
    ],
    explanation:
      'A shot. The quiet move f2–e3 hangs a man where Black is compelled to take it, and the ' +
      'capture drags the black man from d4 onto f2 — straight into the line of the g1 man, ' +
      'which jumps it and carries on over f4 to g5. Two pieces back for one, and Black has ' +
      'nothing left on the board.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-003',
    game: 'checkers',
    position: 'W:W19,25,32:B14,15,22',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White has to jump, and there are two ways to do it. One of them wins.',
    difficulty: 'medium',
    rating: 1350,
    themes: ['double-jump', 'shot'],
    steps: [
      {
        move: 'b2b6',
        reply: 'e5g3',
        note: 'Black jumps back over f4 — captures are compulsory for both sides.',
      },
      { move: 'b6a7', reply: 'g3f2' },
      { move: 'g1e3' },
    ],
    explanation:
      'Both chains start b2–d4. From there the jump can turn onto e5 and finish at f6, or ' +
      'carry on over c5 to b6 — two men either way, so material does not choose for you. ' +
      'Take the c5 man: the survivor on e5 jumps back to g3 and then has nowhere to go but ' +
      'f2, where the g1 man is waiting. Ending a chain in the wrong corner is how a won ' +
      'checkers endgame gets drawn.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-004',
    game: 'checkers',
    position: 'W:W16,27,31:B7,18,19',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. Something has to be given up.',
    difficulty: 'hard',
    rating: 1450,
    themes: ['shot', 'sacrifice', 'double-jump'],
    steps: [
      {
        move: 'f2e3',
        reply: 'f4d2',
        note: 'Either black man may take it, and either one loses the same way.',
      },
      { move: 'e1e5', reply: 'e7d6' },
      { move: 'e5c7' },
    ],
    explanation:
      'The classic two-for-one. f2–e3 puts a man between two black men, and since captures ' +
      'are compulsory one of them has to take it — which lands it on d2 or f2, right in front ' +
      'of the man on e1. The recapture is a double jump, c3 and then e5, and White comes out ' +
      'a man up with the last black piece cut off. Offering a man to force where the enemy ' +
      'lands is the whole art of the shot.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-005',
    game: 'checkers',
    position: 'W:W13,27:B5,15',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Two men each. White to play and win.',
    difficulty: 'medium',
    rating: 1200,
    themes: ['trapped-piece', 'endgame'],
    steps: [
      {
        move: 'f2e3',
        reply: 'e5d4',
        note: 'f4 loses the man the same way — both of its squares are covered.',
      },
      { move: 'e3c5', reply: 'a7b6' },
      { move: 'c5a7' },
    ],
    explanation:
      'Nothing is attacked yet, so this is about squares rather than captures. f2–e3 covers ' +
      'both f4 and d4 — the only two squares the black man on e5 can reach — while the man on ' +
      'a5 already covers b6, the only square open to a7. Black is left with three legal moves ' +
      'and all three walk into a jump. Count the enemy’s squares, not his men.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-006',
    game: 'checkers',
    position: 'W:W18,27:B5,19',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Two men each. White to play and win.',
    difficulty: 'medium',
    rating: 1250,
    themes: ['endgame', 'trapped-piece'],
    steps: [
      { move: 'd4c5', reply: 'f4e3' },
      { move: 'f2d4', reply: 'a7b6' },
      { move: 'c5a7' },
    ],
    explanation:
      'd4–c5 does two things at once: it steps out of reach of the man on f4 and takes b6 ' +
      'away from the man on a7, which is the only square that man has. Black is reduced to ' +
      'shuffling the f4 man, and e3 runs straight into the jump from f2. Moving a man ' +
      'forward to take away a square is worth more here than any attack.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-007',
    game: 'checkers',
    position: 'W:W14,24:B5,11',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win a man — quietly.',
    difficulty: 'easy',
    rating: 950,
    themes: ['fork', 'endgame'],
    steps: [
      {
        move: 'g3f4',
        reply: 'f6e5',
        note: 'g5 is no better — the same man on f4 jumps either way.',
      },
      { move: 'f4d6', reply: 'a7b6' },
      { move: 'c5a7' },
    ],
    explanation:
      'A man on f4 attacks nothing, but it stands in front of both squares the black man on ' +
      'f6 could use — g5 and e5 — so whichever it picks, it is jumped. Meanwhile c5 covers ' +
      'b6, the only move the a7 man has. Every legal black move loses a piece, and that is a ' +
      'fork without a single capture on the board.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-008',
    game: 'checkers',
    position: 'W:W18,31:B5,23',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win a man — quietly.',
    difficulty: 'easy',
    rating: 1000,
    themes: ['fork', 'endgame'],
    steps: [
      { move: 'd4c5', reply: 'e3d2', note: 'f2 is covered by the same man on e1.' },
      { move: 'e1c3', reply: 'a7b6' },
      { move: 'c5a7' },
    ],
    explanation:
      'The man on e1 already covers f2 and d2 — both squares the black man on e3 can move to ' +
      '— so that man is lost as soon as it has to move. d4–c5 handles the other one by taking ' +
      'b6 away from a7. Black is in what checkers players call a squeeze: every move is a ' +
      'losing move, and no capture was needed to arrange it.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-009',
    game: 'checkers',
    position: 'W:W7,18:B4,10',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. Start with the obvious move.',
    difficulty: 'medium',
    rating: 1150,
    themes: ['promotion', 'endgame'],
    steps: [
      { move: 'e7f8', reply: 'd6c5', note: 'The new king now covers g7, the h8 man’s only square.' },
      { move: 'd4b6', reply: 'h8g7' },
      { move: 'f8h6' },
    ],
    explanation:
      'Crown first. The man on e7 walks in to f8, and the king it becomes covers g7 — which ' +
      'happens to be the only square the black man buried in the h8 corner can move to. The ' +
      'other black man runs into the d4 man, and then the corner man has to step out and be ' +
      'taken. A king is worth the tempo it costs almost every time.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-010',
    game: 'checkers',
    position: 'W:WK17,30:B13,21',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White has the king. Use it without giving it away.',
    difficulty: 'medium',
    rating: 1300,
    themes: ['endgame', 'trapped-piece'],
    steps: [
      { move: 'b4c3', reply: 'a3b2' },
      { move: 'c1a3', reply: 'a5b4' },
      { move: 'c3a5' },
    ],
    explanation:
      'Two black men are stuck on the h-file, where each has exactly one square to move to. ' +
      'The king steps back to c3, and now b2 is covered by the man on c1 and b4 is covered by ' +
      'the king itself. Neither black man can move without being jumped, and there is nothing ' +
      'else on the board to move instead. The edge of the board does most of the work.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-011',
    game: 'checkers',
    position: 'W:W18,19,K32:B7,12,28',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'White to play and win. One black man is already out of the game.',
    difficulty: 'hard',
    rating: 1400,
    themes: ['trapped-piece', 'endgame'],
    steps: [
      { move: 'd4e5', reply: 'h6g5' },
      { move: 'f4h6', reply: 'e7d6' },
      { move: 'e5c7' },
    ],
    explanation:
      'Look at h2 before anything else: it is on the edge, so its only move is g1 — and the ' +
      'white king is sitting on g1. That man will never move again, which means Black is ' +
      'effectively playing two against three. Pick off the other two and the game ends with ' +
      'pieces still on the board, because a player with no legal move has lost.',
    source: 'Composed for GameExplorer',
  },
  {
    id: 'checkers-012',
    game: 'checkers',
    position: 'W:W13,15:B4,5',
    playerColor: 'white',
    goal: 'win-game',
    prompt: 'Both black men are on the edge. White to play and win.',
    difficulty: 'medium',
    rating: 1350,
    themes: ['trapped-piece', 'promotion', 'endgame'],
    steps: [
      { move: 'e5f6', reply: 'a7b6' },
      { move: 'a5c7', reply: 'h8g7' },
      { move: 'f6h8' },
    ],
    explanation:
      'A man in a corner has one move, and both black men are in one. f6 covers g7, the only ' +
      'square open to h8; a5 already covers b6, the only square open to a7. Black has to ' +
      'unstack one of them, and whichever goes first is jumped — the second follows, and the ' +
      'jump that takes it lands on h8 and crowns.',
    source: 'Composed for GameExplorer',
  },
];
