'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { GradientText, Reveal } from '@/components/visual';
import { GameIcon } from '@/components/game/GameIcon';

type GameMode = {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  gradient: string;
  available: boolean;
  /** Card action label; defaults to "Start Playing". */
  cta?: string;
};

export default function ChessLandingPage() {
  useAuth(); // initialise auth store

  const gameModes: GameMode[] = [
    {
      id: 'bot',
      title: 'Play vs Bot',
      description: 'Challenge AI opponents at different skill levels',
      icon: '🤖',
      href: '/chess/bot',
      gradient: 'from-info to-info-hover',
      available: true,
    },
    {
      id: 'training',
      title: 'Training Mode',
      description: 'Play rated games against a bot matched to your skill level',
      icon: '🎯',
      href: '/chess/training',
      gradient: 'from-success to-success-hover',
      available: true,
    },
    {
      id: 'puzzles',
      title: 'Puzzles',
      description: 'Solve tactics one move at a time — no clock, no opponent',
      icon: '🧩',
      href: '/chess/puzzles',
      gradient: 'from-info to-info-hover',
      available: true,
      cta: 'Solve Puzzles',
    },
    {
      id: 'replays',
      title: 'Game Replays',
      description: 'Review and replay your past games',
      icon: '📼',
      href: '/chess/replays',
      gradient: 'from-accent to-accent-hover',
      available: true,
    },
    {
      id: 'analysis',
      title: 'Analysis Board',
      description: 'Build any position and get Stockfish engine analysis',
      icon: '🔍',
      href: '/chess/analysis',
      gradient: 'from-warning to-danger',
      available: true,
    },
    {
      id: 'multiplayer',
      title: 'Online Multiplayer',
      description: 'Play against other players around the world',
      icon: '🌐',
      href: '/chess/play',
      gradient: 'from-accent to-info',
      available: true,
    },
    {
      id: 'local',
      title: 'Local 2-Player',
      description: 'Play with a friend on the same device',
      icon: '👥',
      href: '/chess/local',
      gradient: 'from-success to-success-hover',
      available: true,
    },
    {
      id: 'learn',
      title: 'How to Play',
      description: 'New to chess? Learn the rules and pick up beginner tips in five minutes',
      icon: '🎓',
      href: '/chess/learn',
      gradient: 'from-info to-info-hover',
      available: true,
      cta: 'Start Learning',
    },
  ];

  return (
    <div className="relative min-h-screen pt-16">
      {/* Header */}
      <div className="container mx-auto px-4 pt-8">
        <Link
          href="/"
          className="inline-flex items-center text-fg-muted hover:text-fg transition-colors group"
        >
          <svg className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 md:py-20">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Reveal className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-alt border border-border mb-6 motion-safe:animate-float [box-shadow:var(--shadow-glow-chess)]">
            <span className="text-5xl inline-flex items-center"><GameIcon game="chess" /></span>
          </Reveal>
          <Reveal as="h1" delay={80} className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
            <GradientText>Play Chess</GradientText>
          </Reveal>
          <Reveal as="p" delay={160} className="text-xl text-fg-muted max-w-2xl mx-auto">
            Choose your preferred game mode and start playing
          </Reveal>
        </div>

        {/* Game Modes Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gameModes.map((mode, i) => (
              <Reveal
                key={mode.id}
                delay={i * 70}
                className="group relative"
              >
                {mode.available ? (
                  <Link href={mode.href}>
                    <div className="relative overflow-hidden rounded-2xl p-8 h-full bg-surface-alt border border-border surface-raised hover-lift group-hover:[box-shadow:var(--shadow-glow-chess)]">
                      <div className={`absolute inset-0 bg-linear-to-br ${mode.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                      <div className="relative z-10">
                        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4 bg-linear-to-br ${mode.gradient} shadow-md group-hover:scale-110 transition-transform duration-300`}>
                          <span className="text-4xl">{mode.icon}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-fg mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-accent group-hover:to-accent-hover transition-all">
                          {mode.title}
                        </h2>
                        <p className="text-fg-muted mb-4">
                          {mode.description}
                        </p>
                        <div className="flex items-center text-accent font-medium">
                          <span className="group-hover:mr-2 transition-all">{mode.cta ?? 'Start Playing'}</span>
                          <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl p-8 h-full bg-surface-alt border border-border shadow-lg opacity-60 cursor-not-allowed">
                    <div className="relative z-10">
                      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4 bg-linear-to-br ${mode.gradient} opacity-50`}>
                        <span className="text-4xl">{mode.icon}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-fg mb-2">
                        {mode.title}
                      </h2>
                      <p className="text-fg-muted mb-4">
                        {mode.description}
                      </p>
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-surface-muted text-fg-muted text-sm font-medium">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Stats Section */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-fg mb-1">3</div>
            <div className="text-sm text-fg-muted">Difficulty Levels</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-fg mb-1">2500+</div>
            <div className="text-sm text-fg-muted">Bot ELO Rating</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-fg mb-1">∞</div>
            <div className="text-sm text-fg-muted">Games to Play</div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-16 p-8 rounded-2xl glass">
          <h3 className="text-xl font-semibold text-fg mb-4 text-center">
            Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-sm font-medium text-fg">Fast & Responsive</div>
              <div className="text-xs text-fg-muted mt-1">Instant move validation</div>
            </div>
            <div>
              <div className="text-2xl mb-2">🎨</div>
              <div className="text-sm font-medium text-fg">Beautiful Interface</div>
              <div className="text-xs text-fg-muted mt-1">Clean, modern design</div>
            </div>
            <div>
              <div className="text-2xl mb-2">📱</div>
              <div className="text-sm font-medium text-fg">Mobile Friendly</div>
              <div className="text-xs text-fg-muted mt-1">Play on any device</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
