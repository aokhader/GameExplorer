'use client';

import React from 'react';
import Link from 'next/link';
import { useGameSession } from '@gameexplorer/client';
import { ABORT_MOVE_LIMIT } from '@gameexplorer/shared';
import type { TimeControl } from '@gameexplorer/shared';
import { Button, Card, Modal, Input, useToast } from '@/components/ui';
import { GradientText } from '@/components/visual';
import { cn } from '@/lib/utils';
import { SpectateLinkButton } from '@/components/multiplayer/SpectateLinkButton';
import { EmoteBar } from '@/components/multiplayer/EmoteBar';
import { OpponentMenu } from '@/components/multiplayer/OpponentMenu';

type GameSession = ReturnType<typeof useGameSession>;

export interface GameLayoutProps {
  session: GameSession;
  /** Page heading on the matchmaking panel, e.g. "Online Chess". */
  title: string;
  /** Where the Back / Exit links point, e.g. "/chess". */
  backHref: string;
  timeControls: { id: TimeControl; label: string; desc: string }[];
  /** The game board element, already wired to the session by the page. */
  board: React.ReactNode;
  /** The move-list rows, rendered by the page (per-game formatting). */
  moveList: React.ReactNode;
  /** Optional content above the opponent bar (e.g. reversi disc-count bar). */
  topExtras?: React.ReactNode;
  /** Whether this game supports draw offers (chess/checkers yes, reversi no). */
  showDraw?: boolean;
  /** Format a clock value for display. */
  clockFormat: (ms: number) => string;
  /** Below this many ms the active clock enters the danger state. */
  lowClockMs?: number;
}

// ── Clock ──────────────────────────────────────────────────────────────────
// The active clock is the focal point (gold). Low time is signalled by color
// AND an icon + aria-live region, so it doesn't rely on color alone (WCAG).
function Clock({
  ms,
  active,
  format,
  lowClockMs,
}: {
  ms: number;
  active: boolean;
  format: (ms: number) => string;
  lowClockMs: number;
}) {
  const danger = active && ms < lowClockMs;
  return (
    <div
      aria-live={danger ? 'assertive' : 'off'}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2 rounded-lg font-mono text-2xl font-bold tabular-nums transition-colors',
        danger
          ? 'bg-danger text-white shadow-[0_0_0_1px_rgba(220,38,38,0.3),0_8px_28px_-6px_rgba(220,38,38,0.5)]'
          : active
            ? 'bg-accent [background-image:var(--gradient-accent)] text-on-accent [box-shadow:var(--shadow-glow-accent)]'
            : 'bg-surface-muted text-fg-muted',
      )}
    >
      {danger && (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-12a.75.75 0 00-1.5 0v4c0 .3.18.57.46.69l2.5 1a.75.75 0 10.58-1.38L10.75 9.5V6z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <span>{format(ms)}</span>
      {danger && <span className="sr-only">Low time</span>}
    </div>
  );
}

// ── Player bar ───────────────────────────────────────────────────────────────
function PlayerBar({
  name,
  rating,
  clock,
}: {
  name: string;
  rating?: number;
  clock: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 glass rounded-lg px-4 py-2">
      <span className="font-semibold truncate">
        {name}
        {rating != null && <span className="text-fg-muted font-normal"> ({rating})</span>}
      </span>
      {clock}
    </div>
  );
}

