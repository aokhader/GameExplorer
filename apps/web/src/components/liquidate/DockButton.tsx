'use client';

import React from 'react';
import { LQ } from './theme';

export type DockVariant = 'primary' | 'ghost' | 'subtle' | 'danger';

export interface DockButtonProps {
  /** Leading mark. Glyphs, not an icon set — they theme with the text. */
  char?: string;
  label: string;
  /** Second line: what the action actually does, in plain words. */
  sub?: string;
  /** Trailing value, e.g. the price of a claim. */
  right?: string;
  variant?: DockVariant;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * One row of the action dock.
 *
 * Deliberately not the shared `Button`: these are full-width, two-line rows that
 * state the consequence as well as the verb ("Decline → auction / Open bidding
 * to all players"), and they take their colours from the Liquidate board chrome
 * rather than the page — the dock sits beside a board whose surface flips
 * between themes.
 */
export function DockButton({
  char,
  label,
  sub,
  right,
  variant = 'subtle',
  disabled = false,
  onClick,
}: DockButtonProps) {
  const skin = (): React.CSSProperties => {
    if (disabled) {
      return {
        background: LQ.panel2,
        color: LQ.soft,
        border: `1px solid ${LQ.line}`,
        opacity: 0.7,
        cursor: 'not-allowed',
      };
    }
    switch (variant) {
      case 'primary':
        return {
          background: LQ.accent,
          color: LQ.accentInk,
          border: 'none',
          boxShadow: LQ.glow,
        };
      case 'ghost':
        return { background: 'transparent', color: LQ.ink, border: `1px solid ${LQ.line}` };
      case 'danger':
        return {
          background: `color-mix(in srgb, ${LQ.accent} 8%, transparent)`,
          color: 'var(--c-danger, #ef4444)',
          border: '1px solid color-mix(in srgb, var(--c-danger, #ef4444) 40%, transparent)',
        };
      default:
        return {
          background: `color-mix(in srgb, ${LQ.ink} 6%, transparent)`,
          color: LQ.ink,
          border: `1px solid ${LQ.line}`,
        };
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2.5 transition-[filter,box-shadow] hover:brightness-110 disabled:hover:brightness-100"
      style={{
        padding: variant === 'primary' ? '13px 15px' : '11px 15px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        ...skin(),
      }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {char && (
          <span style={{ fontSize: 15, opacity: 0.9, flex: 'none' }} aria-hidden="true">
            {char}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-bold" style={{ fontSize: 13.5 }}>
            {label}
          </span>
          {sub && (
            <span
              className="block truncate font-semibold"
              style={{ fontSize: 10.5, opacity: 0.72, marginTop: 1 }}
            >
              {sub}
            </span>
          )}
        </span>
      </span>
      {right && (
        <span className="shrink-0 font-bold tabular-nums" style={{ fontSize: 13 }}>
          {right}
        </span>
      )}
    </button>
  );
}
