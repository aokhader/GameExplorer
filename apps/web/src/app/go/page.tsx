'use client';

import { useAuth } from '@/hooks/useAuth';
import { GameHub } from '@/components/game/GameHub';
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

export default function GoLandingPage() {
  useAuth(); // initialise auth store

  return (
    <GameHub
      game="go"
      howItWorks={HOW_IT_WORKS}
    />
  );
}
