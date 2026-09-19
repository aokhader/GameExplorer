import Link from 'next/link';
import type { GameId } from '@gameexplorer/shared';
import { Icon, type IconName } from '@gameexplorer/ui';
import { GameIcon } from '@/components/game/GameIcon';
import { HowItWorks, type HowItWorksPoint } from '@/components/game/HowItWorks';

export interface HubMode {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  href: string;
  /** False draws the card inert with "Coming soon". */
  available: boolean;
}

export interface GameHubProps {
  game: GameId;
  /** The game's name, as the page heading. */
  name: string;
  /** One sentence under the heading. A rule or a fact, never a claim about the app. */
  summary?: string;
  modes: HubMode[];
  howItWorks: HowItWorksPoint[];
  learnHref: string;
}

/**
 * A game's hub: its name, the ways to play it, and the three rules.
 *
 * One component rather than five hand-copied pages, which is how the hubs had
 * drifted — and all five carried the same Arcade Glow hero: a floating icon in
 * a glowing ring, a gradient title, a staggered entrance, and mode cards that
 * lifted, glowed, tinted and scaled on hover with a per-mode colour that meant
 * nothing (Training and Local shared one). The UX audit counted about 80 such
 * treatments across these five files with no job to do
 * (`project-docs/ux-fix-ideas.md` §6.1).
 *
 * What is left is Quiet Arcade: the piece art is the game's identity, the page
 * title is a heading rather than a hero (§6.3 — the first choice now sits in
 * the top quarter of the screen), and a card answers a press rather than a
 * hover, with its chevron always visible so it reads as tappable on a phone
 * (§8.4). The mode list is still the flat grid; ranking it is wave 4's §3.2.
 */
export function GameHub({ game, name, summary, modes, howItWorks, learnHref }: GameHubProps) {
  return (
    <div className="min-h-svh pt-16">
      <div className="container mx-auto max-w-5xl px-4 pt-6 pb-12">
        <header className="flex items-center gap-3">
          <span className="text-4xl inline-flex items-center" aria-hidden="true">
            <GameIcon game={game} />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-fg">{name}</h1>
            {summary && <p className="text-fg-muted">{summary}</p>}
          </div>
        </header>

        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={`Ways to play ${name}`}>
          {modes.map((mode) => (
            <li key={mode.id}>
              {mode.available ? (
                <Link
                  href={mode.href}
                  className="group flex h-full min-h-16 items-center gap-4 rounded-xl border border-border bg-surface-alt p-4 motion-control motion-safe:active:scale-[0.98] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <ModeBody mode={mode} />
                  <Icon name="caret-right" className="shrink-0 text-xl text-fg-subtle group-hover:text-fg" />
                </Link>
              ) : (
                <div
                  className="flex h-full min-h-16 items-center gap-4 rounded-xl border border-border bg-surface-alt p-4 opacity-60"
                  aria-disabled="true"
                >
                  <ModeBody mode={mode} />
                  <span className="shrink-0 text-sm font-medium text-fg-muted">Coming soon</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <HowItWorks learnHref={learnHref} points={howItWorks} />
      </div>
    </div>
  );
}

function ModeBody({ mode }: { mode: HubMode }) {
  return (
    <>
      <span
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-2xl text-fg"
        aria-hidden="true"
      >
        <Icon name={mode.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-fg">{mode.title}</h2>
        <p className="text-sm text-fg-muted">{mode.description}</p>
      </div>
    </>
  );
}
