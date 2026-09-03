'use client';

import React from 'react';
import type { TurnStep } from '@finesse/shared';
import { LQ } from './theme';

export function TurnSteps({ steps }: { steps: TurnStep[] }) {
  return (
    <div className="flex gap-1.5">
      {steps.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            style={{
              height: 4,
              borderRadius: 3,
              background: s.state === 'done' ? LQ.you : s.state === 'active' ? LQ.accent : LQ.track,
            }}
          />
          <div
            className="font-bold uppercase"
            style={{
              fontSize: 9,
              letterSpacing: '0.03em',
              color: s.state === 'todo' ? LQ.soft : LQ.ink,
            }}
          >
            {s.label}
          </div>
          <div className="truncate font-semibold" style={{ fontSize: 10, color: LQ.soft }}>
            {s.detail}
          </div>
        </div>
      ))}
    </div>
  );
}
