import type { Metadata } from 'next';
import { LIQUIDATE_TUTORIAL } from '@gameexplorer/shared';
import { TutorialArticle } from '@/components/learn/TutorialArticle';

export const metadata: Metadata = {
  title: 'How to Play Liquidate — GameExplorer',
  description:
    'Learn Liquidate in two minutes: claiming planets, cornering star systems, rent and colonies, auctions, mortgages, Impound, and bankruptcy.',
};

export default function LiquidateLearnPage() {
  return <TutorialArticle tutorial={LIQUIDATE_TUTORIAL} />;
}
