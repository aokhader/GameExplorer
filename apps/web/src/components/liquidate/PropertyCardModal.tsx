'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS, LIQUIDATE_SYSTEM_COLORS } from '@gameexplorer/ui';
import {
  LIQUIDATE_WARP_GATE_RENTS,
  LIQUIDATE_UTILITY_MULTIPLIER_BOTH,
  LIQUIDATE_UTILITY_MULTIPLIER_ONE,
  LiquidateEngine,
  formatCredits,
  isOwnable,
  mortgageValueFor,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { Button, Modal } from '@/components/ui';

export interface PropertyCardModalProps {
  state: LiquidateGameState;
  /** Tile to show, or `null` to close. */
  tileId: number | null;
  onClose: () => void;
  /** Present only when this is a live buy decision for the acting player. */
  onBuy?: () => void;
  onDecline?: () => void;
}

const LEVEL_LABEL = ['Bare claim', 'Colony I', 'Colony II', 'Colony III', 'Colony IV', 'Megastructure'];

/**
 * The deed card: full rent schedule plus, when the tile has just been landed on,
 * the buy/decline decision. Declining sends it to auction, which the copy says
 * outright so the choice is never a surprise.
 */
export function PropertyCardModal({
  state,
  tileId,
  onClose,
  onBuy,
  onDecline,
}: PropertyCardModalProps) {
  if (tileId === null) return null;
  const tile = LiquidateEngine.board(state)[tileId];
  if (!tile) return null;

  const owned = state.tiles[tileId];
  const ownerSeat = owned.ownerId ? state.players.findIndex((p) => p.id === owned.ownerId) : -1;
  const owner = ownerSeat >= 0 ? state.players[ownerSeat] : null;
  const decision = Boolean(onBuy || onDecline);

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!decision}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {tile.kind === 'planet' && (
            <span
              className="h-3 w-3 rounded-sm"
              style={{ background: LIQUIDATE_SYSTEM_COLORS[tile.system] }}
              aria-hidden="true"
            />
          )}
          {tile.name}
        </span>
      }
      footer={
        decision ? (
          <>
            <Button variant="secondary" onClick={onDecline}>
              Decline → auction
            </Button>
            {onBuy && (
              <Button onClick={onBuy}>
                Buy for {formatCredits('price' in tile ? tile.price : 0)}
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {tile.kind === 'planet' && (
          <>
            <p className="text-fg-muted">
              <span className="capitalize">{tile.system}</span> system · list{' '}
              {formatCredits(tile.price)} · colony {formatCredits(tile.colonyCost)}
            </p>
            <table className="w-full text-xs">
              <tbody>
                {tile.rents.map((rent, level) => (
                  <tr
                    key={level}
                    className={level === owned.level ? 'text-accent' : 'text-fg-muted'}
                  >
                    <td className="py-0.5">{LEVEL_LABEL[level]}</td>
                    <td className="py-0.5 text-right tabular-nums">{formatCredits(rent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-fg-muted">
              Holding the whole system doubles the bare rent.
            </p>
          </>
        )}

        {tile.kind === 'warp-gate' && (
          <>
            <p className="text-fg-muted">Warp gate · list {formatCredits(tile.price)}</p>
            <table className="w-full text-xs">
              <tbody>
                {LIQUIDATE_WARP_GATE_RENTS.map((rent, i) => (
                  <tr key={i} className="text-fg-muted">
                    <td className="py-0.5">
                      {i + 1} gate{i > 0 ? 's' : ''} held
                    </td>
                    <td className="py-0.5 text-right tabular-nums">{formatCredits(rent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tile.kind === 'utility' && (
          <>
            <p className="text-fg-muted">Utility · list {formatCredits(tile.price)}</p>
            <p className="text-xs text-fg-muted">
              Rent is the dice total × {LIQUIDATE_UTILITY_MULTIPLIER_ONE}, rising to ×
              {LIQUIDATE_UTILITY_MULTIPLIER_BOTH} when both utilities are held.
            </p>
          </>
        )}

        {tile.kind === 'tariff' && (
          <p className="text-fg-muted">Docking charge of {formatCredits(tile.amount)}.</p>
        )}
        {(tile.kind === 'anomaly' || tile.kind === 'federation') && (
          <p className="text-fg-muted">Draw from the {tile.name} deck.</p>
        )}
        {tile.kind === 'impound' && (
          <p className="text-fg-muted">
            Held ships wait here. Pay the fine, roll doubles, or spend a Clearance Pass.
          </p>
        )}
        {tile.kind === 'home-station' && (
          <p className="text-fg-muted">
            Passing here pays a stipend of {formatCredits(state.config.stipend)}.
          </p>
        )}
        {tile.kind === 'drift' && <p className="text-fg-muted">Open space. Nothing happens here.</p>}
        {tile.kind === 'contraband-scan' && (
          <p className="text-fg-muted">Landing here sends your ship straight to Impound.</p>
        )}

        {isOwnable(tile) && (
          <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
            {owner ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: LIQUIDATE_SEAT_COLORS[ownerSeat % LIQUIDATE_SEAT_COLORS.length] }}
                  aria-hidden="true"
                />
                Held by {owner.name}
                {owned.mortgaged && <span className="text-danger">· mortgaged</span>}
              </span>
            ) : (
              <span className="text-fg-muted">Unclaimed</span>
            )}
            <span className="text-fg-muted">
              Mortgage value {formatCredits(mortgageValueFor(tile.price))}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
