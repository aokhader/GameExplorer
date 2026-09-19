'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub } from '@/components/game/GameHub';
import type { HowItWorksPoint } from '@/components/game/HowItWorks';

const HOW_IT_WORKS: HowItWorksPoint[] = [
  {
    icon: 'lightning',
    title: 'Mandatory Captures',
    description: 'You must jump when a capture is available',
  },
  {
    icon: 'crown',
    title: 'King Promotion',
    description: 'Reach the back rank to become a king',
  },
  {
    icon: 'link',
    title: 'Multi-Jump Chains',
    description: 'Chain multiple captures in a single turn',
  },
];

export default function CheckersLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="checkers"
      howItWorks={HOW_IT_WORKS}
    />
  );
}
