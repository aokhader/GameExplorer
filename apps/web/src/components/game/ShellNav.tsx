import Link from 'next/link';
import { Icon } from '@gameexplorer/ui';
import { cn } from '@/lib/utils';

export interface ShellNavProps {
  /** Where back goes — normally the game's hub. */
  backHref: string;
  backLabel?: string;
  className?: string;
}

const BackArrow = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

/**
 * The whole of an immersive route's navigation: home, then back.
 *
 * These routes render no global navbar (see `isImmersiveGameRoute`), and each
 * one used to offer a single Back link to its game's hub — so from a puzzle, a
 * lesson or a setup screen, home was two clicks away through a page you did not
 * want. Home comes first because it is the one destination every screen shares.
 *
 * The 36px square matches the height of a header button like New Game, so
 * dropping this into `GameScreenLayout`'s header costs the board no pixels.
 */
export function ShellNav({ backHref, backLabel = 'Back', className }: ShellNavProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Link
        href="/"
        aria-label="Home"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
      >
        <Icon name="house" className="w-4 h-4" />
      </Link>
      <Link
        href={backHref}
        className="inline-flex h-9 items-center gap-1.5 px-1 text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <BackArrow />
        {backLabel}
      </Link>
    </div>
  );
}
