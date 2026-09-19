'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub, type HubMode } from '@/components/game/GameHub';
import type { HowItWorksPoint } from '@/components/game/HowItWorks';

const HOW_IT_WORKS: HowItWorksPoint[] = [
  {
    icon: 'x-circle',
    title: 'Surround to Capture',
    description: "Take a group's last empty neighbour and it comes off the board",
  },
  {
    icon: 'mountains',
    title: 'Claim Territory',
    description: 'Empty points only you surround count as yours at the end',
  },
  {
    icon: 'handshake',
    title: 'Two Passes End It',
    description: 'Then stones plus territory are counted, and white adds komi',
  },
];

const MODES: HubMode[] = [
  {
    id: 'bot',
    title: 'Play vs Bot',
    description: 'Six tiers, from a bot that plays almost at random to the engine at full strength',
    icon: 'robot',
    href: '/go/bot',
    available: true,
  },
  {
    id: 'training',
    title: 'Training Mode',
    description: 'Rated games against a bot matched to your skill level, with hints for sale',
    icon: 'target',
    href: '/go/training',
    available: true,
  },
  {
    id: 'local',
    title: 'Pass & Play',
    description: 'Two players, one screen — no account needed',
    icon: 'users',
    href: '/go/local',
    available: true,
  },
  {
    id: 'puzzles',
    title: 'Puzzles',
    description: 'Life and death, one shape at a time — find the point that settles the group',
    icon: 'puzzle-piece',
    href: '/go/puzzles',
    available: true,
  },
  {
    id: 'analysis',
    title: 'Analysis Board',
    description: 'Paste a game as SGF and have the engine grade every move',
    icon: 'magnifying-glass',
    href: '/go/analysis',
    available: true,
  },
  {
    id: 'learn',
    title: 'How to Play',
    description: 'New to Go? Liberties, capture, ko and scoring — the whole game in a few minutes',
    icon: 'graduation-cap',
    href: '/go/learn',
    available: true,
  },
];

export default function GoLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="go"
      name="Go"
      modes={MODES}
      howItWorks={HOW_IT_WORKS}
      learnHref="/go/learn"
    />
  );
}
