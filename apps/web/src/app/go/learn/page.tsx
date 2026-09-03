import type { Metadata } from 'next';
import { GO_TUTORIAL } from '@finesse/shared';
import { TutorialArticle } from '@/components/learn/TutorialArticle';

export const metadata: Metadata = {
  title: 'How to Play Go — Finesse',
  description:
    'Learn the rules of Go in a few minutes: liberties, capturing, the ko rule, living groups with two eyes, passing, and how area scoring with komi decides the game.',
};

export default function GoLearnPage() {
  return <TutorialArticle tutorial={GO_TUTORIAL} />;
}
