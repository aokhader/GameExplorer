/**
 * Checkers lessons — pure data, proved by `lessons.test.ts`.
 *
 * Positions are the PDN FEN tag body `Puzzle.position` already uses, with the
 * 1–32 dark-square numbers; moves are algebraic (`f2e3`), and a multi-jump
 * spells out every landing square (`f2d4f6`).
 *
 * Almost every step here is `kind: 'move'` rather than `kind: 'any'`, and that
 * is the forced-capture rule showing through rather than a stylistic choice:
 * whenever a jump exists it is the *only* legal move, so an "any move that
 * captures" step would accept the entire legal move list — which the content
 * gate rightly calls a Continue button wearing a board.
 */

import type { Lesson } from '../../lessons/types';

export const CHECKERS_LESSONS: Lesson[] = [
  {
    id: 'checkers-l01',
    game: 'checkers',
    title: 'Moving',
    summary: 'One square, diagonally, forwards only.',
    position: 'W:W26,27:B10,11',
    learnerColor: 'white',
    teaches: 'moving',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'Play happens only on the dark squares. A man moves one square diagonally forward — never sideways, never straight, and never backwards.',
        expect: { kind: 'read' },
        marks: [
          { square: 'g3', kind: 'move' },
          { square: 'e3', kind: 'move' },
          { square: 'c3', kind: 'move' },
        ],
      },
      {
        id: 'to-e3',
        instruction: 'Move a piece to e3. Either of yours can reach it.',
        expect: { kind: 'any', match: { piece: 'man', toAnyOf: ['e3'] } },
        success: 'Two pieces could reach that square, which is worth noticing — it is what makes a square defensible.',
        reply: 'f6g5',
        misses: [
          {
            when: ['f2g3', 'd2c3'],
            say: 'A legal move, but it goes to the edge. The step asked for e3, in the middle.',
          },
          { say: 'Both f2 and d2 touch e3 diagonally. Move either one there.' },
        ],
        marks: [{ square: 'e3', kind: 'target' }],
      },
      {
        id: 'safe',
        instruction:
          'Black came to g5. Advance your e3 man — but only to a square where it cannot be jumped.',
        expect: { kind: 'move', moves: ['e3d4'] },
        success:
          'd4 is out of reach. Before every move, look at what stands diagonally in front of you and what is behind that.',
        hint: 'One of the two squares in front of e3 is next to the black man.',
        misses: [
          {
            when: ['e3f4'],
            say: 'f4 puts your man right in front of the black man on g5, with an empty square behind it — so black jumps, and in checkers a jump that exists must be taken.',
          },
          { say: 'The e3 man can go to f4 or d4. One of those two is safe.' },
        ],
        marks: [
          { square: 'f4', kind: 'danger' },
          { square: 'd4', kind: 'move' },
        ],
      },
    ],
    outro:
      'That is the whole movement rule. The next lesson is about the one move that is not optional.',
  },

  {
    id: 'checkers-l02',
    game: 'checkers',
    title: 'The jump, and why it is compulsory',
    summary: 'If you can capture, you must.',
    position: 'W:W27:B11,23',
    learnerColor: 'white',
    teaches: 'jumping',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'To capture, hop diagonally over an enemy piece onto the empty square directly beyond it. The piece you jumped comes off the board. And if any jump is available to you, it is your only legal move — quiet moves are simply not allowed.',
        expect: { kind: 'read' },
        marks: [
          { square: 'e3', kind: 'capture' },
          { square: 'd4', kind: 'move' },
        ],
      },
      {
        id: 'jump',
        instruction: 'Jump the black man on e3.',
        expect: { kind: 'move', moves: ['f2d4'] },
        success: 'One piece up. Notice you were never offered anything else to play.',
        reply: 'f6e5',
        misses: [
          {
            say: 'g3 looks like a normal move, and normally it would be — but a jump is on the board, so the rules do not allow anything else. Drag from f2 to d4.',
          },
        ],
      },
      {
        id: 'again',
        instruction: 'Black stepped to e5, straight in front of you again. Take it.',
        expect: { kind: 'move', moves: ['d4f6'] },
        success:
          'And that is the game — black has no pieces left. A player with nothing to move has lost.',
        misses: [{ say: 'Hop from d4 over e5 and land on f6.' }],
        marks: [{ square: 'e5', kind: 'capture' }],
      },
    ],
    outro:
      'Compulsory capture is what makes checkers tactical. Offering a piece is not a blunder — it is a way of choosing your opponent’s move for them.',
  },

  {
    id: 'checkers-l03',
    game: 'checkers',
    title: 'Multi-jump chains',
    summary: 'One jump that keeps going is still one move.',
    position: 'W:W27:B5,15,23',
    learnerColor: 'white',
    teaches: 'multi-jumps',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'If your piece can jump again from where it lands, it must — and the whole chain counts as a single move. Every piece jumped comes off, and nothing gets a turn in between.',
        expect: { kind: 'read' },
        marks: [
          { square: 'e3', kind: 'capture' },
          { square: 'e5', kind: 'capture' },
          { square: 'f6', kind: 'target' },
        ],
      },
      {
        id: 'chain',
        instruction:
          'Jump e3, then carry straight on over e5. Drag from f2 all the way to f6 — the board resolves the chain for you.',
        expect: { kind: 'move', moves: ['f2d4f6'] },
        success:
          'Two pieces off the board in one move. That is why a piece sitting on a diagonal with gaps behind it is so dangerous.',
        hint: 'The landing square is f6.',
        misses: [
          {
            say: 'Stopping halfway is not allowed once a second jump exists. Drop the piece on f6 and the whole chain plays.',
          },
        ],
      },
    ],
    outro:
      'Chains are how a checkers game turns over in one move. Count them both ways before you commit.',
  },

  {
    id: 'checkers-l04',
    game: 'checkers',
    title: 'Crowning',
    summary: 'Reach the far row and your man becomes a king.',
    position: 'W:W7:B21',
    learnerColor: 'white',
    teaches: 'kings',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'promote',
        instruction:
          'Your man is one square from the far row. Move it there and it is crowned — and your turn ends immediately, even if a jump looks available from the new square.',
        expect: { kind: 'move', moves: ['e7f8', 'e7d8'] },
        success: 'Crowned. A king moves and jumps diagonally in all four directions.',
        misses: [{ say: 'Both f8 and d8 crown the man. Take either.' }],
        marks: [
          { square: 'f8', kind: 'target' },
          { square: 'd8', kind: 'target' },
        ],
      },
      {
        id: 'backwards',
        position: 'W:WK2,27:B25',
        instruction:
          'Here is the difference that matters. You have a king on d8 and a man on f2. Move the king — backwards, down the board, which no man can do.',
        expect: { kind: 'any', match: { piece: 'king' } },
        success:
          'Backwards. A king is worth roughly two men for exactly this reason: it can chase, and it can defend behind itself.',
        misses: [
          {
            match: { piece: 'man' },
            say: 'That is your man on f2, and it can only go forward. The king is the crowned piece on d8.',
          },
          { say: 'The king is on d8. Move it to e7 or c7 — towards your own side of the board.' },
        ],
        marks: [
          { square: 'e7', kind: 'move' },
          { square: 'c7', kind: 'move' },
        ],
      },
    ],
    outro:
      'Getting the first king is often the whole game. Everything before it is a race for the back row.',
  },

  {
    id: 'checkers-l05',
    game: 'checkers',
    title: 'Your first shot',
    summary: 'Give one piece away, take two back.',
    position: 'W:W22,27,32:B14,15',
    learnerColor: 'white',
    teaches: 'endings',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'idea',
        instruction:
          'A shot is a sacrifice built on the compulsory-capture rule. You offer a piece; your opponent has no choice but to take it; and the piece they take with lands somewhere you can jump through.',
        expect: { kind: 'read' },
        marks: [
          { square: 'd4', kind: 'target' },
          { square: 'e5', kind: 'danger' },
          { square: 'c5', kind: 'danger' },
        ],
      },
      {
        id: 'offer',
        instruction: 'Push your c3 man to d4, where both black men can take it.',
        expect: { kind: 'move', moves: ['c3d4'] },
        success:
          'Black must jump — the rules leave no alternative — and whichever way black takes, the piece ends up on your third row.',
        reply: 'c5e3',
        hint: 'Give a piece away, on purpose.',
        misses: [
          {
            when: ['f2e3', 'f2g3', 'g1h2'],
            say: 'Safe and pointless. The shot only works if you actually offer the piece.',
          },
          {
            when: ['c3b4'],
            say: 'The edge is the one square black cannot reach. Offer the man where it can be taken.',
          },
          { say: 'Move the c3 man diagonally to d4, into the fire.' },
        ],
      },
      {
        id: 'collect',
        instruction:
          'Black took, and landed on e3 — right in front of your f2 man, with an empty square behind it. Jump, and keep jumping.',
        expect: { kind: 'move', moves: ['f2d4f6'] },
        success:
          'One man given, two taken, and black has nothing left. That is a shot: the sacrifice was the move that forced everything after it.',
        hint: 'Land on f6.',
        misses: [
          {
            say: 'The chain runs f2 over e3 to d4, then over e5 to f6. Drop the piece on f6 and the whole thing plays as one move.',
          },
        ],
        marks: [
          { square: 'e3', kind: 'capture' },
          { square: 'e5', kind: 'capture' },
        ],
      },
    ],
    outro:
      'Shots are the heart of checkers. Whenever you see two enemy pieces on a diagonal with a gap behind them, look for the man you can give away.',
  },
];
