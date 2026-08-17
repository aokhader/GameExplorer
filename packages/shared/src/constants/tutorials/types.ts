/**
 * "How to play" tutorial content shared by web and mobile.
 *
 * Pure serializable data (strings and arrays only — no JSX, no functions) so it
 * can cross Next.js RSC boundaries and be imported raw by Metro. Each platform
 * renders diagrams with its own TutorialBoard component; CTA hrefs stay
 * platform-side, only the label is shared.
 */

export type TutorialGame = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

/** Board square in the app-wide 'a1'..'h8' convention (col = letter, row = rank − 1). */
export type TutorialSquare = string;

export interface DiagramHighlight {
  square: TutorialSquare;
  /**
   * move    → legal-destination dot
   * capture → capture ring
   * origin  → tint on the square a piece came from
   * target  → tint on the square a piece lands on / a disc that flips
   */
  kind: 'move' | 'capture' | 'origin' | 'target';
}

export interface DiagramArrow {
  from: TutorialSquare;
  to: TutorialSquare;
}

export interface ChessDiagramPiece {
  square: TutorialSquare;
  piece: 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
  color: 'white' | 'black';
}

export interface CheckersDiagramPiece {
  square: TutorialSquare;
  piece: 'man' | 'king';
  /** 'white' renders as the gold disc, 'black' as the blue disc. */
  color: 'white' | 'black';
}

export interface ReversiDiagramPiece {
  square: TutorialSquare;
  color: 'black' | 'white';
}

export interface GoDiagramPiece {
  /** An intersection, `a1`..`i9` — the engine's own convention, not the I-skipping display one. */
  square: TutorialSquare;
  color: 'black' | 'white';
}

interface DiagramBase {
  /** Rendered under the board; also the diagram's accessibility label. */
  caption: string;
  highlights?: DiagramHighlight[];
  arrows?: DiagramArrow[];
  /** Show file/rank labels. Default false. */
  coordinates?: boolean;
}

export interface ChessDiagram extends DiagramBase {
  game: 'chess';
  pieces: ChessDiagramPiece[];
}

export interface CheckersDiagram extends DiagramBase {
  game: 'checkers';
  pieces: CheckersDiagramPiece[];
}

export interface ReversiDiagram extends DiagramBase {
  game: 'reversi';
  pieces: ReversiDiagramPiece[];
}

/**
 * Go's diagrams carry their own `size`, because Go is the first game here whose
 * board is not 8×8 — every other diagram type inherits that assumption from the
 * `a1`..`h8` square convention. A Go stone also sits on a line crossing rather
 * than in a cell, which only the renderers care about.
 */
export interface GoDiagram extends DiagramBase {
  game: 'go';
  /** Board edge in lines. 9 for everything shipped today. */
  size: number;
  pieces: GoDiagramPiece[];
}

export type TutorialDiagram = ChessDiagram | CheckersDiagram | ReversiDiagram | GoDiagram;

export interface TutorialSection {
  /** Stable key, usable as a scroll anchor. */
  id: string;
  heading: string;
  paragraphs: string[];
  diagrams?: TutorialDiagram[];
}

export interface GameTutorial {
  game: TutorialGame;
  title: string;
  intro: string;
  sections: TutorialSection[];
  /** 3–5 quick beginner tips. */
  tips: string[];
  /** Label for the platform-specific "play a bot" call to action. */
  ctaLabel: string;
}
