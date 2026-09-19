'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ONBOARDED_KEY } from '@/lib/onboarding';
import { SUPPORT_EMAIL } from '@/lib/support';
import { GAME_LIST, gameNameList, type GameCatalogEntry } from '@gameexplorer/shared';
import { Icon } from '@gameexplorer/ui';
import { GameIcon } from '@/components/game/GameIcon';

/**
 * Home, drawn in the Quiet Arcade direction (`project-docs/ux-fix-ideas.md`
 * §6.4): a heading rather than a hero, one gold action, and the five games as
 * flat cards whose identity is their piece art. It used to open on a 128px
 * gradient wordmark over a route-wide aurora, with staggered entrances and
 * per-game neon cards that glowed, lifted, scaled and rotated on hover — the
 * audit counted 22 treatments on this page that signalled nothing.
 *
 * Splitting it into a stranger's landing page and a returning player's
 * launcher is wave 4 (§4.1–§4.3); this is the purge that comes first.
 */
export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Brand-new visitors land in the first-time tour instead of the marketing
  // page (Arcade Glow onboarding: play first, sign up later). Signed-in users
  // have nothing to onboard — just mark them as seen.
  useEffect(() => {
    if (loading) return;
    if (localStorage.getItem(ONBOARDED_KEY)) return;
    if (user) {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } else {
      router.replace('/welcome');
    }
  }, [loading, user, router]);

  return (
    <div className="min-h-svh pt-16">
      <div className="container mx-auto max-w-5xl px-4 pt-6 pb-12">
        <header>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">GameExplorer</h1>
          {/* Every clause here can be checked against the product. The names come
              from the catalog, so a new game joins the sentence by existing. */}
          <p className="mt-1 text-lg text-fg-muted">
            {gameNameList()} — free, and no sign-up to start.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* The screen's one gold element. */}
            <Link
              href="/chess"
              className="inline-flex min-h-11 items-center rounded-lg bg-accent px-6 font-semibold text-on-accent motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Play Now
            </Link>
            {/* The tour used to be reachable only by being redirected into it on a
                first visit. Native Home has always had this link. */}
            <Link
              href="/welcome"
              className="touch-target motion-control motion-safe:active:scale-[0.98] inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-fg-muted motion-control hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Take a quick tour
            </Link>
          </div>
        </header>

        <section id="games" className="mt-8" aria-labelledby="games-heading">
          <h2 id="games-heading" className="text-lg font-semibold text-fg">
            Choose your game
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_LIST.map((game) => (
              <li key={game.id}>
                {game.available ? (
                  <Link
                    href={`/${game.slug}`}
                    className="group block h-full rounded-xl border border-border bg-surface-alt p-4 motion-control motion-safe:active:scale-[0.98] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <GameCard game={game} />
                  </Link>
                ) : (
                  <div className="h-full rounded-xl border border-border bg-surface-alt p-4 opacity-60" aria-disabled="true">
                    <GameCard game={game} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-12 text-center text-sm text-fg-muted">
          {/* 44px rows rather than 20px lines of text: the audit measured these
              at 20px tall, under every touch-target floor (§8.3). */}
          <nav aria-label="Legal and support" className="flex flex-wrap items-center justify-center gap-x-2">
            <FooterLink href="/terms">Terms</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            {/* Google Play requires the account-deletion URL be reachable without
                signing in — the footer is the one place a reviewer will look. */}
            <FooterLink href="/delete-account">Delete account</FooterLink>
            <FooterLink href="/licenses">Licenses</FooterLink>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-fg"
            >
              Contact
            </a>
          </nav>
          <p className="mt-2">© 2026 GameExplorer</p>
        </footer>
      </div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-fg">
      {children}
    </Link>
  );
}

/** One game: its piece art, its name and its one-line blurb, and a way in. */
function GameCard({ game }: { game: GameCatalogEntry }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-5xl inline-flex shrink-0 items-center" aria-hidden="true">
        <GameIcon game={game.id} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold text-fg">{game.name}</h3>
        <p className="text-sm text-fg-muted">{game.blurb}</p>
      </div>
      {game.available ? (
        <Icon name="caret-right" className="shrink-0 text-xl text-fg-subtle group-hover:text-fg" />
      ) : (
        <span className="shrink-0 text-xs font-semibold text-fg-muted">Coming soon</span>
      )}
    </div>
  );
}
