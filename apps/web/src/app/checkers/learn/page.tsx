import type { Metadata } from 'next';
import { CHECKERS_TUTORIAL } from '@finesse/shared';
import { TutorialArticle } from '@/components/learn/TutorialArticle';

export const metadata: Metadata = {
  title: 'How to Play Checkers — Finesse',
  description:
    'Learn the rules of checkers in two minutes: moving, mandatory jumps, multi-jump chains, kings, and beginner tips.',
};

export default function CheckersLearnPage() {
  return <TutorialArticle tutorial={CHECKERS_TUTORIAL} />;
}
