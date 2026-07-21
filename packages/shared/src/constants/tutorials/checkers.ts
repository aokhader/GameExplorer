import type { CheckersDiagramPiece, GameTutorial } from './types';

/**
 * The starting position: 12 pieces per side on the dark squares of the three
 * closest rows (verified against createInitialGameState in tests).
 * Engine color 'white' renders as the gold disc, 'black' as the blue disc.
 */
const INITIAL_SETUP: CheckersDiagramPiece[] = [
  ...['b1', 'd1', 'f1', 'h1', 'a2', 'c2', 'e2', 'g2', 'b3', 'd3', 'f3', 'h3'].map(
    (square): CheckersDiagramPiece => ({ square, piece: 'man', color: 'white' }),
  ),
  ...['a6', 'c6', 'e6', 'g6', 'b7', 'd7', 'f7', 'h7', 'a8', 'c8', 'e8', 'g8'].map(
    (square): CheckersDiagramPiece => ({ square, piece: 'man', color: 'black' }),
  ),
];

export const CHECKERS_TUTORIAL: GameTutorial = {
  game: 'checkers',
  title: 'How to Play Checkers',
  intro:
    'Checkers is a fast, tactical game of jumps and traps, played entirely on the dark squares of an 8×8 board. ' +
    'You can learn the rules in two minutes — mastering the jumps takes a little longer.',
  sections: [
    {
      id: 'setup',
      heading: 'The board and setup',
      paragraphs: [
        'Each player starts with twelve pieces, called men, placed on the dark squares of the three rows closest to them. All the action happens on the dark squares — the light squares are never used.',
        'Gold moves first, then the players alternate one move at a time.',
      ],
      diagrams: [
        {
          game: 'checkers',
          pieces: INITIAL_SETUP,
          coordinates: true,
          caption: 'The starting position — gold moves first.',
        },
      ],
    },
    {
      id: 'moving',
      heading: 'Moving',
      paragraphs: [
        'A man slides one square diagonally forward — toward the opponent’s side — onto an empty dark square. Men never move backward (until they become kings).',
      ],
      diagrams: [
        {
          game: 'checkers',
          pieces: [{ square: 'e4', piece: 'man', color: 'white' }],
          highlights: [
            { square: 'd5', kind: 'move' },
            { square: 'f5', kind: 'move' },
          ],
          caption: 'A man can step to either forward diagonal square.',
        },
      ],
    },
    {
      id: 'jumping',
      heading: 'Capturing by jumping',
      paragraphs: [
        'You capture by jumping: leap diagonally over an adjacent enemy piece onto the empty square directly beyond it. The jumped piece is removed from the board.',
        'Captures are mandatory. If any of your pieces can jump, you must make a jump that turn — ordinary moves are not allowed.',
      ],
      diagrams: [
        {
          game: 'checkers',
          pieces: [
            { square: 'e4', piece: 'man', color: 'white' },
            { square: 'f5', piece: 'man', color: 'black' },
          ],
          highlights: [
            { square: 'f5', kind: 'capture' },
            { square: 'g6', kind: 'move' },
          ],
          arrows: [{ from: 'e4', to: 'g6' }],
          caption: 'Gold must jump: over the blue piece on f5, landing on g6.',
        },
      ],
    },
    {
      id: 'multi-jumps',
      heading: 'Multi-jump chains',
      paragraphs: [
        'If your piece lands on a square from which it can jump again, it must keep jumping until no more jumps are available — all in one turn.',
        'When several capture sequences are possible, you choose which one to play. You don’t have to pick the longest chain, but whichever chain you start must be played to its end.',
      ],
      diagrams: [
        {
          game: 'checkers',
          pieces: [
            { square: 'b3', piece: 'man', color: 'white' },
            { square: 'c4', piece: 'man', color: 'black' },
            { square: 'e6', piece: 'man', color: 'black' },
          ],
          highlights: [
            { square: 'c4', kind: 'capture' },
            { square: 'e6', kind: 'capture' },
            { square: 'f7', kind: 'target' },
          ],
          arrows: [
            { from: 'b3', to: 'd5' },
            { from: 'd5', to: 'f7' },
          ],
          caption: 'A double jump: gold captures both blue pieces in a single turn.',
        },
      ],
    },
    {
      id: 'kings',
      heading: 'Kings',
      paragraphs: [
        'When a man reaches the far row it is crowned a king. Kings move and jump one square diagonally in all four directions — forward and backward.',
        'If a man is crowned in the middle of a jump chain, the chain ends there. The new king waits until your next turn to move again.',
      ],
      diagrams: [
        {
          game: 'checkers',
          pieces: [{ square: 'd5', piece: 'king', color: 'white' }],
          highlights: [
            { square: 'c4', kind: 'move' },
            { square: 'e4', kind: 'move' },
            { square: 'c6', kind: 'move' },
            { square: 'e6', kind: 'move' },
          ],
          caption: 'A king moves one square diagonally in any direction — kings here don’t fly across the board.',
        },
      ],
    },
    {
      id: 'endings',
      heading: 'How games end',
      paragraphs: [
        'You win when your opponent has no legal move — either all their pieces are captured, or the ones left are completely blocked.',
        'If 40 consecutive moves pass without a single capture (counting both players), the game is declared a draw.',
      ],
    },
  ],
  tips: [
    'Keep your back row at home early on — it stops enemy men from crowning kings.',
    'Fight for the center; pieces stuck on the edge can only move one way.',
    'When you’re ahead in pieces, trade freely — the advantage grows as the board empties.',
    'Captures are forced, so use that: offer a jump that drags your opponent into a worse position.',
  ],
  ctaLabel: 'Play vs an easy bot',
};
