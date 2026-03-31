// Placeholder till game is implementedimport Link from 'next/link';
import Link from 'next/link';

export default function CheckersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl mb-4">⚫</h1>
        <h2 className="text-4xl font-bold text-white mb-4">Checkers</h2>
        <p className="text-slate-300 mb-8">Coming Soon!</p>
        <Link href="/" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          Back to Home
        </Link>
      </div>
    </div>
  );
}