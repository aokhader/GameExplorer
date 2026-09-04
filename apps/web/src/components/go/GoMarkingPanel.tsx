'use client';

import type { GoScore } from '@gameexplorer/shared';
import { Button } from '@/components/ui';

export interface GoMarkingPanelProps {
  /** The score the board would have if this review were accepted now. */
  score: GoScore;
  /** How many stones are currently marked. */
  deadCount: number;
  /**
   * Whether the player may change the marks.
   *
   * True only in pass-and-play. Against the bot the marks are whatever the
   * solver could prove, and are fixed: a player who could mark the bot's living
   * groups dead would win rated games by declaring them won. The way to
   * disagree with the bot is the same as over a real board — play on.
   */
  editable: boolean;
  onAccept: () => void;
  onResume: () => void;
}

/**
 * The end-of-game review, in the sidebar where the Pass button was.
 *
 * Two passes stop the game but do not finish it. What is left is the one thing
 * a Go engine cannot decide alone: which groups are dead. Stones that can be
 * *proved* dead come marked; anything unproven is left standing, and the honest
 * thing to do about that is say so and offer to play on.
 */
export function GoMarkingPanel({
  score,
  deadCount,
  editable,
  onAccept,
  onResume,
}: GoMarkingPanelProps) {
  const leader = score.lead > 0 ? 'Black' : score.lead < 0 ? 'White' : null;
  const margin = Math.abs(score.lead);

  return (
    <div
      className="shrink-0 rounded-xl border border-accent/40 bg-accent-muted/40 p-4"
      data-testid="go-marking-panel"
    >
      <p className="text-sm font-semibold text-fg">Both players passed</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        {editable
          ? 'Tap a group to mark it dead or bring it back. Groups with two eyes cannot be marked.'
          : deadCount > 0
            ? 'Dead groups have been taken off. If you disagree, play on and settle it on the board.'
            : 'Nothing could be proved dead. If a group should come off, play on and capture it.'}
      </p>

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-fg-muted">Black</span>
          <span className="font-semibold text-fg">{score.black}</span>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-fg-muted">White</span>
          <span className="font-semibold text-fg">{score.white}</span>
        </div>
        <p className="mt-1.5 text-xs text-fg-subtle" data-testid="go-marking-result">
          {leader ? `${leader} by ${margin}` : 'Level — a drawn game'}
          {' · '}
          {score.scoring === 'area' ? 'area' : 'territory'} scoring
          {deadCount > 0 && ` · ${deadCount} stone${deadCount === 1 ? '' : 's'} removed`}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button fullWidth onClick={onAccept}>Accept score</Button>
        <Button fullWidth variant="secondary" onClick={onResume}>Resume play</Button>
      </div>
    </div>
  );
}
