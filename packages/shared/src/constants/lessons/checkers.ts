/**
 * Checkers lessons — pure data, proved by `lessons.test.ts`.
 *
 * Positions are the PDN FEN tag body `Puzzle.position` already uses, with the
 * 1–32 dark-square numbers; moves are algebraic (`c2d3`), and a multi-jump
 * spells out every landing square (`c2e4c6`).
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
          { square: 'b3', kind: 'move' },
          { square: 'd3', kind: 'move' },
          { square: 'f3', kind: 'move' },
        ],
      },
      {
        id: 'to-d3',
        instruction: 'Move a piece to d3. Either of yours can reach it.',
        expect: { kind: 'any', match: { piece: 'man', toAnyOf: ['d3'] } },
        success: 'Two pieces could reach that square, which is worth noticing — it is what makes a square defensible.',
        reply: 'c6b5',
        misses: [
          {
            when: ['c2b3', 'e2f3'],
            say: 'A legal move, but it goes to the edge. The step asked for d3, in the middle.',
          },
          { say: 'Both c2 and e2 touch d3 diagonally. Move either one there.' },
        ],
        marks: [{ square: 'd3', kind: 'target' }],
      },
      {
        id: 'safe',
        instruction:
          'Black came to b5. Advance your d3 man — but only to a square where it cannot be jumped.',
        expect: { kind: 'move', moves: ['d3e4'] },
        success:
          'e4 is out of reach. Before every move, look at what stands diagonally in front of you and what is behind that.',
        hint: 'One of the two squares in front of d3 is next to the black man.',
        misses: [
          {
            when: ['d3c4'],
            say: 'c4 puts your man right in front of the black man on b5, with an empty square behind it — so black jumps, and in checkers a jump that exists must be taken.',
          },
          { say: 'The d3 man can go to c4 or e4. One of those two is safe.' },
        ],
        marks: [
          { square: 'c4', kind: 'danger' },
          { square: 'e4', kind: 'move' },
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
    position: 'W:W26:B10,22',
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
          { square: 'd3', kind: 'capture' },
          { square: 'e4', kind: 'move' },
        ],
      },
      {
        id: 'jump',
        instruction: 'Jump the black man on d3.',
        expect: { kind: 'move', moves: ['c2e4'] },
        success: 'One piece up. Notice you were never offered anything else to play.',
        reply: 'c6d5',
        misses: [
          {
            say: 'b3 looks like a normal move, and normally it would be — but a jump is on the board, so the rules do not allow anything else. Drag from c2 to e4.',
          },
        ],
      },
      {
        id: 'again',
        instruction: 'Black stepped to d5, straight in front of you again. Take it.',
        expect: { kind: 'move', moves: ['e4c6'] },
        success:
          'And that is the game — black has no pieces left. A player with nothing to move has lost.',
        misses: [{ say: 'Hop from e4 over d5 and land on c6.' }],
        marks: [{ square: 'd5', kind: 'capture' }],
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
    position: 'W:W26:B8,14,22',
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
          { square: 'd3', kind: 'capture' },
          { square: 'd5', kind: 'capture' },
          { square: 'c6', kind: 'target' },
        ],
      },
      {
        id: 'chain',
        instruction:
          'Jump d3, then carry straight on over d5. Drag from c2 all the way to c6 — the board resolves the chain for you.',
        expect: { kind: 'move', moves: ['c2e4c6'] },
        success:
          'Two pieces off the board in one move. That is why a piece sitting on a diagonal with gaps behind it is so dangerous.',
        hint: 'The landing square is c6.',
        misses: [
          {
            say: 'Stopping halfway is not allowed once a second jump exists. Drop the piece on c6 and the whole chain plays.',
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
    position: 'W:W6:B24',
    learnerColor: 'white',
    teaches: 'kings',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'promote',
        instruction:
          'Your man is one square from the far row. Move it there and it is crowned — and your turn ends immediately, even if a jump looks available from the new square.',
        expect: { kind: 'move', moves: ['d7c8', 'd7e8'] },
        success: 'Crowned. A king moves and jumps diagonally in all four directions.',
        misses: [{ say: 'Both c8 and e8 crown the man. Take either.' }],
        marks: [
          { square: 'c8', kind: 'target' },
          { square: 'e8', kind: 'target' },
        ],
      },
      {
        id: 'backwards',
        position: 'W:WK3,26:B28',
        instruction:
          'Here is the difference that matters. You have a king on e8 and a man on c2. Move the king — backwards, down the board, which no man can do.',
        expect: { kind: 'any', match: { piece: 'king' } },
        success:
          'Backwards. A king is worth roughly two men for exactly this reason: it can chase, and it can defend behind itself.',
        misses: [
          {
            match: { piece: 'man' },
            say: 'That is your man on c2, and it can only go forward. The king is the crowned piece on e8.',
          },
          { say: 'The king is on e8. Move it to d7 or f7 — towards your own side of the board.' },
        ],
        marks: [
          { square: 'd7', kind: 'move' },
          { square: 'f7', kind: 'move' },
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
    position: 'W:W23,26,29:B14,15',
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
          { square: 'e4', kind: 'target' },
          { square: 'd5', kind: 'danger' },
          { square: 'f5', kind: 'danger' },
        ],
      },
      {
        id: 'offer',
        instruction: 'Push your f3 man to e4, where both black men can take it.',
        expect: { kind: 'move', moves: ['f3e4'] },
        success:
          'Black must jump — the rules leave no alternative — and whichever way black takes, the piece ends up on your third row.',
        reply: 'f5d3',
        hint: 'Give a piece away, on purpose.',
        misses: [
          {
            when: ['c2d3', 'c2b3', 'b1a2'],
            say: 'Safe and pointless. The shot only works if you actually offer the piece.',
          },
          {
            when: ['f3g4'],
            say: 'The edge is the one square black cannot reach. Offer the man where it can be taken.',
          },
          { say: 'Move the f3 man diagonally to e4, into the fire.' },
        ],
      },
      {
        id: 'collect',
        instruction:
          'Black took, and landed on d3 — right in front of your c2 man, with an empty square behind it. Jump, and keep jumping.',
        expect: { kind: 'move', moves: ['c2e4c6'] },
        success:
          'One man given, two taken, and black has nothing left. That is a shot: the sacrifice was the move that forced everything after it.',
        hint: 'Land on c6.',
        misses: [
          {
            say: 'The chain runs c2 over d3 to e4, then over d5 to c6. Drop the piece on c6 and the whole thing plays as one move.',
          },
        ],
        marks: [
          { square: 'd3', kind: 'capture' },
          { square: 'd5', kind: 'capture' },
        ],
      },
    ],
    outro:
      'Shots are the heart of checkers. Whenever you see two enemy pieces on a diagonal with a gap behind them, look for the man you can give away.',
  },
];
