import Link from 'next/link';
import { Button } from '@/components/ui';

export interface ResultActionsProps {
  /** Start the next game with the same setup, without leaving the board. */
  onRematch: () => void;
  /** Open post-game review in place. */
  onReview?: () => void;
  /** Or: the review lives on another page (training's saved-game analysis). */
  reviewHref?: string;
  /** Defaults to "Review Game". */
  reviewLabel?: string;
  /** Back to the setup form, for a different strength, colour or mode. */
  onChangeSetup: () => void;
  /** Where the quiet exit goes — the game's own page. */
  backHref: string;
  backLabel: string;
}

/** The secondary `Button` at `lg`, for a review that is a link. */
const SECONDARY_LINK =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-6 text-base font-semibold ' +
  'bg-info-muted text-info-hover border border-info/30 hover:bg-info/25 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info';

/**
 * The game-over card's actions, in one order on every local game screen.
 *
 * Rematch comes first because it is what most players do next, and it starts the
 * game straight away: *Play Again* used to return to the setup form, so the next
 * game cost two more clicks and a decision already made. The two quiet actions
 * share a row, so the card stays short and every button keeps its place.
 */
export function ResultActions({
  onRematch,
  onReview,
  reviewHref,
  reviewLabel = 'Review Game',
  onChangeSetup,
  backHref,
  backLabel,
}: ResultActionsProps) {
  return (
    <>
      <Button size="lg" fullWidth onClick={onRematch}>
        Rematch
      </Button>
      {onReview ? (
        <Button size="lg" fullWidth variant="secondary" onClick={onReview}>
          {reviewLabel}
        </Button>
      ) : reviewHref ? (
        <Link href={reviewHref} className={SECONDARY_LINK}>
          {reviewLabel}
        </Link>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant="ghost" className="text-sm" onClick={onChangeSetup}>
          Change setup
        </Button>
        <Link
          href={backHref}
          className="inline-flex h-12 items-center justify-center rounded-lg px-3 text-sm font-semibold text-fg-muted hover:bg-surface-muted hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {backLabel}
        </Link>
      </div>
    </>
  );
}
