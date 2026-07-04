'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublicProfile, getGames, getUserRatings, supabase } from '@gameexplorer/db';
import type { AuthUser, Profile, GameListItem, UserRating, GameType } from '@gameexplorer/db';
import { useRouter } from 'next/navigation';
import { BlockedPlayers } from '@/components/multiplayer/BlockedPlayers';
import { Skeleton } from '@/components/ui';

type Tab = 'all' | GameType;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function relativeTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

// Human-readable label for how a game ended. Set on multiplayer games; bot/legacy
// rows have no end_reason and simply omit it.
const END_REASON_LABELS: Record<string, string> = {
  checkmate: 'checkmate', stalemate: 'stalemate', flag: 'on time',
  resign: 'resignation', draw_agreement: 'agreement', fifty_move: 'fifty-move rule',
  repetition: 'repetition', disconnect: 'disconnection', board_full: 'board full',
  no_moves: 'no moves',
};

// Per-game accents from the Arcade Glow design (profile screen): tinted rating
// cards with a matching glow, and an accent color for the big rating numeral.
const GAME_META: Record<GameType, { label: string; icon: string; text: string; card: string }> = {
  chess: {
    label: 'Chess', icon: '♞', text: 'text-[#7db1ff]',
    card: 'bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(255,255,255,0.02))] border-[rgba(59,130,246,0.35)] [box-shadow:0_0_30px_-16px_rgba(59,130,246,0.7)]',
  },
  checkers: {
    label: 'Checkers', icon: '⛃', text: 'text-[#ff8fc4]',
    card: 'bg-[linear-gradient(180deg,rgba(236,72,153,0.14),rgba(255,255,255,0.02))] border-[rgba(236,72,153,0.35)] [box-shadow:0_0_30px_-16px_rgba(236,72,153,0.7)]',
  },
  reversi: {
    label: 'Reversi', icon: '⚫', text: 'text-[#bef264]',
    card: 'bg-[linear-gradient(180deg,rgba(163,230,53,0.12),rgba(255,255,255,0.02))] border-[rgba(163,230,53,0.32)] [box-shadow:0_0_30px_-16px_rgba(163,230,53,0.6)]',
  },
};

function ratingDelta(game: GameListItem): number | null {
  if (game.rating_before == null || game.rating_after == null) return null;
  return game.rating_after - game.rating_before;
}

function ResultBadge({ game }: { game: GameListItem }) {
  const playerWon = game.result === game.player_color;
  const isDraw = game.result === 'draw';
  const label = isDraw ? 'Draw' : playerWon ? 'Win' : 'Loss';
  const colors = isDraw
    ? 'bg-white/10 border-white/15 text-fg-muted'
    : playerWon
    ? 'bg-success/15 border-success/30 text-success-hover'
    : 'bg-danger/10 border-danger/30 text-danger-hover';
  return (
    <span className={`w-14 shrink-0 text-center py-1 rounded-lg border text-xs font-bold uppercase ${colors}`}>
      {label}
    </span>
  );
}

