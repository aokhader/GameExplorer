'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Reveal } from '@/components/visual';
import { ONBOARDED_KEY } from '@/lib/onboarding';
import { SUPPORT_EMAIL } from '@/lib/support';
import { GAME_LIST, gameCountWord, gameNameList, type GameCatalogEntry, type GameId } from '@gameexplorer/shared';
import { GameIcon } from '@/components/game/GameIcon';

const GAME_CARD_GLOW: Record<GameId, string> = {
  chess: 'group-hover:[box-shadow:var(--shadow-glow-chess)]',
  checkers: 'group-hover:[box-shadow:var(--shadow-glow-checkers)]',
  reversi: 'group-hover:[box-shadow:var(--shadow-glow-reversi)]',
  go: 'group-hover:[box-shadow:var(--shadow-glow-go)]',
  liquidate: 'group-hover:[box-shadow:var(--shadow-glow-liquidate)]',
};

export default function HomePage() {
  const [hoveredGame, setHoveredGame] = useState<string | null>(null);
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

  const games = GAME_LIST;

  return (
    <div className="relative min-h-svh pt-16">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <Reveal as="h1" className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tight mb-4 break-words">
            <span className="text-fg">Game</span>
            <span className="text-gradient-brand text-info">Explorer</span>
          </Reveal>
          {/* Every clause here can be checked against the product. The names come
              from the catalog, so a new game joins the sentence by existing. */}
          <Reveal as="p" delay={120} className="text-xl md:text-2xl text-fg-muted mb-8">
            {gameNameList()} — free, and no sign-up to start.
          </Reveal>
          <Reveal delay={220} className="flex justify-center gap-4">
            <Link
              href="/chess"
              className="px-8 py-3 bg-accent [background-image:var(--gradient-accent)] text-on-accent font-semibold rounded-lg shadow-lg transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-glow-accent)]"
            >
              Play Now
            </Link>
            <a
              href="#games"
              className="px-8 py-3 bg-surface-muted/70 backdrop-blur-sm hover:bg-surface-hover text-fg font-semibold rounded-lg shadow-lg transition-all duration-200 motion-safe:hover:-translate-y-0.5"
            >
              Browse Games
            </a>
          </Reveal>
          {/* The tour used to be reachable only by being redirected into it on a
              first visit. Native Home has always had this link. */}
          <div className="mt-3">
            <Link
              href="/welcome"
              className="inline-flex min-h-11 items-center px-2 text-sm text-fg-muted hover:text-fg transition-colors"
            >
              Take a quick tour
            </Link>
          </div>
        </div>

        {/* Game Cards */}
        <div id="games" className="max-w-6xl mx-auto">
          <Reveal as="h2" className="text-4xl font-bold text-fg text-center mb-12">
            Choose Your Game
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {games.map((game, i) => (
              <Reveal
                key={game.id}
                delay={i * 90}
                className="relative group"
                onMouseEnter={() => setHoveredGame(game.id)}
                onMouseLeave={() => setHoveredGame(null)}
              >
                {game.available ? (
                  <Link href={`/${game.slug}`}>
                    <GameCard game={game} isHovered={hoveredGame === game.id} />
                  </Link>
                ) : (
                  <div className="cursor-not-allowed">
                    <GameCard game={game} isHovered={hoveredGame === game.id} />
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-24 text-center text-fg-muted">
          <p className="mb-4">{gameCountWord()} games. One board. Endless rematches.</p>
          <div className="mb-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/terms" className="hover:text-fg transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-fg transition-colors">
              Privacy
            </Link>
            {/* Google Play requires the account-deletion URL be reachable without
                signing in — the footer is the one place a reviewer will look. */}
            <Link href="/delete-account" className="hover:text-fg transition-colors">
              Delete account
            </Link>
            <Link href="/licenses" className="hover:text-fg transition-colors">
              Licenses
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-fg transition-colors">
              Contact
            </a>
          </div>
          <p className="text-sm">© 2026 GameExplorer</p>
        </footer>
      </div>
    </div>
  );
}

// Game Card Component
function GameCard({
  game,
  isHovered,
}: {
  game: GameCatalogEntry;
  isHovered: boolean;
}) {
  // Jewel-tone gradient re-toned to the steel+gold scheme, deepened toward the
  // base so it reads as a rich surface, not a flat saturated rectangle. The card
  // stays dark in every theme (the label on it is static white), so it deepens
  // toward the theme's own shade — mixing warm walnut into a cold navy muddies it.
  const gradient = `linear-gradient(135deg, var(--c-game-${game.accent}) 0%, color-mix(in srgb, var(--c-game-${game.accent}) 50%, var(--c-game-card-shade, #0b1120)) 100%)`;
  // Keyed off the accent rather than chained, because the chain this replaced
  // ended in an `else` that meant "reversi" — so Go, added later, hovered lime.
  // A Record makes the next game a compile error instead of a silent wrong glow.
  // Written out in full rather than interpolated: Tailwind only emits classes it
  // can see as complete literals in the source.
  const glowClass = GAME_CARD_GLOW[game.accent];

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border border-white/10 surface-raised hover-lift
        ${glowClass}
        ${game.available ? 'cursor-pointer' : 'opacity-60'}
      `}
      style={{ backgroundImage: gradient }}
    >
      {/* Top-lit sheen */}
      <div className="absolute inset-x-0 top-0 h-px bg-white/20" />

      {/* Content */}
      <div className="relative p-8 h-64 flex flex-col justify-between">
        {/* Icon */}
        <div
          className="text-8xl text-center mb-4 flex items-center justify-center transition-transform duration-300 drop-shadow-lg"
          style={{ transform: isHovered ? 'scale(1.12) rotate(5deg)' : 'scale(1)' }}
        >
          <GameIcon game={game.id} />
        </div>

        {/* Text — static light on the saturated per-game card. */}
        <div className="text-white">
          <h3 className="text-2xl font-bold mb-2">{game.name}</h3>
          <p className="text-white/80 text-sm">{game.blurb}</p>
        </div>

        {/* Status Badge */}
        {!game.available && (
          <div className="absolute top-4 right-4 bg-surface/80 backdrop-blur-sm text-fg px-3 py-1 rounded-full text-xs font-semibold">
            Coming Soon
          </div>
        )}
      </div>
    </div>
  );
}
