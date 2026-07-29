'use client';

import React from 'react';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { AmountInput } from './AmountInput';
import { DockButton } from './DockButton';
import { LQ, seatColor, tileAccent } from './theme';

export interface AuctionPanelProps {
  state: LiquidateGameState;
  /** True when the player who must bid is a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
  /** Focuses the lot in the centre inspector. */
  onViewDeed?: (tileId: number) => void;
}

/** Raises offered as one-tap chips, so most bids need no typing at all. */
const QUICK_STEPS = [10, 25, 50, 100] as const;

/**
 * Live auction for a declined tile.
 *
 * Sits in the rail rather than in a modal: the engine parks the game in the
 * `auction` phase until bidding resolves, and a centred dialog spent that whole
 * time covering the board the player is trying to value the lot against.
 */
export function AuctionPanel({ state, humanTurn, dispatch, onViewDeed }: AuctionPanelProps) {
  const auction = state.pendingAuction;
  const bidderId = auction ? auction.bidders[auction.turnIndex] : null;
  const bidder = state.players.find((p) => p.id === bidderId) ?? null;
  const [amount, setAmount] = React.useState(0);

  const minBid = (auction?.highestBid ?? 0) + 1;

  // Re-arm the input whenever the standing bid or the bidder changes.
  React.useEffect(() => {
    setAmount(minBid);
  }, [minBid, bidderId]);

  if (!auction || !bidder) return null;
  const tile = LiquidateEngine.board(state)[auction.tileId];
  const leader = state.players.find((p) => p.id === auction.highestBidderId) ?? null;
  const maxBid = bidder.credits;
  const listPrice = isOwnable(tile) ? tile.price : 0;
  const seat = state.players.indexOf(bidder);
  const canBid = amount >= minBid && amount <= maxBid;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          style={{ width: 12, height: 12, borderRadius: 4, background: tileAccent(tile), flex: 'none' }}
          aria-hidden="true"
        />
        <span className="truncate font-bold" style={{ fontSize: 13.5, color: LQ.ink }}>
          Auction · {tile.name}
        </span>
        {onViewDeed && (
          <button
            type="button"
            onClick={() => onViewDeed(auction.tileId)}
            className="ml-auto shrink-0 font-semibold hover:underline"
            style={{ fontSize: 11, color: LQ.dim }}
          >
            Inspect
          </button>
        )}
      </div>

      <div
        className="flex items-center justify-between"
        style={{
          borderRadius: 11,
          border: `1px solid ${LQ.line}`,
          background: LQ.panel2,
          padding: '9px 11px',
        }}
      >
        <div className="min-w-0">
          <div className="font-semibold" style={{ fontSize: 10.5, color: LQ.dim }}>
            Standing bid
          </div>
          <div className="truncate font-semibold" style={{ fontSize: 10.5, color: LQ.soft }}>
            {leader ? `Leading: ${leader.name}` : `List ${formatCredits(listPrice)} · no bids yet`}
          </div>
        </div>
        <span
          className="shrink-0 tabular-nums"
          style={{
            fontFamily: LQ.dispFont,
            fontWeight: LQ.dispWeight as unknown as number,
            fontSize: 18,
            color: LQ.ink,
          }}
        >
          {auction.highestBid > 0 ? formatCredits(auction.highestBid) : '—'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          style={{ width: 11, height: 11, borderRadius: '50%', background: seatColor(seat), flex: 'none' }}
          aria-hidden="true"
        />
        <span className="truncate font-semibold" style={{ fontSize: 12.5, color: LQ.ink }}>
          <strong>{bidder.name}</strong> to bid
        </span>
        <span
          className="ml-auto shrink-0 font-semibold tabular-nums"
          style={{ fontSize: 11, color: LQ.dim }}
        >
          has {formatCredits(bidder.credits)}
        </span>
      </div>

      {humanTurn ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-semibold" style={{ fontSize: 10.5, color: LQ.dim }}>
              Your bid — min {formatCredits(minBid)}, max {formatCredits(maxBid)}
            </span>
            <AmountInput
              value={amount}
              onChange={setAmount}
              min={minBid}
              max={maxBid}
              aria-label="Bid amount"
              style={{
                background: LQ.panel2,
                borderColor: LQ.line,
                color: LQ.ink,
              }}
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_STEPS.map((step) => (
              <ChipButton
                key={step}
                disabled={minBid + step > maxBid}
                onClick={() => setAmount(Math.min(maxBid, minBid + step))}
              >
                +{step}
              </ChipButton>
            ))}
            <ChipButton disabled={maxBid < minBid} onClick={() => setAmount(maxBid)}>
              All in
            </ChipButton>
          </div>

          {!canBid && (
            <p className="font-semibold" style={{ fontSize: 11, color: LQ.dim }}>
              {amount > maxBid
                ? `${formatCredits(amount)} is more than you hold.`
                : `Bid at least ${formatCredits(minBid)}, or pass.`}
            </p>
          )}

          <DockButton
            variant="primary"
            char="⇧"
            label={`Bid ${formatCredits(amount)}`}
            sub="Raises the standing bid"
            disabled={!canBid}
            onClick={() => dispatch({ type: 'bid', amount })}
          />
          <DockButton
            variant="ghost"
            char="✕"
            label="Pass"
            sub="Drop out of this auction"
            onClick={() => dispatch({ type: 'pass-bid' })}
          />
        </>
      ) : (
        <p className="font-semibold" style={{ fontSize: 12.5, color: LQ.dim }} aria-live="polite">
          {bidder.name} is deciding…
        </p>
      )}

      <p className="font-semibold" style={{ fontSize: 10.5, color: LQ.soft }}>
        {auction.bidders.length} still in the running.
      </p>
    </div>
  );
}

/** A quick-raise chip. Small, tinted, and sized for a thumb. */
function ChipButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="font-bold transition-[filter] hover:brightness-125 disabled:opacity-40 disabled:hover:brightness-100"
      style={{
        fontSize: 11.5,
        padding: '5px 10px',
        borderRadius: 8,
        border: `1px solid ${LQ.line}`,
        background: `color-mix(in srgb, ${LQ.ink} 6%, transparent)`,
        color: LQ.ink,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
