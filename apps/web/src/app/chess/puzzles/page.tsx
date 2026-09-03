import type { Metadata } from 'next';
import { PuzzleScreen } from '@/components/puzzles/PuzzleScreen';

export const metadata: Metadata = {
  title: 'Chess Puzzles — Finesse',
  description:
    'Solve chess tactics one position at a time. Find the move, see the reply, and learn why it works. No clock, no account needed.',
};

export default function ChessPuzzlesPage() {
  return <PuzzleScreen game="chess" />;
}
