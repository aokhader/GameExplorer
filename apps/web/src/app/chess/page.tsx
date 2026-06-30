'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function ChessLandingPage() {
  const [hoveredMode, setHoveredMode] = useState<string | null>(null);
  useAuth(); // initialise auth store

  const gameModes = [
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
      available: false,
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-surface-hover via-surface-hover to-surface-hover dark:from-surface dark:via-surface dark:to-surface-alt pt-16">
      {/* Header */}
      <div className="container mx-auto px-4 pt-8">
        <Link
          href="/"
          className="inline-flex items-center text-fg-subtle dark:text-fg-muted hover:text-fg-subtle dark:hover:text-fg transition-colors group"
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-linear-to-br from-surface-hover to-surface-hover dark:from-surface-muted dark:to-surface-alt mb-6 shadow-lg">
            <span className="text-5xl">♔</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-fg-subtle dark:text-fg mb-4">
            Play Chess
          </h1>
          <p className="text-xl text-fg-subtle dark:text-fg-muted max-w-2xl mx-auto">
            Choose your preferred game mode and start playing
          </p>
        </div>

        {/* Game Modes Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gameModes.map((mode) => (
              <div
                key={mode.id}
                onMouseEnter={() => setHoveredMode(mode.id)}
                onMouseLeave={() => setHoveredMode(null)}
                className="group relative"
              >
                {mode.available ? (
                  <Link href={mode.href}>
                    <div className={`
                      relative overflow-hidden rounded-2xl p-8 h-full
                      bg-white dark:bg-surface-alt
                      border-2 border-border-strong dark:border-border
                      shadow-lg hover:shadow-2xl
                      transition-all duration-300
                      ${hoveredMode === mode.id ? 'scale-105 border-transparent' : ''}
                    `}>
                      <div className={`
                        absolute inset-0 bg-linear-to-br ${mode.gradient} opacity-0
                        group-hover:opacity-10 transition-opacity duration-300
                      `} />
                      <div className="relative z-10">
                        <div className={`
                          inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4
                          bg-linear-to-br ${mode.gradient}
                          shadow-md group-hover:shadow-lg group-hover:scale-110
                          transition-all duration-300
                        `}>
                          <span className="text-4xl">{mode.icon}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-fg-subtle dark:text-fg mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-accent group-hover:to-accent-hover transition-all">
                          {mode.title}
                        </h2>
                        <p className="text-fg-subtle dark:text-fg-muted mb-4">
                          {mode.description}
                        </p>
                        <div className="flex items-center text-accent dark:text-accent font-medium">
                          <span className="group-hover:mr-2 transition-all">Start Playing</span>
                          <svg
                            className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1"
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
                  <div className={`
                    relative overflow-hidden rounded-2xl p-8 h-full
                    bg-white dark:bg-surface-alt
                    border-2 border-border-strong dark:border-border
                    shadow-lg opacity-60
                    cursor-not-allowed
                  `}>
                    <div className="relative z-10">
                      <div className={`
                        inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4
                        bg-linear-to-br ${mode.gradient} opacity-50
                      `}>
                        <span className="text-4xl">{mode.icon}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-fg-subtle dark:text-fg mb-2">
                        {mode.title}
                      </h2>
                      <p className="text-fg-subtle dark:text-fg-muted mb-4">
                        {mode.description}
                      </p>
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-surface-hover dark:bg-surface-muted text-fg-subtle dark:text-fg-muted text-sm font-medium">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Coming Soon
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats Section */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-fg-subtle dark:text-fg mb-1">3</div>
            <div className="text-sm text-fg-subtle dark:text-fg-muted">Difficulty Levels</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-fg-subtle dark:text-fg mb-1">2500+</div>
            <div className="text-sm text-fg-subtle dark:text-fg-muted">Bot ELO Rating</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-fg-subtle dark:text-fg mb-1">∞</div>
            <div className="text-sm text-fg-subtle dark:text-fg-muted">Games to Play</div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-16 p-8 rounded-2xl bg-white/50 dark:bg-surface-alt/50 backdrop-blur-sm border border-border-strong dark:border-border">
          <h3 className="text-xl font-semibold text-fg-subtle dark:text-fg mb-4 text-center">
            Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-sm font-medium text-fg-subtle dark:text-fg">Fast & Responsive</div>
              <div className="text-xs text-fg-subtle dark:text-fg-muted mt-1">Instant move validation</div>
            </div>
            <div>
              <div className="text-2xl mb-2">🎨</div>
              <div className="text-sm font-medium text-fg-subtle dark:text-fg">Beautiful Interface</div>
              <div className="text-xs text-fg-subtle dark:text-fg-muted mt-1">Clean, modern design</div>
            </div>
            <div>
              <div className="text-2xl mb-2">📱</div>
              <div className="text-sm font-medium text-fg-subtle dark:text-fg">Mobile Friendly</div>
              <div className="text-xs text-fg-subtle dark:text-fg-muted mt-1">Play on any device</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}