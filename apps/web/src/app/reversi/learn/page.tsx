import type { Metadata } from 'next';
import { REVERSI_TUTORIAL } from '@finesse/shared';
import { TutorialArticle } from '@/components/learn/TutorialArticle';

export const metadata: Metadata = {
  title: 'How to Play Reversi — Finesse',
  description:
    'Learn the rules of Reversi in two minutes: flanking, flipping, passing, why corners win games, and beginner tips.',
};

export default function ReversiLearnPage() {
  return <TutorialArticle tutorial={REVERSI_TUTORIAL} />;
}