function StatTile({ label, value, valueClass = 'text-fg' }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 sm:p-5">
      <div className={`font-display text-2xl sm:text-3xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs sm:text-sm text-fg-muted mt-0.5">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Pick<Profile, 'id' | 'username' | 'created_at'> | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [chessRating, setChessRating] = useState<UserRating | null>(null);
  const [checkersRating, setCheckersRating] = useState<UserRating | null>(null);
  const [reversiRating, setReversiRating] = useState<UserRating | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/auth/signin');
          return;
        }
        setUser({ id: user.id, email: user.email! });

        const [profileData, gamesData, ratings] = await Promise.all([
          getPublicProfile(user.id),
          getGames(user.id),
          // One query for all three game types instead of three round-trips.
          getUserRatings(user.id, ['chess', 'checkers', 'reversi']),
        ]);

        setProfile(profileData);
        setGames(gamesData);
        setChessRating(ratings.chess);
        setCheckersRating(ratings.checkers);
        setReversiRating(ratings.reversi);
        setLoading(false);
    }

    loadUser();
  }, [router]);

  if (loading) {
    return (
      <div className="relative min-h-screen pt-16 page-glow-profile">
        <div className="container mx-auto px-4 pt-8 pb-8 max-w-5xl">
          {/* Avatar + username */}
          <div className="flex items-center gap-5 mb-8 mt-8">
            <Skeleton className="w-20 h-20 rounded-3xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          {/* Summary stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-7">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          {/* Per-game rating cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
          {/* Recent games card */}
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return null; // redirect is in flight
  }

  const wins = games.filter(g => g.result === g.player_color).length;
  const winRate = games.length > 0 ? Math.round((wins / games.length) * 100) : 0;

  // Streaks — games arrive newest-first; a run of consecutive wins is the same
  // set scanned in either direction, so best streak works on the array as-is.
  let currentStreak = 0;
  for (const g of games) {
    if (g.result === g.player_color) currentStreak++;
    else break;
  }
  let bestStreak = 0;
  let run = 0;
  for (const g of games) {
    run = g.result === g.player_color ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const ratings: { type: GameType; rating: UserRating | null }[] = [
    { type: 'chess',    rating: chessRating },
    { type: 'checkers', rating: checkersRating },
    { type: 'reversi',  rating: reversiRating },
  ];

  const topRating = Math.max(0, ...ratings.map(r => r.rating?.peak_rating ?? 0));

  // Rating movement from the most recent rated game of each type.
  const deltaFor = (type: GameType): number | null => {
    const g = games.find(g => (g.game_type ?? 'chess') === type && ratingDelta(g) !== null);
    return g ? ratingDelta(g) : null;
  };

  const chessGames    = games.filter(g => !g.game_type || g.game_type === 'chess');
  const checkersGames = games.filter(g => g.game_type === 'checkers');
  const reversiGames  = games.filter(g => g.game_type === 'reversi');

  const tabGames: Record<Tab, GameListItem[]> = {
    all:      games,
    chess:    chessGames,
    checkers: checkersGames,
    reversi:  reversiGames,
  };

  const visibleGames = tabGames[activeTab];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all',      label: 'All' },
    { id: 'chess',    label: 'Chess' },
    { id: 'checkers', label: 'Checkers' },
    { id: 'reversi',  label: 'Reversi' },
  ];

  return (
    <div className="relative min-h-screen pt-16 page-glow-profile">
      <div className="container mx-auto px-4 pt-8 pb-8 max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors text-sm mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Home
        </Link>

        {/* Header — avatar, identity, settings */}
        <div className="flex items-center gap-5 mb-8 flex-wrap">
          <div className="w-20 h-20 rounded-3xl bg-[linear-gradient(160deg,#3b82f6,#8b5cf6)] [box-shadow:0_0_40px_-8px_rgba(99,102,241,0.8)] flex items-center justify-center text-white font-display text-4xl font-bold shrink-0 select-none">
            {profile.username[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="font-display text-3xl font-bold text-fg mb-0.5">
              {profile.username}
            </h1>
            <p className="text-sm text-fg-muted">
              Member since {formatDate(profile.created_at)}
              {currentStreak >= 2 && ` · 🔥 ${currentStreak}-game win streak`}
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-5 py-2.5 text-sm font-bold text-fg transition-colors"
          >
            Settings
          </Link>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-7">
          <StatTile label="Games played" value={games.length} />
          <StatTile label="Win rate" value={`${winRate}%`} valueClass="text-success-hover" />
          <StatTile label="Best streak" value={bestStreak} />
          <StatTile label="Top rating" value={topRating > 0 ? topRating : '—'} valueClass="text-[#f0d589]" />
        </div>

        {/* Per-game ratings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
          {ratings.map(({ type, rating }) => {
            const meta = GAME_META[type];
            const delta = deltaFor(type);
            const rated = rating !== null && rating.games_played > 0;
            return (
              <div key={type} className={`rounded-2xl border p-5 ${meta.card}`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-2xl select-none">{meta.icon}</span>
                  <span className="font-display font-bold text-fg">{meta.label}</span>
                </div>
                {rated ? (
                  <>
                    <div className={`font-display text-3xl font-bold tabular-nums ${meta.text}`}>
                      {rating.rating}
                      {delta !== null && delta !== 0 && (
                        <span className={`ml-2 text-sm font-semibold ${delta > 0 ? 'text-success-hover' : 'text-danger-hover'}`}>
                          {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-fg-muted mt-1.5">
                      {rating.games_played} game{rating.games_played !== 1 ? 's' : ''} · {rating.wins}W / {rating.losses}L / {rating.draws}D
                    </div>
                    <div className="text-xs text-fg-subtle mt-0.5">
                      Peak {rating.peak_rating}
                      {rating.games_played < 30 && (
                        <span className="text-warning-hover"> · Provisional ({30 - rating.games_played} left)</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`font-display text-3xl font-bold ${meta.text} opacity-50`}>—</div>
                    <div className="text-[13px] text-fg-muted mt-1.5">No rated games yet</div>
                    <Link href={`/${type}/training`} className={`text-xs hover:underline ${meta.text}`}>
                      Play training →
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Recent games */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <span className="font-display font-bold text-fg">Recent games</span>
            {/* Filter pills */}
            <div className="flex items-center gap-1.5">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[rgba(205,164,63,0.18)] text-[#f0d589]'
                      : 'text-fg-muted hover:text-fg hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {visibleGames.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2 select-none">
                {activeTab === 'checkers' ? '⛃' : activeTab === 'reversi' ? '⚫' : '♞'}
              </div>
              <p className="text-fg-muted text-sm">
                {activeTab === 'all' ? 'No games played yet' : `No ${activeTab} games yet`}
              </p>
              <Link
                href={activeTab === 'checkers' ? '/checkers/bot' : activeTab === 'reversi' ? '/reversi/bot' : '/chess/bot'}
                className="mt-3 inline-block text-accent hover:underline text-sm"
              >
                Play your first {activeTab === 'all' ? '' : activeTab + ' '}game
              </Link>
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleGames.map((game, i) => {
                const gameType = (game.game_type ?? 'chess') as GameType;
                const meta = GAME_META[gameType];
                const replayHref = gameType === 'chess' ? `/chess/replays/${game.id}` : null;
                const delta = ratingDelta(game);

                const detail = [
                  meta.label,
                  game.difficulty,
                  `as ${game.player_color === 'white' ? 'White' : 'Black'}`,
                  game.end_reason ? (END_REASON_LABELS[game.end_reason] ?? game.end_reason) : null,
                ].filter(Boolean).join(' · ');

                const inner = (
                  <>
                    <ResultBadge game={game} />
                    <span className="text-xl w-7 text-center shrink-0 select-none">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-fg capitalize truncate">
                        vs {game.opponent}
                      </div>
                      <div className="text-xs text-fg-muted capitalize truncate">{detail}</div>
                    </div>
                    {delta !== null && delta !== 0 && (
                      <span className={`font-display font-bold text-sm shrink-0 tabular-nums ${delta > 0 ? 'text-success-hover' : 'text-danger-hover'}`}>
                        {delta > 0 ? '+' : '−'}{Math.abs(delta)}
                      </span>
                    )}
                    <span className="text-xs text-fg-subtle w-16 text-right shrink-0">
                      {relativeTime(game.created_at)}
                    </span>
                    {replayHref && (
                      <svg className="w-4 h-4 text-fg-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </>
                );

                const rowClass = `flex items-center gap-3.5 py-3 ${
                  i < visibleGames.length - 1 ? 'border-b border-white/[0.06]' : ''
                }`;

                return replayHref ? (
                  <Link
                    key={game.id}
                    href={replayHref}
                    className={`${rowClass} -mx-2 px-2 rounded-lg hover:bg-white/5 transition-colors`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={game.id} className={rowClass}>
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Blocked players management */}
        <BlockedPlayers />
      </div>
    </div>
  );
}
