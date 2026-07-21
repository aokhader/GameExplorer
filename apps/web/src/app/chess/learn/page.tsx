import type { Metadata } from 'next';
import { CHESS_TUTORIAL } from '@gameexplorer/shared';
import { TutorialArticle } from '@/components/learn/TutorialArticle';

export const metadata: Metadata = {
  title: 'How to Play Chess — GameExplorer',
  description:
    'Learn the rules of chess in five minutes: how every piece moves, check and checkmate, castling, en passant, promotion, and beginner tips.',
};

export default function ChessLearnPage() {
  return <TutorialArticle tutorial={CHESS_TUTORIAL} />;
}