// ── Matchmaking + invite panel ───────────────────────────────────────────────
function MatchmakingPanel({
  session: s,
  title,
  backHref,
  timeControls,
}: Pick<GameLayoutProps, 'session' | 'title' | 'backHref' | 'timeControls'>) {
  const { toast } = useToast();

  const copyInvite = () => {
    if (!s.inviteUrl) return;
    navigator.clipboard?.writeText(s.inviteUrl);
    toast('Invite link copied', 'success');
  };

  return (
    <Card elevation="raised" className="w-full max-w-md p-6 sm:p-8 [box-shadow:var(--shadow-glow-accent)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight"><GradientText>{title}</GradientText></h1>
        <Link href={backHref} className="text-fg-muted hover:text-fg text-sm transition-colors">
          ← Back
        </Link>
      </div>

      {s.status === 'idle' ? (
        <>
          <p className="text-sm text-fg-muted mb-3">Time Control</p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {timeControls.map((tc) => {
              const selected = s.timeControl === tc.id;
              return (
                <button
                  key={tc.id}
                  onClick={() => s.setTimeControl(tc.id)}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-[44px] p-3 rounded-lg text-left transition-colors border',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    selected
                      ? 'bg-accent-muted border-accent text-fg'
                      : 'bg-surface-muted border-transparent hover:bg-surface-hover text-fg',
                  )}
                >
                  <div className="font-semibold">{tc.label}</div>
                  <div className="text-xs text-fg-muted">{tc.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => s.setRated(!s.rated)}
              role="switch"
              aria-checked={s.rated}
              aria-label="Rated game"
              className={cn(
                'w-11 h-6 rounded-full transition-colors shrink-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-2 ring-offset-surface-alt',
                s.rated ? 'bg-accent' : 'bg-surface-muted',
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform',
                  s.rated && 'translate-x-5',
                )}
              />
            </button>
            <span className="text-sm">{s.rated ? 'Rated' : 'Casual'}</span>
          </div>

          <Button fullWidth size="lg" onClick={s.joinQueue} disabled={!s.connected}>
            {s.connected ? 'Find Game' : s.connectionError ? 'Connection failed' : 'Connecting…'}
          </Button>
          {s.connectionError && !s.connected && (
            <p className="mt-3 text-sm text-danger-hover text-center">{s.connectionError}</p>
          )}

          {/* Challenge a friend */}
          <div className="mt-6 pt-6 border-t border-border">
            {!s.inviteUrl ? (
              <Button
                fullWidth
                size="lg"
                variant="secondary"
                onClick={s.createInvite}
                disabled={!s.connected || s.creating}
                loading={s.creating}
              >
                {s.creating ? 'Creating link…' : 'Play a Friend'}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-fg-muted">Share this link with a friend:</p>
                <div className="flex gap-2 items-end">
                  <Input
                    readOnly
                    value={s.inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 text-xs"
                  />
                  <Button onClick={copyInvite}>Copy</Button>
                </div>
                <p className="text-xs text-fg-subtle">
                  Waiting for your friend to join… (link expires in 10 min)
                </p>
              </div>
            )}
            {s.inviteError && (
              <p className="mt-3 text-sm text-danger-hover text-center">{s.inviteError}</p>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <Spinner />
          <p className="text-lg font-semibold mt-4 mb-1">Finding opponent…</p>
          <p className="text-sm text-fg-muted mb-6">ELO window expands every 15s</p>
          <button
            onClick={s.cancelQueue}
            className="text-sm text-fg-muted hover:text-fg underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded"
          >
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

function Spinner() {
  return (
    <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
  );
}

// ── Game-over / aborted modal ────────────────────────────────────────────────
function GameOverModal({
  session: s,
  backHref,
}: Pick<GameLayoutProps, 'session' | 'backHref'>) {
  const open = s.status === 'ended' && (!!s.endData || s.aborted);
  const endData = s.endData;
  const aborted = s.aborted && !endData;

  const exitClasses =
    'inline-flex items-center justify-center h-12 px-6 flex-1 rounded-lg text-base font-semibold ' +
    'bg-info-muted text-info-hover border border-info/30 hover:bg-info/25 transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 focus-visible:ring-offset-surface-alt';

  return (
    <Modal
      open={open}
      onClose={() => {}}
      dismissable={false}
      size="sm"
      footer={
        <div className="flex gap-3 w-full">
          <Button size="lg" fullWidth onClick={s.playAgain}>
            Play Again
          </Button>
          <Link href={backHref} className={exitClasses}>
            Exit
          </Link>
        </div>
      }
    >
      <div className="text-center">
        {aborted ? (
          <>
            <div className="text-5xl mb-4">🛑</div>
            <h2 className="text-3xl font-bold mb-1">Game Aborted</h2>
            <p className="text-fg-muted">No rating change.</p>
          </>
        ) : endData ? (
          <>
            <div className="text-5xl mb-4">
              {s.myResult === 'win' ? '🏆' : s.myResult === 'loss' ? '😞' : '🤝'}
            </div>
            <h2 className="text-3xl font-bold mb-1">
              {s.myResult === 'win' ? 'You Won!' : s.myResult === 'loss' ? 'You Lost' : 'Draw'}
            </h2>
            <p className="text-fg-muted mb-4 capitalize">{endData.reason.replace(/_/g, ' ')}</p>
            <div className="bg-surface-muted rounded-xl p-4">
              <p className="text-sm text-fg-muted mb-1">Rating change</p>
              <p className="text-2xl font-bold">
                {s.isWhite ? endData.white.ratingAfter : endData.black.ratingAfter}
                <span
                  className={cn(
                    'ml-2 text-lg',
                    (s.isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0
                      ? 'text-success'
                      : 'text-danger-hover',
                  )}
                >
                  {(s.isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? '+' : ''}
                  {s.isWhite ? endData.white.ratingDelta : endData.black.ratingDelta}
                </span>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────
export function GameLayout({
  session: s,
  title,
  backHref,
  timeControls,
  board,
  moveList,
  topExtras,
  showDraw = true,
  clockFormat,
  lowClockMs = 10_000,
}: GameLayoutProps) {
  const oppName = s.opponent?.username ?? 'Opponent';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moveCount = (s.gameState as any)?.moveHistory?.length ?? 0;
  const inGame = s.status === 'active' || s.status === 'ended';

  return (
    <div
      className={cn(
        'relative min-h-dvh text-fg pt-16 flex flex-col items-center px-3 sm:px-4 py-6',
        inGame ? 'justify-start' : 'justify-center',
      )}
    >
      {/* Joining via invite link */}
      {s.accepting && s.status !== 'active' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="text-center">
            <Spinner />
            <p className="text-lg font-semibold mt-4">Joining game…</p>
          </div>
        </div>
      )}

      {/* Matchmaking */}
      {(s.status === 'idle' || s.status === 'queued') && (
        <MatchmakingPanel session={s} title={title} backHref={backHref} timeControls={timeControls} />
      )}

      {/* Game view */}
      {inGame && s.gameState && (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-4 items-start">
          {/* Board column */}
          <div className="flex flex-col gap-2 flex-1 min-w-0 w-full">
            {topExtras}

            <PlayerBar
              name={oppName}
              rating={s.opponent?.rating}
              clock={
                <Clock
                  ms={s.oppClockMs}
                  active={s.activeColor !== s.myColor}
                  format={clockFormat}
                  lowClockMs={lowClockMs}
                />
              }
            />

            {s.opponentGone && (
              <div className="flex items-center justify-center gap-2 bg-warning/15 border border-warning/40 text-warning text-sm rounded-lg px-3 py-2 text-center">
                Opponent disconnected — waiting {Math.ceil(s.opponentGraceMs / 1000)}s
              </div>
            )}

            {board}

            {showDraw && s.drawOffered && (
              <div className="bg-surface-alt border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-sm">Opponent offers a draw</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={s.acceptDraw}>
                    Accept
                  </Button>
                  <Button size="sm" variant="danger" onClick={s.declineDraw}>
                    Decline
                  </Button>
                </div>
              </div>
            )}

            <PlayerBar
              name={`You (${s.username})`}
              clock={
                <Clock
                  ms={s.myClockMs}
                  active={s.activeColor === s.myColor}
                  format={clockFormat}
                  lowClockMs={lowClockMs}
                />
              }
            />

            {/* Action row — wraps on narrow widths so it never overflows */}
            {s.status === 'active' && (
              <div className="flex flex-wrap gap-2 justify-end">
                <SpectateLinkButton gameId={s.gameId!} />
                {showDraw && (
                  <Button size="md" variant="secondary" onClick={s.offerDraw}>
                    ½ Draw
                  </Button>
                )}
                {moveCount < ABORT_MOVE_LIMIT ? (
                  <Button size="md" variant="secondary" onClick={s.abort}>
                    Abort
                  </Button>
                ) : (
                  <Button size="md" variant="danger" onClick={s.resign}>
                    Resign
                  </Button>
                )}
                {s.opponent?.userId && (
                  <OpponentMenu
                    opponentId={s.opponent.userId}
                    opponentName={oppName}
                    gameId={s.gameId!}
                  />
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <Card elevation="raised">
              <h3 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wide">Moves</h3>
              <div className="overflow-y-auto max-h-[28svh] lg:max-h-72 text-sm font-mono">{moveList}</div>
            </Card>

            {s.status === 'active' && s.user && (
              <EmoteBar gameId={s.gameId!} myUserId={s.user.id} emit={s.emit} socket={s.socket} />
            )}

            <Card elevation="raised" className="flex flex-col gap-2 h-[40svh] lg:h-72">
              <h3 className="text-sm font-semibold text-fg-muted uppercase tracking-wide">Chat</h3>
              <div className="flex-1 min-h-0 overflow-y-auto text-sm space-y-1">
                {s.chatLog.map((m, i) => (
                  <p key={i} className="text-fg-muted">
                    <span className="font-medium text-fg">{m.username}:</span> {m.text}
                  </p>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={s.chatText}
                  onChange={(e) => s.setChatText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && s.sendChat()}
                  placeholder="Message…"
                  maxLength={200}
                  className="flex-1 h-9 px-2 rounded-lg bg-surface-muted text-fg placeholder:text-fg-subtle text-sm border border-border focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                />
                <Button size="sm" onClick={s.sendChat}>
                  Send
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      <GameOverModal session={s} backHref={backHref} />
    </div>
  );
}
