'use client';

import React from 'react';
import { formatCredits } from '@gameexplorer/shared';
import type { InspectorData } from './inspector';
import { LQ } from './theme';

export interface TileInspectorProps {
  data: InspectorData;
  /** The system/kind hue for the swatch and progress fill. */
  accent: string;
  /** Compact mode drops the rent ladder — for a board too small to host it. */
  compact?: boolean;
  className?: string;
}

/**
 * The centre of the ring: everything about the tile in focus.
 *
 * This is where the redesign puts the detail the tiles themselves cannot carry —
 * the full rent ladder, how far along the system is, and the one sentence that
 * says why the tile matters right now. It sits inside the loop because that is
 * the one large empty area on the board and the player's eye is already there.
 */
export function TileInspector({ data, accent, compact = false, className }: TileInspectorProps) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        background: LQ.panel,
        border: `1px solid ${LQ.line}`,
        borderRadius: 16,
        padding: compact ? '12px 14px' : '18px 20px',
        boxShadow: LQ.panelShadow,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 12,
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-bold uppercase"
            style={{ fontSize: 10, letterSpacing: '0.1em', color: LQ.accent }}
          >
            {data.kicker}
          </div>
          <div
            className="truncate"
            style={{
              fontFamily: LQ.dispFont,
              fontWeight: LQ.dispWeight as unknown as number,
              letterSpacing: LQ.dispSpace,
              fontSize: compact ? 20 : 26,
              lineHeight: 1.1,
              color: LQ.ink,
              marginTop: 4,
            }}
          >
            {data.name}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              style={{ width: 12, height: 12, borderRadius: 4, background: accent, flex: 'none' }}
              aria-hidden="true"
            />
            {data.groupLabel && (
              <span className="font-bold" style={{ fontSize: 12, color: LQ.ink }}>
                {data.groupLabel}
              </span>
            )}
            <span className="font-semibold" style={{ fontSize: 12, color: LQ.dim }}>
              {data.groupLabel && '· '}
              {data.status}
            </span>
          </div>
        </div>

        {data.price !== null && (
          <div className="shrink-0 text-right">
            <div
              className="font-semibold uppercase"
              style={{ fontSize: 10, letterSpacing: '0.06em', color: LQ.dim }}
            >
              List price
            </div>
            <div
              className="tabular-nums"
              style={{
                fontFamily: LQ.dispFont,
                fontWeight: LQ.dispWeight as unknown as number,
                fontSize: compact ? 20 : 24,
                color: LQ.ink,
              }}
            >
              {formatCredits(data.price)}
            </div>
          </div>
        )}
      </div>

      {data.progress && (
        <div>
          <div
            className="mb-1.5 flex justify-between font-semibold"
            style={{ fontSize: 11, color: LQ.dim }}
          >
            <span>{data.progress.label}</span>
            <span className="tabular-nums">{data.progress.pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: LQ.track, overflow: 'hidden' }}>
            <div
              style={{
                width: `${data.progress.pct}%`,
                height: '100%',
                background: accent,
                borderRadius: 5,
              }}
            />
          </div>
        </div>
      )}

      {data.highlight && (
        <div
          className="font-semibold"
          style={{
            background: LQ.hint,
            border: `1px solid ${LQ.hintLine}`,
            borderRadius: 11,
            padding: '9px 11px',
            fontSize: 12,
            lineHeight: 1.4,
            color: LQ.hintInk,
          }}
        >
          {data.highlight}
        </div>
      )}

      {!compact && data.rent.length > 0 && (
        <div>
          <div
            className="mb-1.5 font-bold uppercase"
            style={{ fontSize: 10, letterSpacing: '0.08em', color: LQ.dim }}
          >
            Rent ladder
          </div>
          <div className="flex flex-col">
            {data.rent.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between font-semibold"
                style={{
                  padding: '5px 0',
                  borderTop: `1px solid ${LQ.rowLine}`,
                  fontSize: 12.5,
                  color: row.active ? LQ.accent : LQ.dim,
                }}
              >
                <span>
                  {row.label}
                  {row.active && ' ·'}
                </span>
                <span
                  className="tabular-nums font-bold"
                  style={{ color: row.active ? LQ.accent : LQ.ink }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
