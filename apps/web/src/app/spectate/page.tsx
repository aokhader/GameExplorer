'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SpectateLobby() {
  const router = useRouter();
  const [gameId, setGameId] = useState('');

  return (
    <div className="min-h-screen bg-slate-900 text-white pt-16 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">👁 Spectate a Game</h1>
          <Link href="/" className="text-slate-400 hover:text-white text-sm">← Home</Link>
        </div>
        <p className="text-sm text-slate-400 mb-4">Enter a live game ID to watch the match in real time.</p>
        <div className="flex gap-2">
          <input value={gameId} onChange={e => setGameId(e.target.value.trim())}
            onKeyDown={e => e.key === 'Enter' && gameId && router.push(`/spectate/${gameId}`)}
            placeholder="game id…"
            className="flex-1 bg-slate-700 rounded px-3 py-2 outline-none" />
          <button onClick={() => gameId && router.push(`/spectate/${gameId}`)} disabled={!gameId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded font-semibold">Watch</button>
        </div>
      </div>
    </div>
  );
}
