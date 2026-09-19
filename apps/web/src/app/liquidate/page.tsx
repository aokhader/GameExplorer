'use client';

import { GameHub } from '@/components/game/GameHub';
import type { HowItWorksPoint } from '@/components/game/HowItWorks';

const HOW_IT_WORKS: HowItWorksPoint[] = [
  {
    icon: 'dice-five',
    title: 'Roll and Claim',
    description: 'Buy the planet you land on, or send it to auction',
  },
  {
    icon: 'buildings',
    title: 'Corner a System',
    description: 'Hold every planet in a system to double rent and build colonies',
  },
  {
    icon: 'coins',
    title: 'Last One Solvent',
    description: 'Mortgage, trade and squeeze until only one baron is left',
  },
];

export default function LiquidateLandingPage() {
  return (
    <GameHub
      game="liquidate"
      summary="Claim planets, build colonies, and squeeze your rivals out of the sector — a cosmic property-trading game for 2–6 players."
      howItWorks={HOW_IT_WORKS}
    />
  );
}
