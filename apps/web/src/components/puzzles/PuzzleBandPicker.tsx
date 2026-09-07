'use client';

import { PUZZLE_BANDS, type PuzzleBand, type PuzzleGame } from '@gameexplorer/shared';

/**
 * Choose which strength of puzzle to solve.
 *
 * The bands are named after the bot tiers, so "Club" here and "Club" on the bot
 * setup screen are the same claim about the same strength — which is the whole
 * point of the mode. A player who wants to know what a 1200 game looks like can
 * find out without losing one.
 *
 * The count per band is shown rather than hidden, including zeroes. An empty
 * band is information: it says the set does not reach that far yet, which is
 * more honest than a tile that silently serves nothing when tapped.
 */
export interface PuzzleBandPickerProps {
  game: PuzzleGame;
  band: PuzzleBand;
  counts: Record<string, number>;
  /** Solved per band, so each tile reads as progress rather than inventory. */
  solved: Record<string, number>;
  onSelect: (id: string) => void;
  /** The player's own rating in this game, when they have one. */
  rating?: number | null;
}

export function PuzzleBandPicker({
  game,
  band,
  counts,
  solved,
  onSelect,
  rating,
}: PuzzleBandPickerProps) {
  const bands = PUZZLE_BANDS[game];

  return (
    <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-fg">Difficulty</h2>
        {typeof rating === 'number' && (
          <span className="text-xs text-fg-muted">
            your rating: <span className="font-semibold text-fg">{rating}</span>
          </span>
        )}
      </div>

      <div
        className="grid grid-cols-3 gap-1.5"
        role="radiogroup"
        aria-label="Puzzle difficulty band"
      >
        {bands.map((b) => {
          const selected = b.id === band.id;
          const count = counts[b.id] ?? 0;
          const done = solved[b.id] ?? 0;
          const complete = count > 0 && done >= count;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={selected}
              // Spelled out because "3 / 8" read aloud is ambiguous, and the
              // bare numbers on the tile read as a price or a rating.
              aria-label={
                count === 0
                  ? `${b.label}, around ${b.tierElo} rating, no puzzles yet`
                  : `${b.label}, around ${b.tierElo} rating, ${done} of ${count} solved`
              }
              onClick={() => onSelect(b.id)}
              data-testid={`puzzle-band-${b.id}`}
              className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                selected
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-white/10 bg-white/[0.04] text-fg-muted hover:bg-white/[0.08]'
              }`}
            >
              <span className="block text-[11px] font-semibold leading-tight">
                {b.label}
                {complete && <span className="ml-1 text-success">✓</span>}
              </span>
              {/* Progress through the band, not how many exist. "3 / 8" is the
                  number a player is actually tracking; a bare count told them
                  nothing about what they had done. */}
              <span
                className="block text-[10px] tabular-nums opacity-70"
                data-testid={`puzzle-band-${b.id}-progress`}
              >
                {count === 0 ? `${b.tierElo} · —` : `${b.tierElo} · ${done}/${count}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
