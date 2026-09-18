'use client';

import React, { useState } from 'react';
import type { SettleOutcome } from '@gameexplorer/client/game/settleUnfinishedGame';
import {
  unfinishedGameName,
  unfinishedGameSummary,
  type UnfinishedGame,
} from '@gameexplorer/client/game/unfinishedGame';
import { Button } from '@/components/ui';

type Settle = (options: { resign: boolean }) => Promise<SettleOutcome>;

function settleMessage(outcome: SettleOutcome | Error): string | null {
  if (outcome instanceof Error) return "Couldn't save the result. Check your connection and try again.";
  if (outcome.kind === 'busy') return 'That result is still being saved. Try again in a moment.';
  return null;
}

/**
 * An unfinished game, with *Resume* and *Discard* (`ux-fix-ideas.md` §2.4) — the
 * web twin of native's `game/ContinueCard.tsx`, sharing its words and its rule.
 *
 * Discarding a **rated** game resigns it, so that click asks first, in place and
 * in plain words. A casual game just goes. A game that ended while its rated
 * result could not be written offers only *Save result*.
 */
export function ContinueCard({
  saved,
  onResume,
  onSettle,
  settling,
}: {
  saved: UnfinishedGame;
  onResume: () => void;
  onSettle: Settle;
  settling: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const settle = (resign: boolean) => {
    setMessage(null);
    onSettle({ resign })
      .then((outcome) => {
        setConfirming(false);
        setMessage(settleMessage(outcome));
      })
      .catch((err: Error) => setMessage(settleMessage(err)));
  };

  const owed = !!saved.end;

  return (
    <section
      aria-label="Unfinished game"
      className="mb-6 rounded-2xl border border-white/10 bg-surface-alt p-6"
    >
      <h2 className="text-lg font-semibold text-fg">
        {owed ? `${unfinishedGameName(saved.game)} result not saved` : 'Game in progress'}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{unfinishedGameSummary(saved)}</p>

      <div className="mt-4">
        {owed ? (
          <Button size="lg" fullWidth loading={settling} onClick={() => settle(false)}>
            Save result
          </Button>
        ) : confirming ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-fg">Discarding a rated game counts as a loss.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" variant="danger" loading={settling} onClick={() => settle(true)}>
                Resign it
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={onResume}>
              Resume
            </Button>
            <Button
              size="lg"
              variant="secondary"
              loading={settling}
              onClick={() => (saved.rated ? setConfirming(true) : settle(true))}
            >
              Discard
            </Button>
          </div>
        )}
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-danger-hover">
          {message}
        </p>
      )}
    </section>
  );
}

/**
 * The Start button, with the one question a rated unfinished game makes it ask:
 * there is one unfinished game per game type, and a rated one closes only by
 * finishing or resigning. A casual one is replaced by the new game's first move,
 * so Start asks nothing. While a game is waiting, Start steps down to secondary —
 * the card's *Resume* is the screen's main action then.
 */
export function GuardedStartButton({
  children,
  onStart,
  disabled,
  saved,
  onResume,
  onSettle,
  settling,
}: {
  children: React.ReactNode;
  onStart: () => void;
  disabled?: boolean;
  saved: UnfinishedGame | null;
  onResume: () => void;
  onSettle: Settle;
  settling: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const blocks = !!saved && saved.rated;

  if (!blocks || !asking) {
    return (
      <Button
        size="lg"
        fullWidth
        variant={saved ? 'secondary' : 'primary'}
        disabled={disabled}
        onClick={() => (blocks ? setAsking(true) : onStart())}
      >
        {children}
      </Button>
    );
  }

  const owed = !!saved.end;
  const name = unfinishedGameName(saved.game).toLowerCase();
  const replace = () => {
    setMessage(null);
    onSettle({ resign: !owed })
      .then((outcome) => {
        const problem = settleMessage(outcome);
        if (problem) setMessage(problem);
        else {
          setAsking(false);
          onStart();
        }
      })
      .catch((err: Error) => setMessage(settleMessage(err)));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-surface-alt p-4">
      <p className="text-center text-sm font-semibold text-fg">
        {owed ? `Your last rated ${name} result isn't saved yet.` : `You have an unfinished rated ${name} game.`}
      </p>
      {message && <p className="text-center text-sm text-danger-hover">{message}</p>}
      <div className={owed ? '' : 'grid grid-cols-2 gap-3'}>
        {!owed && (
          <Button size="lg" onClick={onResume}>
            Resume it
          </Button>
        )}
        <Button size="lg" fullWidth={owed} variant={owed ? 'primary' : 'danger'} loading={settling} onClick={replace}>
          {owed ? 'Save it and start' : 'Resign and start'}
        </Button>
      </div>
      <Button size="md" variant="ghost" fullWidth onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </div>
  );
}
