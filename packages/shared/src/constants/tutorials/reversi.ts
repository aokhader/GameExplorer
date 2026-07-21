import type { GameTutorial } from './types';

export const REVERSI_TUTORIAL: GameTutorial = {
  game: 'reversi',
  title: 'How to Play Reversi',
  intro:
    'Reversi is a game of flips and flanking — simple rules with surprising depth. ' +
    'Trap lines of enemy discs to flip them to your color; whoever has the most discs at the end wins.',
  sections: [
    {
      id: 'setup',
      heading: 'The board and setup',
      paragraphs: [
        'The game starts with four discs in the center of the 8×8 board — two black and two white in a diagonal pattern. Black always moves first.',
      ],
      diagrams: [
        {
          game: 'reversi',
          pieces: [
            { square: 'd4', color: 'white' },
            { square: 'e5', color: 'white' },
            { square: 'e4', color: 'black' },
            { square: 'd5', color: 'black' },
          ],
          coordinates: true,
          caption: 'The starting position. Black moves first.',
        },
      ],
    },
    {
      id: 'flanking',
      heading: 'Making a move',
      paragraphs: [
        'On your turn, place one disc of your color on an empty square so that a straight, unbroken line of enemy discs is trapped between your new disc and another disc of yours — horizontally, vertically, or diagonally.',
        'Every enemy disc trapped in that line flips to your color. If a placement wouldn’t flip at least one disc, it isn’t a legal move.',
      ],
      diagrams: [
        {
          game: 'reversi',
          pieces: [
            { square: 'd4', color: 'white' },
            { square: 'e5', color: 'white' },
            { square: 'e4', color: 'black' },
            { square: 'd5', color: 'black' },
          ],
          highlights: [
            { square: 'f5', kind: 'move' },
            { square: 'e5', kind: 'target' },
          ],
          arrows: [{ from: 'f5', to: 'd5' }],
          caption: 'Black plays f5, trapping the white disc on e5 between two black discs — it flips to black.',
        },
      ],
    },
    {
      id: 'multi-flip',
      heading: 'Flipping in several directions',
      paragraphs: [
        'One placement can flank enemy lines in up to eight directions at once — every trapped line flips in the same turn.',
        'Discs flipped this way can always be flipped back later. Nothing is safe until the game ends — except the corners.',
      ],
      diagrams: [
        {
          game: 'reversi',
          pieces: [
            { square: 'e4', color: 'white' },
            { square: 'e5', color: 'white' },
            { square: 'd3', color: 'black' },
            { square: 'd5', color: 'black' },
          ],
          highlights: [
            { square: 'f5', kind: 'move' },
            { square: 'e5', kind: 'target' },
            { square: 'e4', kind: 'target' },
          ],
          arrows: [
            { from: 'f5', to: 'd5' },
            { from: 'f5', to: 'd3' },
          ],
          caption: 'Black plays f5 and flips discs along two lines at once.',
        },
      ],
    },
    {
      id: 'passing',
      heading: 'No move? You pass',
      paragraphs: [
        'If you have no legal move, you must pass and your opponent plays again. Passing is only allowed — and always forced — when you truly have no legal move.',
        'If both players pass in a row, the game is over.',
      ],
    },
    {
      id: 'endings',
      heading: 'How the game ends',
      paragraphs: [
        'The game ends when the board is full or neither player can move. Whoever has more discs of their color wins; equal counts are a draw.',
        'Don’t panic if you’re behind early — huge swings in the final moves are completely normal in Reversi.',
      ],
    },
    {
      id: 'corners',
      heading: 'Corners win games',
      paragraphs: [
        'A corner disc can never be flipped — there is no way to flank it. Corners anchor whole edges, which makes them the most valuable squares on the board.',
        'Be careful with the squares next to an empty corner, especially the diagonal ones: landing there often hands your opponent the corner.',
      ],
      diagrams: [
        {
          game: 'reversi',
          pieces: [],
          highlights: [
            { square: 'a1', kind: 'move' },
            { square: 'h1', kind: 'move' },
            { square: 'a8', kind: 'move' },
            { square: 'h8', kind: 'move' },
            { square: 'b2', kind: 'capture' },
            { square: 'g2', kind: 'capture' },
            { square: 'b7', kind: 'capture' },
            { square: 'g7', kind: 'capture' },
          ],
          caption: 'Corners (dots) can never be flipped. Their diagonal neighbors (rings) often give the corner away.',
        },
      ],
    },
  ],
  tips: [
    'Grab corners whenever you safely can — corner discs can never be flipped.',
    'Avoid the squares diagonally next to an empty corner; they usually hand the corner to your opponent.',
    'Early on, fewer discs is often better — keep your options open and limit your opponent’s moves.',
    'Take edges thoughtfully: they’re strong, but a careless edge disc can give away a corner.',
  ],
  ctaLabel: 'Play vs an easy bot',
};
