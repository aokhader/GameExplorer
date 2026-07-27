'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  LIQUIDATE_BOT_LABELS,
  LIQUIDATE_BOT_LEVELS,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  LiquidateEngine,
  formatCredits,
  type DebtRule,
  type LiquidateBotLevel,
  type LiquidateSeat,
} from '@gameexplorer/shared';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { Button, Card } from '@/components/ui';
import { useLiquidateGame } from '@/hooks/useLiquidateGame';
import { ActionBar } from './ActionBar';
import { ActionLog } from './ActionLog';
import { AuctionModal } from './AuctionModal';
import { Dice } from './Dice';
import { HoldingsModal } from './HoldingsModal';
import { LiquidateBoard } from './LiquidateBoard';
import { PlayerPanel } from './PlayerPanel';
import { PropertyCardModal } from './PropertyCardModal';

const GameResultScreen = dynamic(
  () => import('@/components/game/GameResultScreen').then((m) => m.GameResultScreen),
  { ssr: false },
);

export interface LiquidateGameScreenProps {
  /** `bot` seats one human against AI; `local` seats every player at this device. */
  mode: 'bot' | 'local';
}

const BOT_NAMES = ['Vega', 'Orin', 'Kessa', 'Dax', 'Nyra'];

/**
 * Setup + in-game shell for Liquidate, shared by the vs-bot and pass-and-play
 * routes. The two differ only in who occupies the seats, so the board, controls,
 * and dialogs are identical.
 */
