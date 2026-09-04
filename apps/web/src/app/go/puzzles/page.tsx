import type { Metadata } from 'next';
import { PuzzleScreen } from '@/components/puzzles/PuzzleScreen';

export const metadata: Metadata = {
  title: 'Go Puzzles — Life and Death',
  description:
    'Tsumego one shape at a time: find the point that kills a group, or the one that saves it. No clock, no account needed.',
};

export default function GoPuzzlesPage() {
  return <PuzzleScreen game="go" />;
}
