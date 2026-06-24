'use client';

import { useState } from 'react';

/**
 * Copies a /spectate/<gameId> link so the player can invite people to watch
 * their live game. Shared by all three multiplayer play pages.
 */
export function SpectateLinkButton({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const url = `${window.location.origin}/spectate/${gameId}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button onClick={copy}
      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
      title="Copy a link so others can watch this game">
      {copied ? '✓ Link copied' : '👁 Spectate link'}
    </button>
  );
}
