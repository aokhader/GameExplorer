'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function HomePage() {
  const [hoveredGame, setHoveredGame] = useState<string | null>(null);

  const games = [
    {
      id: 'chess',
      name: 'Chess',
      description: 'The classic strategy game. Checkmate your opponent!',
      icon: '♔',
      color: 'from-blue-500 to-blue-700',
      available: true,
      path: '/chess',
    },
    {
      id: 'checkers',
      name: 'Checkers',
      description: 'Jump your way to victory in this classic board game.',
      icon: '⚫',
      color: 'from-red-500 to-red-700',
      available: false,
      path: '/checkers',
    },
    {
      id: 'reversi',
      name: 'Reversi',
      description: 'Flip the board to your color. Strategic and fast-paced!',
      icon: '⚪',
      color: 'from-green-500 to-green-700',
      available: false,
      path: '/reversi',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-4 animate-fade-in">
            GameExplorer
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-8">
            Classic board games, reimagined for the modern web
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/chess"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105"
            >
              Play Now
            </Link>
            <a
              href="#games"
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105"
            >
              Browse Games
            </a>
          </div>
        </div>

        {/* Game Cards */}
        <div id="games" className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-12">
            Choose Your Game
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {games.map((game) => (
              <div
                key={game.id}
                className="relative group"
                onMouseEnter={() => setHoveredGame(game.id)}
                onMouseLeave={() => setHoveredGame(null)}
              >
                {game.available ? (
                  <Link href={game.path}>
                    <GameCard game={game} isHovered={hoveredGame === game.id} />
                  </Link>
                ) : (
                  <div className="cursor-not-allowed">
                    <GameCard game={game} isHovered={hoveredGame === game.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Features Section */}
        <div className="max-w-6xl mx-auto mt-24">
          <h2 className="text-4xl font-bold text-white text-center mb-12">
            Features
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="🎮"
              title="Play vs AI"
              description="Challenge our intelligent bot with adjustable difficulty levels"
            />
            <FeatureCard
              icon="🌐"
              title="Online Multiplayer"
              description="Play against friends or random opponents worldwide"
              comingSoon
            />
            <FeatureCard
              icon="📱"
              title="Mobile Friendly"
              description="Play seamlessly on any device - desktop, tablet, or phone"
            />
            <FeatureCard
              icon="📊"
              title="Track Progress"
              description="View your game history, ratings, and statistics"
              comingSoon
            />
            <FeatureCard
              icon="⚡"
              title="Real-time"
              description="Lightning-fast gameplay with instant move validation"
            />
            <FeatureCard
              icon="🎨"
              title="Beautiful UI"
              description="Clean, modern interface with smooth animations"
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-24 text-center text-slate-400">
          <p className="mb-4">Built with Next.js, TypeScript, and React</p>
          <p className="text-sm">© 2024 GameExplorer. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}

// Game Card Component
function GameCard({ 
  game, 
  isHovered 
}: { 
  game: {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    available: boolean;
  };
  isHovered: boolean;
}) {
  return (
    <div
      className={`
        relative overflow-hidden rounded-xl shadow-2xl
        transform transition-all duration-300
        ${isHovered ? 'scale-105 shadow-3xl' : 'scale-100'}
        ${game.available ? 'cursor-pointer' : 'opacity-60'}
      `}
    >
      {/* Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-90`} />
      
      {/* Content */}
      <div className="relative p-8 h-64 flex flex-col justify-between">
        {/* Icon */}
        <div className="text-8xl text-center mb-4 transform transition-transform duration-300"
             style={{ transform: isHovered ? 'scale(1.1) rotate(5deg)' : 'scale(1)' }}>
          {game.icon}
        </div>

        {/* Text */}
        <div className="text-white">
          <h3 className="text-2xl font-bold mb-2">{game.name}</h3>
          <p className="text-slate-100 text-sm">{game.description}</p>
        </div>

        {/* Status Badge */}
        {!game.available && (
          <div className="absolute top-4 right-4 bg-slate-900 text-white px-3 py-1 rounded-full text-xs font-semibold">
            Coming Soon
          </div>
        )}

        {/* Hover Effect */}
        {game.available && (
          <div
            className={`
              absolute inset-0 bg-white 
              transition-opacity duration-300
              ${isHovered ? 'opacity-10' : 'opacity-0'}
            `}
          />
        )}
      </div>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon,
  title,
  description,
  comingSoon = false,
}: {
  icon: string;
  title: string;
  description: string;
  comingSoon?: boolean;
}) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700 hover:border-slate-500 transition-colors">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">
        {title}
        {comingSoon && (
          <span className="ml-2 text-xs bg-purple-600 text-white px-2 py-1 rounded-full">
            Soon
          </span>
        )}
      </h3>
      <p className="text-slate-300">{description}</p>
    </div>
  );
}