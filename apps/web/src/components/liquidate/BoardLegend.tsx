'use client';

import React from 'react';
import { LIQUIDATE_DECK_STYLE } from '@finesse/ui';
import { LQ, systemColor } from './theme';

interface LegendEntry {
  char: string;
  label: string;
  bg: string;
  fg: string;
}

/**
 * The key to the loop's marks.
 *
 * Liquidate carries more tile kinds than a classic property game — two event
 * decks, gates, utilities, four corners — and the redesign leans on glyphs and a
 * colour bar to tell them apart at 60px. A legend is what makes that shorthand
 * learnable rather than something a player has to click every tile to decode.
 */
export function BoardLegend({ className }: { className?: string }) {
  const entries: LegendEntry[] = [
    { char: '■', label: 'Property', bg: systemColor('azure'), fg: '#fff' },
    {
      char: '◇',
      label: 'Gate',
      bg: `color-mix(in srgb, ${LQ.gate} 30%, transparent)`,
      fg: LQ.gate,
    },
    {
      char: '⚡',
      label: 'Utility',
      bg: `color-mix(in srgb, ${LQ.utility} 25%, transparent)`,
      fg: LQ.utility,
    },
    {
      char: LIQUIDATE_DECK_STYLE.anomaly.glyph,
      label: 'Anomaly',
      bg: `color-mix(in srgb, ${LQ.you} 22%, transparent)`,
      fg: LQ.you,
    },
    {
      char: LIQUIDATE_DECK_STYLE.federation.glyph,
      label: 'Federation',
      bg: `color-mix(in srgb, ${LQ.accent} 22%, transparent)`,
      fg: LQ.accent,
    },
    {
      char: '▮',
      label: 'Owner + colony pips',
      bg: `color-mix(in srgb, ${LQ.ink} 12%, transparent)`,
      fg: LQ.dim,
    },
  ];

  return (
    <div className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 14px' }}>
      {entries.map((e) => (
        <div
          key={e.label}
          className="flex items-center font-semibold"
          style={{ gap: 6, fontSize: 11, color: LQ.dim }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              borderRadius: 5,
              background: e.bg,
              color: e.fg,
              fontSize: 11,
              flex: 'none',
            }}
            aria-hidden="true"
          >
            {e.char}
          </span>
          {e.label}
        </div>
      ))}
    </div>
  );
}
