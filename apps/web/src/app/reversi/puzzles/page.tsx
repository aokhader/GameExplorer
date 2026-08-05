import type { Metadata } from 'next';
import { PuzzleScreen } from '@/components/puzzles/PuzzleScreen';

export const metadata: Metadata = {
  title: 'Reversi Puzzles — GameExplorer',
  description:
    'Solve reversi positions one move at a time — corners, parity and forced passes. No clock, no account needed.',
};

export default function ReversiPuzzlesPage() {
  return <PuzzleScreen game="reversi" />;
}
