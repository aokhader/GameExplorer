'use client';

import React from 'react';
import { LIQUIDATE_SYSTEM_COLORS } from '@finesse/ui';
import {
  LiquidateEngine,
  MAX_COLONY_LEVEL,
  formatCredits,
  isOwnable,
  mortgageValueFor,
  unmortgageCostFor,
  type LiquidateAction,
  type LiquidateGameState,
  type OwnableTile,
} from '@finesse/shared';
import { Button, Modal } from '@/components/ui';

export interface HoldingsModalProps {
  open: boolean;
  onClose: () => void;
  state: LiquidateGameState;
  /** Whose estate to manage — the acting player. */
  playerId: string;
  dispatch: (action: LiquidateAction) => void;
}

/**
 * Estate management: build, sell, mortgage, clear.
 *
 * Buttons mirror `getLegalActions` exactly rather than re-deriving the rules, so
 * the even-build and mortgage constraints can never drift out of sync with the
 * engine. A disabled row always explains itself.
 */
export function HoldingsModal({ open, onClose, state, playerId, dispatch }: HoldingsModalProps) {
  const legal = React.useMemo(() => LiquidateEngine.getLegalActions(state), [state]);
  const can = (type: LiquidateAction['type'], tile: number) =>
    legal.some((a) => a.type === type && 'tile' in a && a.tile === tile);

  const player = state.players.find((p) => p.id === playerId);
  // Typed predicate, not a plain boolean — otherwise the result stays the wide
  // tile union and `tile.price` is not in scope on the rows below.
  const owned = LiquidateEngine.board(state).filter(
    (t): t is OwnableTile => isOwnable(t) && state.tiles[t.id].ownerId === playerId,
  );

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Your holdings">
      <div className="flex flex-col gap-2 text-sm">
        {player && (
          <p className="text-xs text-fg-muted">
            Cash {formatCredits(player.credits)} · net worth{' '}
            {formatCredits(LiquidateEngine.getNetWorth(state, playerId))} · could raise{' '}
            {formatCredits(LiquidateEngine.liquidatableValue(state, playerId))}
          </p>
        )}

        {owned.length === 0 && (
          <p className="text-fg-muted">You do not hold anything yet.</p>
        )}

        {owned.map((tile) => {
          const info = state.tiles[tile.id];
          return (
            <div
              key={tile.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt/60 px-3 py-2"
            >
              {tile.kind === 'planet' && (
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: LIQUIDATE_SYSTEM_COLORS[tile.system] }}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-fg">{tile.name}</div>
                <div className="text-xs text-fg-muted">
                  {info.mortgaged
                    ? `Mortgaged · clear for ${formatCredits(unmortgageCostFor(tile.price))}`
                    : tile.kind === 'planet'
                      ? info.level === MAX_COLONY_LEVEL
                        ? 'Megastructure'
                        : info.level > 0
                          ? `${info.level} colon${info.level === 1 ? 'y' : 'ies'}`
                          : `Bare · colony ${formatCredits(tile.colonyCost)}`
                      : `Mortgage for ${formatCredits(mortgageValueFor(tile.price))}`}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {tile.kind === 'planet' && (
                  <>
                    <Button
                      size="sm"
                      disabled={!can('build', tile.id)}
                      onClick={() => dispatch({ type: 'build', tile: tile.id })}
                    >
                      Build
                    </Button>
                    {info.level > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!can('sell-building', tile.id)}
                        onClick={() => dispatch({ type: 'sell-building', tile: tile.id })}
                      >
                        Sell
                      </Button>
                    )}
                  </>
                )}
                {info.mortgaged ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!can('unmortgage', tile.id)}
                    onClick={() => dispatch({ type: 'unmortgage', tile: tile.id })}
                  >
                    Clear
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!can('mortgage', tile.id)}
                    onClick={() => dispatch({ type: 'mortgage', tile: tile.id })}
                  >
                    Mortgage
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <p className="text-xs text-fg-muted">
          Colonies must be built evenly across a system, and a planet has to be cleared of
          colonies before it can be mortgaged or traded.
        </p>
      </div>
    </Modal>
  );
}
