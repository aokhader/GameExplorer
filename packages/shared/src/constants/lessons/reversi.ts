/**
 * Reversi lessons — pure data, proved by `lessons.test.ts`.
 *
 * Positions are the eight-row board string `Puzzle.position` already uses, rank
 * 8 first, then the side to move.
 *
 * The three late-game positions did not come out of anybody's head: they were
 * lifted from a real game played out by the engine against itself, which is why
 * they look like reversi rather than like a diagram. The forced pass and the
 * three-moves-in-a-row parity finish are both things that actually happened in
 * that game.
 */

import type { Lesson } from '../../lessons/types';

const START = '......../......../......../...XO.../...OX.../......../......../........ b';

export const REVERSI_LESSONS: Lesson[] = [
  {
    id: 'reversi-l01',
    game: 'reversi',
    title: 'Placing a disc, and flipping',
    summary: 'Every legal move traps enemy discs between two of yours.',
    position: START,
    learnerColor: 'black',
    teaches: 'flanking',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'A move is only legal if it traps at least one white disc in a straight line between the disc you place and a black disc you already own. Everything trapped flips to black.',
        expect: { kind: 'read' },
        marks: [
          { square: 'd3', kind: 'move' },
          { square: 'c4', kind: 'move' },
          { square: 'f5', kind: 'move' },
          { square: 'e6', kind: 'move' },
        ],
      },
      {
        id: 'first',
        instruction:
          'Black moves first, and has exactly four legal squares. Play d3 — it traps the white disc on d4 against your own on d5.',
        expect: { kind: 'move', moves: ['d3'] },
        success: 'The white disc on d4 flipped. Black now owns d3, d4 and d5.',
        reply: 'e3',
        hint: 'Below the white disc on d4.',
        misses: [
          {
            when: ['c4', 'f5', 'e6'],
            say: 'Also legal — the four openings are the same shape rotated. Take d3 so we can follow one line.',
          },
          {
            say: 'Only four squares work: d3, c4, f5 and e6. Anywhere else traps nothing, and a move that flips nothing is not a move.',
          },
        ],
      },
      {
        id: 'second',
        instruction:
          'White answered on e3, so the two colours now face each other in columns. Play f4 and take the middle of the board.',
        expect: { kind: 'move', moves: ['f4'] },
        success: 'e4 flips. Notice how quickly the whole board can change hands.',
        misses: [
          {
            when: ['f2', 'f3', 'f5', 'f6'],
            say: 'Also legal — every square on the f-file traps a white disc against your column on d. f4 is the one nearest the centre.',
          },
          { say: 'You need a black disc at the far end of the line. Your column on the d-file is that end — play on the f-file.' },
        ],
      },
    ],
    outro:
      'Discs change colour constantly, and the count at move ten means almost nothing. What matters is which squares you own at the very end.',
  },

  {
    id: 'reversi-l02',
    game: 'reversi',
    title: 'Flipping in several directions',
    summary: 'One disc can flip lines in eight directions at once.',
    position: '.....O../.....O../....OOOX/...OOOX./..OXOO../OOOXXOXX/..OOOO../..OXXO.. b',
    learnerColor: 'black',
    teaches: 'multi-flip',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'A placed disc looks outwards along all eight lines at once, and flips every one of them that ends in a disc of your own. That is why one move can change the board so much.',
        expect: { kind: 'read' },
      },
      {
        id: 'biggest',
        instruction: 'One black move here flips six white discs. Find it.',
        expect: { kind: 'any', match: { captures: 6 } },
        success:
          'Six at once, along more than one line. A single move like that can decide who is ahead on the count — for a while.',
        hint: 'Look at the sixth rank, on the left of the board.',
        misses: [
          {
            when: ['g4', 'e7'],
            say: 'Four discs, which is a lot — but there is a move here that flips six.',
          },
          { say: 'Count the lines a square would flip before you play it. One square here reaches six.' },
        ],
      },
      {
        id: 'caution',
        instruction:
          'Flipping the most discs is rarely the best move, though. Everything you flip can be flipped straight back — and a big flip usually means you have handed the other side new squares to play on.',
        expect: { kind: 'read' },
      },
    ],
    outro: 'Flip count is a fact about a move, not a reason for it. The next lesson is about the squares that really matter.',
  },

  {
    id: 'reversi-l03',
    game: 'reversi',
    title: 'Corners, and the squares beside them',
    summary: 'A corner is yours forever. The square diagonally inside it gives one away.',
    position: '.....O../.....O../...XXXXX/O.XXXOX./.OXXXXX./OOOXOXXX/.OOXXO../..OXXO.. b',
    learnerColor: 'black',
    teaches: 'corners',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'why',
        instruction:
          'A corner has no square beyond it on any line, so a disc there can never be trapped between two enemy discs. Corners are the only permanent squares on the board.',
        expect: { kind: 'read' },
        marks: [
          { square: 'a1', kind: 'target' },
          { square: 'h1', kind: 'target' },
          { square: 'a8', kind: 'target' },
          { square: 'h8', kind: 'target' },
        ],
      },
      {
        id: 'take',
        instruction: 'One corner is available to you right now. Take it.',
        expect: { kind: 'move', moves: ['a1'] },
        success:
          'Yours for the rest of the game, along with an edge to build from. It only flipped two discs, and it was still the best move on the board.',
        misses: [
          {
            when: ['g1', 'a2', 'a4'],
            say: 'That flips more discs — and none of them are safe. A corner flips nothing back, ever.',
          },
          {
            when: ['g2'],
            say: 'g2 sits diagonally inside the h1 corner. Playing there is the usual way to hand a corner over.',
          },
          { say: 'Look at the four corners. One of them is a legal move.' },
        ],
      },
      {
        id: 'x-square',
        position: '..X...../..X...../..X.OX../XXXOOO../..XXO.../OOOO..../..O...../..O..... b',
        instruction:
          'Different board. Nine moves are legal here and one of them is a disaster — the square diagonally inside an empty corner. Play the strongest move instead.',
        expect: { kind: 'best', moves: ['d6'], depth: 6 },
        success:
          'That keeps the corner out of white’s reach and takes real ground. The four squares b2, g2, b7 and g7 are called X-squares, and playing one usually hands over the corner beside it.',
        hint: 'The sixth rank, towards the left.',
        misses: [
          {
            when: ['b2'],
            say: 'That is the X-square. White answers a1 immediately, and the corner — with the edges it anchors — is gone for good.',
          },
          {
            when: ['a2', 'd2', 'e2'],
            say: 'Playable, but it does little. There is a much stronger move further down the board.',
          },
          { say: 'Avoid b2. Look for a move that takes ground without opening a corner.' },
        ],
        marks: [
          { square: 'b2', kind: 'danger' },
          { square: 'a1', kind: 'target' },
        ],
      },
    ],
    outro:
      'Corners first, X-squares last. If you learn one strategic idea in reversi, learn this one.',
  },

  {
    id: 'reversi-l04',
    game: 'reversi',
    title: 'No move? You pass',
    summary: 'When a player has nothing legal, the turn goes straight back.',
    position: '..O.OO.X/X.O.OOOO/XOOOOXOX/X.OXXOO./XXOOOOOO/XXXXOOOO/XXXXXOOO/XXXXXO.. b',
    learnerColor: 'black',
    teaches: 'passing',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'There is no passing by choice in reversi. But a player with no legal move must pass, and the turn goes back immediately — so the other side moves twice in a row.',
        expect: { kind: 'read' },
      },
      {
        id: 'force',
        instruction:
          'Play h5. It flips the whole fifth rank, and leaves white without a single legal square.',
        expect: { kind: 'move', moves: ['h5'] },
        success:
          'White has nothing to play, so white passes and the board comes straight back to you. You did not have to do anything to make that happen — the rules did it.',
        hint: 'The right-hand edge, halfway up.',
        misses: [
          { say: 'The move is on the h-file, on the fifth rank.' },
        ],
        marks: [{ square: 'h5', kind: 'move' }],
      },
      {
        id: 'again',
        instruction:
          'Your turn again, with white still stuck. Take a corner while you can — h1 is free.',
        expect: { kind: 'move', moves: ['h1'] },
        success: 'A free corner, taken on a turn you were never supposed to have.',
        misses: [
          {
            when: ['g1', 'b5', 'b7', 'd7', 'b8', 'd8', 'g8'],
            say: 'All legal — but you have a corner available, and corners do not come round twice.',
          },
          { say: 'Top right. h1.' },
        ],
        marks: [{ square: 'h1', kind: 'target' }],
      },
    ],
    outro:
      'Forcing a pass is a real weapon: it is worth more than most flips, because it is a whole extra move.',
  },

  {
    id: 'reversi-l05',
    game: 'reversi',
    title: 'Parity, and the last few squares',
    summary: 'Who plays the final disc is decided long before the final disc.',
    position: '..OXOO.X/XOOOOOOO/XXOOOXOX/XXXXXXXX/XXXOOOXX/XXXXOXOX/XXXXXOOX/XXXXXOOX b',
    learnerColor: 'black',
    teaches: 'endings',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'rule',
        instruction:
          'Three squares are left: a8, b8 and g8. Whoever plays last in an empty region usually keeps it, because there is no move left to answer with. That idea is called parity.',
        expect: { kind: 'read' },
        marks: [
          { square: 'a8', kind: 'move' },
          { square: 'b8', kind: 'move' },
          { square: 'g8', kind: 'move' },
        ],
      },
      {
        id: 'first',
        instruction: 'Start in the top-left corner. Play a8.',
        expect: { kind: 'move', moves: ['a8'] },
        success: 'A corner, and white has no answer to it — white must pass.',
        misses: [
          {
            when: ['g8'],
            say: 'Legal, but it is the loose square. Take the corner first: it is the one square nobody can ever take back.',
          },
          { say: 'a8 is the top-left corner.' },
        ],
      },
      {
        id: 'second',
        instruction: 'White passed. Play b8 and take the whole eighth rank towards the corner.',
        expect: { kind: 'move', moves: ['b8'] },
        success: 'Still nothing for white. That is two moves in a row, and the rank is now yours.',
        misses: [{ say: 'b8 — the square beside the corner you just took.' }],
      },
      {
        id: 'last',
        instruction: 'And once more. g8 fills the board and ends the game.',
        expect: { kind: 'move', moves: ['g8'] },
        success:
          'Three moves in a row, and the board is full. Every disc you flipped on those three moves stayed flipped, because there was never a reply.',
        misses: [{ say: 'One square left — g8.' }],
      },
    ],
    outro:
      'That is parity. Leaving your opponent with no move is worth far more late in the game than any number of flips early on.',
  },
];
