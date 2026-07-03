'use client';

import React from 'react';
import { createPortal } from 'react-dom';
// `m` + a local <LazyMotion> provider (not `motion`): framer's animation
// features load as their own async chunk, and since this component is itself
// dynamically imported, no route pays for framer in its initial JS.
import { m, LazyMotion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useGameSfx } from '@/hooks/useGameSfx';
import { celebratePop, springSoft, easeOut } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { SaveProgressPrompt } from './SaveProgressPrompt';

const loadMotionFeatures = () =>
  import('@/lib/motion-features').then(mod => mod.default);

export type GameResult = 'win' | 'loss' | 'draw' | 'aborted';

export interface GameResultScreenProps {
  open: boolean;
  result: GameResult;
  /** Headline override (e.g. "Checkmate — White wins"); defaults from `result`. */
  title?: string;
  /** Secondary line, e.g. the end reason ("by resignation"). */
  subtitle?: string;
  /** Optional rating change block with an animated count-up. */
  rating?: { before: number; after: number; delta: number };
  /** Training hint penalty note. */
  hintsUsed?: number;
  /** Action buttons (Play Again / Analyze / Back) — supplied by the page. */
  actions: React.ReactNode;
}

const COPY: Record<GameResult, { emoji: string; heading: string; accentClass: string }> = {
  win:     { emoji: '🏆', heading: 'You Won!',     accentClass: 'text-gradient-gold' },
  loss:    { emoji: '💪', heading: 'Good Game',    accentClass: 'text-fg' },
  draw:    { emoji: '🤝', heading: 'Draw',         accentClass: 'text-fg' },
  aborted: { emoji: '🛑', heading: 'Game Aborted', accentClass: 'text-fg' },
};

/** Animate an integer from `from` to `to` while `active`. rAF-based, cheap. */
function useCountUp(from: number, to: number, active: boolean, durationMs = 800): number {
  const [value, setValue] = React.useState(from);
  React.useEffect(() => {
    if (!active) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, active, durationMs]);
  return value;
}

export function GameResultScreen({
  open,
  result,
  title,
  subtitle,
  rating,
  hintsUsed,
  actions,
}: GameResultScreenProps) {
  const { reducedMotion } = useSettings();
  const sfx = useGameSfx();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const copy = COPY[result];
  const animateCount = open && !reducedMotion;
  const ratingValue = useCountUp(rating?.before ?? 0, rating?.after ?? 0, animateCount);

  // Fire the terminal chime + (on a win) a confetti burst once per open.
  React.useEffect(() => {
    if (!open) return;
    const sound = result === 'win' ? 'win' : result === 'loss' ? 'loss' : 'draw';
    if (result !== 'aborted') sfx.play(sound);

    if (result === 'win' && !reducedMotion) {
      const fire = (originX: number) =>
        confetti({
          particleCount: 70,
          spread: 70,
          startVelocity: 45,
          origin: { x: originX, y: 0.35 },
          colors: ['#cda43f', '#3b82f6', '#ec4899', '#a3e635'],
          disableForReducedMotion: true,
          scalar: 0.9,
        });
      fire(0.3);
      setTimeout(() => fire(0.7), 160);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result, reducedMotion]);

  if (!mounted) return null;

  return createPortal(
    <LazyMotion features={loadMotionFeatures} strict>
      <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ paddingTop: 'max(4rem, env(safe-area-inset-top))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={easeOut}
          role="dialog"
          aria-modal="true"
          aria-label={`Game over: ${title ?? copy.heading}`}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

          {/* Card */}
          <m.div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-alt surface-raised-lg p-8 text-center"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={springSoft}
          >
            <m.div
              className="text-6xl mb-3"
              variants={reducedMotion ? undefined : celebratePop}
              initial={reducedMotion ? undefined : 'hidden'}
              animate={reducedMotion ? undefined : 'show'}
            >
              {copy.emoji}
            </m.div>

            <h2 className={cn('text-3xl font-bold mb-1', copy.accentClass)}>
              {title ?? copy.heading}
            </h2>
            {subtitle && (
              <p className="text-fg-muted capitalize mb-2">{subtitle}</p>
            )}

            {rating && (
              <div className="mt-5 mb-5 rounded-xl bg-surface-muted p-4">
                <p className="text-sm text-fg-muted mb-1">Rating</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold tabular-nums">{ratingValue}</span>
                  <span
                    className={cn(
                      'text-lg font-bold',
                      rating.delta >= 0 ? 'text-success-hover' : 'text-danger-hover',
                    )}
                  >
                    {rating.delta >= 0 ? '+' : ''}
                    {rating.delta}
                  </span>
                </div>
                {hintsUsed != null && hintsUsed > 0 && (
                  <p className="mt-2 text-xs text-warning-hover">
                    💡 {hintsUsed} hint{hintsUsed > 1 ? 's' : ''} used (−{hintsUsed * 2} pts)
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2">{actions}</div>

            {/* Onboarding's soft sign-up ask — renders only for a guest's
                first game started from /welcome, then never again. */}
            <SaveProgressPrompt open={open} />
          </m.div>
        </m.div>
      )}
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}
