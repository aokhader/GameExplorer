'use client';

import { useState } from 'react';
import { sgfToTimeline, type GoGameState } from '@gameexplorer/shared';

export interface GoSgfLoadProps {
  /** Every position of the game the file describes, once it parses. */
  onLoad: (timeline: GoGameState[]) => void;
}

/**
 * Paste a game in — the load stage of Go's analysis page.
 *
 * SGF is Go's FEN, with one difference that decides the shape of this whole
 * page: a FEN is a position and an SGF is a *game*. So where chess's analysis
 * board opens on a position editor, this opens on a paste box and hands what
 * comes out of it to review.
 *
 * It refuses rather than guesses. Assuming 9×9 for a file with no `SZ` imports
 * a 19×19 game as a truncated 9×9 one — no error anywhere, a board that looks
 * entirely reasonable, and not the game anyone played. `parseSgf` throws on
 * that, on a rectangular board and on a file that is not Go at all, and each
 * message says what was wrong.
 */
export function GoSgfLoad({ onLoad }: GoSgfLoadProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    try {
      const timeline = sgfToTimeline(text);
      // Parses cleanly and is still useless: review grades moves, and there are
      // none. Saying so beats an empty review with a bar reading Draw.
      if (timeline.length < 2) {
        setError('That file has no moves to review.');
        return;
      }
      setError(null);
      onLoad(timeline);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that SGF');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-surface-alt surface-raised p-6 sm:p-8">
      <h2 className="text-2xl font-semibold text-fg">Review a game from SGF</h2>
      <p className="mt-2 text-sm text-fg-muted">
        Paste a game from any Go program — OGS, Sabaki, KaTrain, a tsumego app.
        The board size, komi and scoring rule come from the file, and every move
        gets graded by the engine.
      </p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder="(;FF[4]GM[1]SZ[19]KM[6.5]…)"
        aria-label="SGF"
        aria-invalid={!!error}
        className={`mt-4 w-full resize-y rounded-lg border bg-black/20 px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent ${
          error ? 'border-danger/60' : 'border-white/10'
        }`}
      />

      {error && (
        <p role="status" className="mt-1 text-xs text-danger-hover">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={load}
          disabled={text.trim().length === 0}
          className="touch-target motion-control motion-safe:active:scale-[0.98] rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-40"
        >
          Analyze game
        </button>
        <button
          type="button"
          onClick={() => {
            setText('');
            setError(null);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-fg hover:bg-white/10"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
