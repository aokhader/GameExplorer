import type { Metadata } from 'next';
import { PuzzleScreen } from '@/components/puzzles/PuzzleScreen';

export const metadata: Metadata = {
  title: 'Checkers Puzzles — GameExplorer',
  description:
    'Solve checkers tactics one position at a time — shots, multi-jumps and crowning combinations. No clock, no account needed.',
};

export default function CheckersPuzzlesPage() {
  return <PuzzleScreen game="checkers" />;
}
