'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui';

/**
 * Copies a /spectate/<gameId> link so the player can invite people to watch
 * their live game. Shared by all three multiplayer play pages.
 */
export function SpectateLinkButton({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = () => {
    const url = `${window.location.origin}/spectate/${gameId}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    toast('Spectate link copied', 'success');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      variant="secondary"
      size="md"
      onClick={copy}
      title="Copy a link so others can watch this game"
    >
      {copied ? '✓ Link copied' : '👁 Spectate link'}
    </Button>
  );
}
