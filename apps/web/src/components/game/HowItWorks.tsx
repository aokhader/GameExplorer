import Link from 'next/link';
import { Icon, type IconName } from '@gameexplorer/ui';

export interface HowItWorksPoint {
  icon: IconName;
  title: string;
  /**
   * One clause, and a rule of the game rather than a claim about the app —
   * the panel sits on a page a stranger may be reading first, and the audit's
   * §9 findings were all app-describing copy nobody can check.
   */
  description: string;
}

export interface HowItWorksProps {
  points: HowItWorksPoint[];
  /**
   * The game's guide. Required, not optional: three rules raise more questions
   * than they answer, and every game's panel used to answer them differently —
   * checkers linked to its guide, reversi, Go and Liquidate dead-ended, and
   * chess had no panel at all.
   */
  learnHref: string;
  learnLabel?: string;
}

/**
 * The rules panel at the foot of a game's hub: three things you have to know to
 * play, then the way to the full guide.
 *
 * One component rather than five copies, so the next game gets the same panel
 * and the same exit without anyone remembering to add them.
 */
export function HowItWorks({ points, learnHref, learnLabel = 'Read the full guide' }: HowItWorksProps) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-surface-alt p-6" data-testid="how-it-works">
      <h2 className="text-lg font-semibold text-fg mb-4">How it works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {points.map((point) => (
          <div key={point.title}>
            <div className="text-2xl mb-2 text-fg-muted" aria-hidden="true">
              <Icon name={point.icon} />
            </div>
            <div className="text-sm font-medium text-fg">{point.title}</div>
            <div className="text-xs text-fg-muted mt-1">{point.description}</div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        {/* `min-h-11` (44px) rather than the bare text link this replaces: the
            audit measured the old one at 20px, under every touch-target floor
            we hold ourselves to. */}
        <Link
          href={learnHref}
          className="-mx-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent transition-colors hover:text-accent-hover hover:underline"
          data-testid="how-it-works-guide"
        >
          {learnLabel}
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </section>
  );
}
