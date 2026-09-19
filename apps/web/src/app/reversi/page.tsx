'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub, type HubMode } from '@/components/game/GameHub';
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

const MODES: HubMode[] = [
  {
    id: 'bot',
    title: 'Play vs Bot',
    description: 'Challenge AI opponents from beginner to near-optimal play',
    icon: 'robot',
    href: '/reversi/bot',
    available: true,
  },
  {
    id: 'training',
    title: 'Training Mode',
    description: 'Rated games against a bot matched to your skill level',
    icon: 'target',
    href: '/reversi/training',
    available: true,
  },
  {
    id: 'puzzles',
    title: 'Puzzles',
    description: 'Solve positions one move at a time — no clock, no opponent',
    icon: 'puzzle-piece',
    href: '/reversi/puzzles',
    available: true,
  },
  {
    id: 'multiplayer',
    title: 'Online Multiplayer',
    description: 'Play against other players around the world',
    icon: 'globe',
    href: '/reversi/play',
    available: true,
  },
  {
    id: 'local',
    title: 'Local 2-Player',
    description: 'Play with a friend on the same device',
    icon: 'users',
    href: '/reversi/local',
    available: true,
  },
  {
    id: 'learn',
    title: 'How to Play',
    description: 'New to Reversi? Learn the rules and pick up beginner tips in two minutes',
    icon: 'graduation-cap',
    href: '/reversi/learn',
    available: true,
  },
];

export default function ReversiLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="reversi"
      name="Reversi"
      modes={MODES}
      howItWorks={HOW_IT_WORKS}
      learnHref="/reversi/learn"
    />
  );
}
