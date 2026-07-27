'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GradientText, Reveal } from '@/components/visual';

type GameMode = {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  gradient: string;
  available: boolean;
  cta?: string;
};

const gameModes: GameMode[] = [
  {
    id: 'bot',
    title: 'Play vs Bots',
    description: 'Take on up to five AI barons, from cautious to ruthless',
    icon: '🤖',
    href: '/liquidate/bot',
    gradient: 'from-info to-info-hover',
    available: true,
  },
  {
    id: 'local',
    title: 'Pass & Play',
    description: 'Two to six players sharing one device, taking turns',
    icon: '👥',
    href: '/liquidate/local',
    gradient: 'from-accent to-accent-hover',
    available: true,
  },
  {
    id: 'multiplayer',
    title: 'Online Multiplayer',
    description: 'Play against barons around the world',
    icon: '🌐',
    href: '/liquidate/play',
    gradient: 'from-accent to-info',
    available: false,
  },
  {
    id: 'learn',
    title: 'How to Play',
    description: 'Rents, colonies, auctions and bankruptcy — the rules in two minutes',
    icon: '🎓',
    href: '/liquidate/learn',
    gradient: 'from-success to-success-hover',
    available: true,
    cta: 'Start Learning',
  },
];

export default function LiquidateLandingPage() {
  const [, setHoveredMode] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen pt-16 page-glow-liquidate">
      <div className="container mx-auto px-4 pt-8">
        <Link
          href="/"
          className="group inline-flex items-center text-fg-muted transition-colors hover:text-fg"
        >
          <svg
            className="mr-2 h-5 w-5 transition-transform group-hover:-translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>

      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="mb-16 text-center">
          <Reveal className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-border bg-surface-alt motion-safe:animate-float [box-shadow:var(--shadow-glow-liquidate)]">
            <span className="text-4xl">🪐</span>
          </Reveal>
          <Reveal as="h1" delay={80} className="mb-4 text-5xl font-bold tracking-tight md:text-6xl">
            <GradientText>Liquidate</GradientText>
          </Reveal>
          <Reveal as="p" delay={160} className="mx-auto max-w-2xl text-xl text-fg-muted">
            Claim planets, build colonies, and squeeze your rivals out of the sector — a
            cosmic property-trading game for 2–6 players
          </Reveal>
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {gameModes.map((mode, i) => (
              <Reveal
                key={mode.id}
                delay={i * 80}
                onMouseEnter={() => setHoveredMode(mode.id)}
                onMouseLeave={() => setHoveredMode(null)}
                className="group relative"
              >
                {mode.available ? (
                  <Link href={mode.href}>
                    <div className="surface-raised hover-lift relative h-full overflow-hidden rounded-2xl border border-border bg-surface-alt p-8 group-hover:[box-shadow:var(--shadow-glow-liquidate)]">
                      <div
                        className={`absolute inset-0 bg-linear-to-br ${mode.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-10`}
                      />
                      <div className="relative z-10">
                        <div
                          className={`mb-4 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br ${mode.gradient} shadow-md transition-transform duration-300 group-hover:scale-110`}
                        >
                          <span className="text-4xl">{mode.icon}</span>
                        </div>
                        <h2 className="mb-2 text-2xl font-bold text-fg transition-all group-hover:bg-linear-to-r group-hover:from-accent group-hover:to-accent-hover group-hover:bg-clip-text group-hover:text-transparent">
                          {mode.title}
                        </h2>
                        <p className="mb-4 text-sm text-fg-muted">{mode.description}</p>
                        <div className="flex items-center text-sm font-medium text-accent">
                          <span className="transition-all group-hover:mr-2">
                            {mode.cta ?? 'Start Playing'}
                          </span>
                          <svg
                            className="h-4 w-4 transform opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="relative h-full cursor-not-allowed overflow-hidden rounded-2xl border border-border bg-surface-alt p-8 opacity-60 shadow-lg">
                    <div className="relative z-10">
                      <div
                        className={`mb-4 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br ${mode.gradient} opacity-50`}
                      >
                        <span className="text-4xl">{mode.icon}</span>
                      </div>
                      <h2 className="mb-2 text-2xl font-bold text-fg">{mode.title}</h2>
                      <p className="mb-4 text-sm text-fg-muted">{mode.description}</p>
                      <div className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-fg-muted">
                        <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Coming Soon
                      </div>
                    </div>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>

        <div className="glass mx-auto mt-16 max-w-4xl rounded-2xl p-8">
          <h3 className="mb-4 text-center text-xl font-semibold text-fg">How It Works</h3>
          <div className="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
            <div>
              <div className="mb-2 text-2xl">🎲</div>
              <div className="text-sm font-medium text-fg">Roll and Claim</div>
              <div className="mt-1 text-xs text-fg-muted">
                Buy the planet you land on, or send it to auction
              </div>
            </div>
            <div>
              <div className="mb-2 text-2xl">🏗️</div>
              <div className="text-sm font-medium text-fg">Corner a System</div>
              <div className="mt-1 text-xs text-fg-muted">
                Hold every planet in a system to double rent and build colonies
              </div>
            </div>
            <div>
              <div className="mb-2 text-2xl">💥</div>
              <div className="text-sm font-medium text-fg">Last One Solvent</div>
              <div className="mt-1 text-xs text-fg-muted">
                Mortgage, trade and squeeze until only one baron is left
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
