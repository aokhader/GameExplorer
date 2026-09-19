'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub } from '@/components/game/GameHub';
import type { HowItWorksPoint } from '@/components/game/HowItWorks';

const HOW_IT_WORKS: HowItWorksPoint[] = [
  {
    icon: 'arrows-clockwise',
    title: 'Flip Your Opponent',
    description: 'Sandwich opponent discs to flip them to your colour',
  },
  {
    icon: 'target',
    title: 'Control the Corners',
    description: "Corner squares can never be flipped — they're the key",
  },
  {
    icon: 'trophy',
    title: 'Most Discs Wins',
    description: 'When the board fills up, the player with more discs wins',
  },
];

export default function ReversiLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="reversi"
      howItWorks={HOW_IT_WORKS}
    />
  );
}
