'use client';

import React from 'react';

/**
 * Where you are in the lesson: a dot per step, filled up to the one you are on.
 *
 * Deliberately not clickable. A lesson is a sequence — its later steps run in
 * positions the earlier ones produce, and half of them reset the board — so
 * jumping to step five is not a thing the runtime can honour. The rail says
 * "how far", nothing else.
 */
export function LessonRail({
  stepIndex,
  stepCount,
  title,
}: {
  stepIndex: number;
  stepCount: number;
  title: string;
}) {
  const done = Math.min(stepIndex, stepCount);

  return (
    <div className="shrink-0" data-testid="lesson-rail">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-sm font-bold text-fg truncate">{title}</span>
        <span className="text-xs text-fg-muted whitespace-nowrap">
          Step {Math.min(stepIndex + 1, stepCount)} / {stepCount}
        </span>
      </div>
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stepCount}
        aria-valuenow={done}
        aria-label={`${done} of ${stepCount} steps done`}
      >
        {Array.from({ length: stepCount }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < done ? 'bg-accent' : i === done ? 'bg-accent/40' : 'bg-white/10'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
