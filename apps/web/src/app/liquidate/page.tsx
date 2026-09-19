'use client';

import { GameHub, type HubMode } from '@/components/game/GameHub';
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

const MODES: HubMode[] = [
  {
    id: 'bot',
    title: 'Play vs Bots',
    description: 'Take on up to five AI barons, from cautious to ruthless',
    icon: 'robot',
    href: '/liquidate/bot',
    available: true,
  },
  {
    id: 'local',
    title: 'Pass & Play',
    description: 'Two to six players sharing one device, taking turns',
    icon: 'users',
    href: '/liquidate/local',
    available: true,
  },
  {
    id: 'multiplayer',
    title: 'Online Multiplayer',
    description: 'Play against barons around the world',
    icon: 'globe',
    href: '/liquidate/play',
    available: false,
  },
  {
    id: 'learn',
    title: 'How to Play',
    description: 'Rents, colonies, auctions and bankruptcy — the rules in two minutes',
    icon: 'graduation-cap',
    href: '/liquidate/learn',
    available: true,
  },
];

export default function LiquidateLandingPage() {
  return (
    <GameHub
      game="liquidate"
      name="Liquidate"
      summary="Claim planets, build colonies, and squeeze your rivals out of the sector — a cosmic property-trading game for 2–6 players."
      modes={MODES}
      howItWorks={HOW_IT_WORKS}
      learnHref="/liquidate/learn"
    />
  );
}
