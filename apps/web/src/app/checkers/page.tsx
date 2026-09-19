'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub, type HubMode } from '@/components/game/GameHub';
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

const MODES: HubMode[] = [
  {
    id: 'bot',
    title: 'Play vs Bot',
    description: 'Challenge AI opponents from beginner to near-perfect play',
    icon: 'robot',
    href: '/checkers/bot',
    available: true,
  },
  {
    id: 'training',
    title: 'Training Mode',
    description: 'Rated games against a bot matched to your skill level',
    icon: 'target',
    href: '/checkers/training',
    available: true,
  },
  {
    id: 'puzzles',
    title: 'Puzzles',
    description: 'Solve tactics one move at a time — no clock, no opponent',
    icon: 'puzzle-piece',
    href: '/checkers/puzzles',
    available: true,
  },
  {
    id: 'multiplayer',
    title: 'Online Multiplayer',
    description: 'Play against other players around the world',
    icon: 'globe',
    href: '/checkers/play',
    available: true,
  },
  {
    id: 'local',
    title: 'Local 2-Player',
    description: 'Play with a friend on the same device',
    icon: 'users',
    href: '/checkers/local',
    available: true,
  },
  {
    id: 'learn',
    title: 'How to Play',
    description: 'New to checkers? Learn the rules and pick up beginner tips in two minutes',
    icon: 'graduation-cap',
    href: '/checkers/learn',
    available: true,
  },
];

export default function CheckersLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="checkers"
      name="Checkers"
      modes={MODES}
      howItWorks={HOW_IT_WORKS}
      learnHref="/checkers/learn"
    />
  );
}