export function LiquidateGameScreen({ mode }: LiquidateGameScreenProps) {
  const [playerCount, setPlayerCount] = React.useState(mode === 'bot' ? 3 : 2);
  const [boardMode, setBoardMode] = React.useState<'full' | 'quick'>('quick');
  const [debtRule, setDebtRule] = React.useState<DebtRule>('allow-negative');
  const [botLevel, setBotLevel] = React.useState<LiquidateBotLevel>('steady');
  const [selectedTile, setSelectedTile] = React.useState<number | null>(null);
  const [holdingsOpen, setHoldingsOpen] = React.useState(false);
  const [resultDismissed, setResultDismissed] = React.useState(false);

  const { state, actingPlayer, lastError, dispatch, newGame, resume, savedGame, quit } =
    useLiquidateGame({ storageKey: mode, botLevel });

  const start = () => {
    const seats: LiquidateSeat[] = Array.from({ length: playerCount }, (_, i) => {
      if (mode === 'local') return { name: `Player ${i + 1}` };
      // A proper name, not "You": the engine writes third-person log lines
      // ("<name> rolls 3+3"), which "You" would turn into "You rolls".
      return i === 0
        ? { name: 'Captain' }
        : { name: BOT_NAMES[(i - 1) % BOT_NAMES.length], isBot: true };
    });
    setResultDismissed(false);
    newGame({ players: seats, mode: boardMode, debtRule });
  };

  // ── Setup ────────────────────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="page-glow-liquidate min-h-screen pt-16">
        <div className="container mx-auto max-w-2xl px-4 py-10">
          <h1 className="mb-1 text-3xl font-bold text-fg">
            {mode === 'bot' ? 'Liquidate vs Bots' : 'Liquidate — Pass & Play'}
          </h1>
          <p className="mb-6 text-fg-muted">
            Claim planets, charge rent, and squeeze everyone else out of the sector.
          </p>

          {savedGame && (
            <Card className="mb-6 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-fg">Unfinished game</div>
                  <div className="text-xs text-fg-muted">
                    Round {savedGame.state.round} ·{' '}
                    {savedGame.state.players.filter((p) => !p.bankrupt).length} still solvent
                  </div>
                </div>
                <Button onClick={resume}>Resume</Button>
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-5 p-5">
            <div>
              <div className="mb-2 text-sm font-medium text-fg">Players</div>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  { length: LIQUIDATE_MAX_PLAYERS - LIQUIDATE_MIN_PLAYERS + 1 },
                  (_, i) => i + LIQUIDATE_MIN_PLAYERS,
                ).map((count) => (
                  <Button
                    key={count}
                    size="sm"
                    variant={playerCount === count ? 'primary' : 'secondary'}
                    onClick={() => setPlayerCount(count)}
                  >
                    {count}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-fg">Game length</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={boardMode === 'quick' ? 'primary' : 'secondary'}
                  onClick={() => setBoardMode('quick')}
                >
                  Quick — 28 tiles, 20 rounds
                </Button>
                <Button
                  size="sm"
                  variant={boardMode === 'full' ? 'primary' : 'secondary'}
                  onClick={() => setBoardMode('full')}
                >
                  Full — 44 tiles, last one standing
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-fg">If a player cannot pay</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={debtRule === 'allow-negative' ? 'primary' : 'secondary'}
                  onClick={() => setDebtRule('allow-negative')}
                >
                  Let them go into debt
                </Button>
                <Button
                  size="sm"
                  variant={debtRule === 'never-negative' ? 'primary' : 'secondary'}
                  onClick={() => setDebtRule('never-negative')}
                >
                  Fold them immediately
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">
                {debtRule === 'allow-negative'
                  ? 'Balances can drop below zero. The debtor must mortgage or sell back to solvency, or fold. More forgiving.'
                  : 'Balances never go below zero. The creditor takes what cash there is and the debtor is out at once. Harsher and faster.'}
              </p>
            </div>

            {mode === 'bot' && (
              <div>
                <div className="mb-2 text-sm font-medium text-fg">Bot skill</div>
                <div className="flex flex-wrap gap-2">
                  {LIQUIDATE_BOT_LEVELS.map((level) => (
                    <Button
                      key={level}
                      size="sm"
                      variant={botLevel === level ? 'primary' : 'secondary'}
                      onClick={() => setBotLevel(level)}
                    >
                      {LIQUIDATE_BOT_LABELS[level]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={start} data-testid="liquidate-start">
              Start game
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // ── In game ──────────────────────────────────────────────────────────────
  const humanIds =
    mode === 'local'
      ? state.players.map((p) => p.id)
      : state.players.filter((p) => !p.isBot).map((p) => p.id);
  const humanTurn = Boolean(actingPlayer && humanIds.includes(actingPlayer.id));
  const buyTileId = state.phase === 'buy-decision' ? state.pendingPurchase : null;
  const winner = state.players.find((p) => p.id === state.winnerId) ?? null;
  const youWon = winner ? humanIds.includes(winner.id) : false;

  return (
    <>
      <GameScreenLayout
        accent="liquidate"
        backHref="/liquidate"
        backLabel="Liquidate"
        // A 12-per-side ring needs more width than the default 8×8 column.
        boardColumnClassName="lg:w-[620px]"
        headerCenter={
          <div className="text-sm text-fg-muted">
            {/* The engine advances the round before testing the cap, so the raw
                counter reads one past the limit on the final turn. */}
            Round{' '}
            {state.config.maxRounds
              ? `${Math.min(state.round, state.config.maxRounds)} / ${state.config.maxRounds}`
              : state.round}
          </div>
        }
        headerActions={
          <Button size="sm" variant="secondary" onClick={quit}>
            New game
          </Button>
        }
        board={
          <LiquidateBoard state={state} onSelectTile={setSelectedTile}>
            <div className="flex w-full flex-col items-center gap-2 overflow-hidden">
              <Dice dice={state.dice} rolling={!humanTurn && state.phase === 'awaiting-roll'} />
              {actingPlayer && (
                <p className="text-center text-xs text-fg-muted">
                  <span className="font-medium text-fg">{actingPlayer.name}</span> ·{' '}
                  {formatCredits(actingPlayer.credits)}
                </p>
              )}
              <ActionLog
                state={state}
                limit={40}
                className="max-h-[38%] w-full overflow-y-auto px-1"
              />
            </div>
          </LiquidateBoard>
        }
        sidebar={
          <>
            <Card className="p-3">
              <ActionBar
                state={state}
                humanTurn={humanTurn}
                dispatch={dispatch}
                onManage={() => setHoldingsOpen(true)}
              />
              {lastError && <p className="mt-2 text-xs text-danger">{lastError}</p>}
            </Card>
            <Card className="p-3">
              <PlayerPanel state={state} humanIds={humanIds} />
            </Card>
          </>
        }
      />

      {/* Buy decision — the live one takes priority over browsing a tile. */}
      {buyTileId !== null && humanTurn ? (
        <PropertyCardModal
          state={state}
          tileId={buyTileId}
          onClose={() => undefined}
          onBuy={
            LiquidateEngine.getLegalActions(state).some((a) => a.type === 'buy')
              ? () => dispatch({ type: 'buy' })
              : undefined
          }
          onDecline={() => dispatch({ type: 'decline' })}
        />
      ) : (
        <PropertyCardModal
          state={state}
          tileId={selectedTile}
          onClose={() => setSelectedTile(null)}
        />
      )}

      {state.phase === 'auction' && (
        <AuctionModal state={state} humanTurn={humanTurn} dispatch={dispatch} />
      )}

      {actingPlayer && (
        <HoldingsModal
          open={holdingsOpen}
          onClose={() => setHoldingsOpen(false)}
          state={state}
          playerId={actingPlayer.id}
          dispatch={dispatch}
        />
      )}

      <GameResultScreen
        open={state.isGameOver && !resultDismissed}
        result={mode === 'local' ? 'win' : youWon ? 'win' : 'loss'}
        title={winner ? `${winner.name} wins` : 'Game over'}
        subtitle={
          winner
            ? `Net worth ${formatCredits(LiquidateEngine.getNetWorth(state, winner.id))} after ${state.round} rounds`
            : undefined
        }
        actions={
          <>
            <Button onClick={quit}>New game</Button>
            <Button variant="secondary" onClick={() => setResultDismissed(true)}>
              Review board
            </Button>
          </>
        }
      />
    </>
  );
}
