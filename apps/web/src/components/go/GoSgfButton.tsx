'use client';

import { useState } from 'react';
import { stateToSgf, type GoGameState } from '@gameexplorer/shared';

/**
 * Copy the game as SGF.
 *
 * Go is the one game here with an interchange format its players actually use.
 * An SGF opens in OGS, Sabaki, KaTrain, GoQuest, Sente and every tsumego app,
 * so this is the difference between a game that can be shown to a teacher or
 * run through a stronger engine and one that only exists inside this app.
 *
 * Deliberately a *copy*, not a download: a clipboard string can be pasted
 * straight into an SGF editor's import box, which is where it is going, and it
 * needs no file permission or save dialog on the way.
 */
export function GoSgfButton({ state }: { state: GoGameState }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // Nothing to export before a stone is played, and an empty record would be a
  // confusing thing to hand someone.
  if (state.moveHistory.length === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stateToSgf(state));
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outright in some browsers and over plain
      // HTTP. Saying so beats a button that silently does nothing.
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-white/10"
    >
      {copied ? 'Copied — paste into any Go app' : failed ? 'Could not copy' : 'Copy game as SGF'}
    </button>
  );
}
