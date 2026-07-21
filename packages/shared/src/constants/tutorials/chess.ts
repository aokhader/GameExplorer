import type { ChessDiagramPiece, GameTutorial } from './types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

const BACK_RANK: ReadonlyArray<ChessDiagramPiece['piece']> = [
  'rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook',
];

/** The standard 32-piece starting position (verified against ChessEngine.newGame in tests). */
const INITIAL_SETUP: ChessDiagramPiece[] = [
  ...FILES.map((f, i): ChessDiagramPiece => ({ square: `${f}1`, piece: BACK_RANK[i], color: 'white' })),
  ...FILES.map((f): ChessDiagramPiece => ({ square: `${f}2`, piece: 'pawn', color: 'white' })),
  ...FILES.map((f): ChessDiagramPiece => ({ square: `${f}7`, piece: 'pawn', color: 'black' })),
  ...FILES.map((f, i): ChessDiagramPiece => ({ square: `${f}8`, piece: BACK_RANK[i], color: 'black' })),
];

export const CHESS_TUTORIAL: GameTutorial = {
  game: 'chess',
  title: 'How to Play Chess',
  intro:
    'Chess is a two-player strategy game where the goal is to trap the enemy king. ' +
    'Learn the pieces one at a time and you will be playing within minutes.',
  sections: [
    {
      id: 'setup',
      heading: 'The board and the armies',
      paragraphs: [
        'Chess is played on an 8×8 board between White and Black. Each side starts with eight pawns, two rooks, two knights, two bishops, a queen, and a king. White always moves first, then the players alternate one move at a time.',
        'Pieces capture by moving onto a square occupied by an enemy piece, which is removed from the board. Everything builds toward one goal: trapping the enemy king.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: INITIAL_SETUP,
          coordinates: true,
          caption: 'The starting position. Each queen starts on her own color — the white queen on d1, the black queen on d8.',
        },
      ],
    },
    {
      id: 'pawns',
      heading: 'Pawns',
      paragraphs: [
        'Pawns march straight forward one square at a time, and never backward. On its very first move, each pawn may advance two squares instead.',
        'Pawns are the only pieces that capture differently from how they move: they capture one square diagonally forward.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [
            { square: 'e2', piece: 'pawn', color: 'white' },
            { square: 'd3', piece: 'pawn', color: 'black' },
            { square: 'f3', piece: 'pawn', color: 'black' },
          ],
          highlights: [
            { square: 'e3', kind: 'move' },
            { square: 'e4', kind: 'move' },
            { square: 'd3', kind: 'capture' },
            { square: 'f3', kind: 'capture' },
          ],
          caption: 'This pawn can advance to e3 or e4 — or capture either black pawn diagonally.',
        },
      ],
    },
    {
      id: 'knights',
      heading: 'Knights',
      paragraphs: [
        'Knights move in an L-shape: two squares in one direction, then one square sideways. They are the only pieces that can jump over others — friend or foe.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [{ square: 'e4', piece: 'knight', color: 'white' }],
          highlights: [
            { square: 'd2', kind: 'move' },
            { square: 'f2', kind: 'move' },
            { square: 'c3', kind: 'move' },
            { square: 'g3', kind: 'move' },
            { square: 'c5', kind: 'move' },
            { square: 'g5', kind: 'move' },
            { square: 'd6', kind: 'move' },
            { square: 'f6', kind: 'move' },
          ],
          arrows: [
            { from: 'e4', to: 'f6' },
            { from: 'e4', to: 'g5' },
          ],
          caption: 'A knight in the center reaches eight squares — and jumps over anything in its way.',
        },
      ],
    },
    {
      id: 'sliders',
      heading: 'Rooks, bishops and the queen',
      paragraphs: [
        'Rooks slide any number of squares horizontally or vertically. Bishops slide any number of squares diagonally, so each bishop stays on one color for the whole game.',
        'The queen combines both: she slides any distance in all eight directions, making her the most powerful piece.',
        'Sliding pieces cannot jump. They stop at the first piece in their path — capturing it if it belongs to the enemy.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [
            { square: 'd5', piece: 'rook', color: 'white' },
            { square: 'f2', piece: 'bishop', color: 'white' },
          ],
          arrows: [
            { from: 'd5', to: 'd8' },
            { from: 'd5', to: 'h5' },
            { from: 'd5', to: 'd1' },
            { from: 'd5', to: 'a5' },
            { from: 'f2', to: 'a7' },
            { from: 'f2', to: 'h4' },
            { from: 'f2', to: 'g1' },
            { from: 'f2', to: 'e1' },
          ],
          caption: 'The rook controls its rank and file; the bishop controls its diagonals. The queen moves like both combined.',
        },
      ],
    },
    {
      id: 'king',
      heading: 'The king',
      paragraphs: [
        'The king moves one square in any direction. He may never move to a square attacked by an enemy piece — and he is never captured, only trapped.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [{ square: 'e4', piece: 'king', color: 'white' }],
          highlights: [
            { square: 'd3', kind: 'move' },
            { square: 'e3', kind: 'move' },
            { square: 'f3', kind: 'move' },
            { square: 'd4', kind: 'move' },
            { square: 'f4', kind: 'move' },
            { square: 'd5', kind: 'move' },
            { square: 'e5', kind: 'move' },
            { square: 'f5', kind: 'move' },
          ],
          caption: 'The king steps one square at a time in any direction.',
        },
      ],
    },
    {
      id: 'check',
      heading: 'Check, checkmate and stalemate',
      paragraphs: [
        'When your king is attacked, it is in check — you must escape immediately by moving the king, blocking the attack, or capturing the attacker.',
        'If there is no way out of check, it is checkmate and the game is over. If you have no legal move but your king is not in check, it is stalemate — the game is a draw.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [
            { square: 'd8', piece: 'rook', color: 'white' },
            { square: 'g1', piece: 'king', color: 'white' },
            { square: 'g8', piece: 'king', color: 'black' },
            { square: 'f7', piece: 'pawn', color: 'black' },
            { square: 'g7', piece: 'pawn', color: 'black' },
            { square: 'h7', piece: 'pawn', color: 'black' },
          ],
          highlights: [
            { square: 'd1', kind: 'origin' },
            { square: 'd8', kind: 'target' },
          ],
          caption: 'A back-rank checkmate: the rook attacks along the eighth rank and the king’s own pawns block every escape.',
        },
      ],
    },
    {
      id: 'castling',
      heading: 'Castling',
      paragraphs: [
        'Once per game, your king and one rook may move together: the king slides two squares toward the rook, and the rook hops to the square just past him.',
        'Castling is only allowed if neither piece has moved, the squares between them are empty, and the king is not in check, does not pass through an attacked square, and does not land in check.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [
            { square: 'e1', piece: 'king', color: 'white' },
            { square: 'a1', piece: 'rook', color: 'white' },
            { square: 'h1', piece: 'rook', color: 'white' },
          ],
          arrows: [
            { from: 'e1', to: 'g1' },
            { from: 'h1', to: 'f1' },
          ],
          caption: 'Kingside castling: the king goes to g1 and the rook to f1. Castling with the other rook is called queenside.',
        },
      ],
    },
    {
      id: 'en-passant',
      heading: 'En passant',
      paragraphs: [
        'If an enemy pawn advances two squares and lands directly beside your pawn, you may capture it “in passing” — as if it had moved only one square. You must do it immediately on your next move, or the chance is gone.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [
            { square: 'e5', piece: 'pawn', color: 'white' },
            { square: 'd5', piece: 'pawn', color: 'black' },
          ],
          highlights: [
            { square: 'd7', kind: 'origin' },
            { square: 'd5', kind: 'capture' },
          ],
          arrows: [{ from: 'e5', to: 'd6' }],
          caption: 'Black’s pawn just leapt from d7 to d5. The white pawn may capture it en passant, landing on d6.',
        },
      ],
    },
    {
      id: 'promotion',
      heading: 'Pawn promotion',
      paragraphs: [
        'When a pawn reaches the far end of the board it promotes: it immediately becomes a queen, rook, bishop, or knight of your color. Nearly everyone chooses a queen.',
      ],
      diagrams: [
        {
          game: 'chess',
          pieces: [{ square: 'e7', piece: 'pawn', color: 'white' }],
          highlights: [{ square: 'e8', kind: 'move' }],
          arrows: [{ from: 'e7', to: 'e8' }],
          caption: 'One step from glory: on e8 this pawn becomes a new queen.',
        },
      ],
    },
    {
      id: 'endings',
      heading: 'How games end',
      paragraphs: [
        'You win by checkmating the enemy king. A player may also resign a lost position, which counts as a win for the opponent.',
        'Games are drawn by stalemate, by agreement between the players, or automatically after a long run of moves with no capture and no pawn move.',
      ],
    },
  ],
  tips: [
    'Develop your knights and bishops early — get them off the back rank before you attack.',
    'Fight for the four center squares; pieces in the center control far more of the board.',
    'Castle early to tuck your king safely into the corner.',
    'Don’t bring your queen out too soon — she gets chased around while your opponent develops for free.',
    'Before every move, ask yourself: what did my opponent’s last move threaten?',
  ],
  ctaLabel: 'Play vs an easy bot',
};
