'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@gameexplorer/db';

export default function ChessLandingPage() {
  const [hoveredMode, setHoveredMode] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUsername(user.email?.split('@')[0] ?? null);
    }

    loadUser();
  }, []);

  const gameModes = [
    {
      id: 'bot',
      title: 'Play vs Bot',
      description: 'Challenge AI opponents at different skill levels',
      icon: '🤖',
      href: '/chess/bot',
      gradient: 'from-blue-500 to-cyan-500',
      available: true,
    },
    {
      id: 'replays',
      title: 'Game Replays',
      description: 'Review and replay your past games',
      icon: '📼',
      href: '/chess/replays',
      gradient: 'from-amber-500 to-orange-500',
      available: true,
    },
    {
      id: 'analysis',
      title: 'Analysis Board',
      description: 'Build any position and get Stockfish engine analysis',
      icon: '🔍',
      href: '/chess/analysis',
      gradient: 'from-orange-500 to-red-500',
      available: true,
    },
    {
      id: 'multiplayer',
      title: 'Online Multiplayer',
      description: 'Play against other players around the world',
      icon: '🌐',
      href: '/chess/multiplayer',
      gradient: 'from-purple-500 to-pink-500',
      available: false,
    },
    {
      id: 'local',
      title: 'Local 2-Player',
      description: 'Play with a friend on the same device',
      icon: '👥',
      href: '/chess/local',
      gradient: 'from-green-500 to-emerald-500',
      available: false,
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="container mx-auto px-4 pt-8 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
        >
          <svg className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        {/* Profile / Sign in button */}
        {username ? (
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {username[0].toUpperCase()}
            </div>
            {username}
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            Sign in
          </Link>
        )}
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 md:py-20">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-linear-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 mb-6 shadow-lg">
            <span className="text-5xl">♔</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-slate-50 mb-4">
            Play Chess
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
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
                      bg-white dark:bg-slate-800
                      border-2 border-slate-200 dark:border-slate-700
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
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-blue-600 group-hover:to-cyan-600 dark:group-hover:from-blue-400 dark:group-hover:to-cyan-400 transition-all">
                          {mode.title}
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 mb-4">
                          {mode.description}
                        </p>
                        <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
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
                    bg-white dark:bg-slate-800
                    border-2 border-slate-200 dark:border-slate-700
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
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                        {mode.title}
                      </h2>
                      <p className="text-slate-600 dark:text-slate-400 mb-4">
                        {mode.description}
                      </p>
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium">
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
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">3</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Difficulty Levels</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">2500+</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Bot ELO Rating</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-1">∞</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Games to Play</div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-16 p-8 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4 text-center">
            Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-50">Fast & Responsive</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Instant move validation</div>
            </div>
            <div>
              <div className="text-2xl mb-2">🎨</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-50">Beautiful Interface</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Clean, modern design</div>
            </div>
            <div>
              <div className="text-2xl mb-2">📱</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-50">Mobile Friendly</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Play on any device</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}