'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function CheckersLandingPage() {
  const [hoveredMode, setHoveredMode] = useState<string | null>(null);
  useAuth();

  const gameModes = [
    {
      id: 'bot',
      title: 'Play vs Bot',
      description: 'Challenge AI opponents from beginner to near-perfect play',
      icon: '🤖',
      href: '/checkers/bot',
      gradient: 'from-blue-500 to-cyan-500',
      available: true,
    },
    {
      id: 'training',
      title: 'Training Mode',
      description: 'Rated games against a bot matched to your skill level',
      icon: '🎯',
      href: '/checkers/training',
      gradient: 'from-amber-500 to-orange-500',
      available: true,
    },
    {
      id: 'multiplayer',
      title: 'Online Multiplayer',
      description: 'Play against other players around the world',
      icon: '🌐',
      href: '/checkers/multiplayer',
      gradient: 'from-purple-500 to-pink-500',
      available: false,
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 pt-16">
      <div className="container mx-auto px-4 pt-8">
        <Link
          href="/"
          className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors group"
        >
          <svg className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>

      <div className="container mx-auto px-4 py-12 md:py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-linear-to-br from-amber-100 to-amber-200 dark:from-amber-900 dark:to-amber-800 mb-6 shadow-lg">
            <span className="text-4xl">🔴</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-slate-50 mb-4">
            Play Checkers
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Classic 8×8 English draughts — mandatory captures, king promotions, multi-jump chains
          </p>
        </div>

        {/* Game modes */}
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                      shadow-lg hover:shadow-2xl transition-all duration-300
                      ${hoveredMode === mode.id ? 'scale-105 border-transparent' : ''}
                    `}>
                      <div className={`absolute inset-0 bg-linear-to-br ${mode.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                      <div className="relative z-10">
                        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4 bg-linear-to-br ${mode.gradient} shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300`}>
                          <span className="text-4xl">{mode.icon}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-linear-to-r group-hover:from-blue-600 group-hover:to-cyan-600 dark:group-hover:from-blue-400 dark:group-hover:to-cyan-400 transition-all">
                          {mode.title}
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">{mode.description}</p>
                        <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium text-sm">
                          <span className="group-hover:mr-2 transition-all">Start Playing</span>
                          <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl p-8 h-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-lg opacity-60 cursor-not-allowed">
                    <div className="relative z-10">
                      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4 bg-linear-to-br ${mode.gradient} opacity-50`}>
                        <span className="text-4xl">{mode.icon}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">{mode.title}</h2>
                      <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">{mode.description}</p>
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

        {/* Rules callout */}
        <div className="max-w-4xl mx-auto mt-16 p-8 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4 text-center">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-50">Mandatory Captures</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">You must jump when a capture is available</div>
            </div>
            <div>
              <div className="text-2xl mb-2">👑</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-50">King Promotion</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Reach the back rank to become a king</div>
            </div>
            <div>
              <div className="text-2xl mb-2">🔗</div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-50">Multi-Jump Chains</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Chain multiple captures in a single turn</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
