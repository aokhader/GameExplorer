'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub } from '@/components/game/GameHub';
import type { HowItWorksPoint } from '@/components/game/HowItWorks';

/**
 * The three rules a newcomer is most often surprised by — the two ways a game
 * can end without either side being captured, and the promotion that makes an
 * endgame. Chess was the one hub with no rules panel at all.
 */
const HOW_IT_WORKS: HowItWorksPoint[] = [
  {
    icon: 'crown',
    title: 'Checkmate Ends It',
    description: 'Attack the king with no legal escape and the game stops there',
  },
  {
    icon: 'sparkle',
    title: 'Pawns Promote',
    description: 'Reach the far rank and the pawn becomes a queen, or any piece you name',
  },
  {
    icon: 'scales',
    title: 'Stalemate Is a Draw',
    description: 'No legal move and no check: nobody wins, however far ahead you are',
  },
];

export default function ChessLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="chess"
      howItWorks={HOW_IT_WORKS}
    />
  );
}
