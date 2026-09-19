'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub, type HubMode } from '@/components/game/GameHub';
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

const MODES: HubMode[] = [
  {
    id: 'bot',
    title: 'Play vs Bot',
    description: 'Challenge AI opponents at different skill levels',
    icon: 'robot',
    href: '/chess/bot',
    available: true,
  },
  {
    id: 'training',
    title: 'Training Mode',
    description: 'Play rated games against a bot matched to your skill level',
    icon: 'target',
    href: '/chess/training',
    available: true,
  },
  {
    id: 'puzzles',
    title: 'Puzzles',
    description: 'Solve tactics one move at a time — no clock, no opponent',
    icon: 'puzzle-piece',
    href: '/chess/puzzles',
    available: true,
  },
  {
    id: 'replays',
    title: 'Game Replays',
    description: 'Review and replay your past games',
    icon: 'film-strip',
    href: '/chess/replays',
    available: true,
  },
  {
    id: 'analysis',
    title: 'Analysis Board',
    description: 'Build any position and get Stockfish engine analysis',
    icon: 'magnifying-glass',
    href: '/chess/analysis',
    available: true,
  },
  {
    id: 'multiplayer',
    title: 'Online Multiplayer',
    description: 'Play against other players around the world',
    icon: 'globe',
    href: '/chess/play',
    available: true,
  },
  {
    id: 'local',
    title: 'Local 2-Player',
    description: 'Play with a friend on the same device',
    icon: 'users',
    href: '/chess/local',
    available: true,
  },
  {
    id: 'learn',
    title: 'How to Play',
    description: 'New to chess? Learn the rules and pick up beginner tips in five minutes',
    icon: 'graduation-cap',
    href: '/chess/learn',
    available: true,
  },
];

export default function ChessLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="chess"
      name="Chess"
      modes={MODES}
      howItWorks={HOW_IT_WORKS}
      learnHref="/chess/learn"
    />
  );
}
