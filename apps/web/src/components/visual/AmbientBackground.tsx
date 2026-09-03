import type { GameId } from '@finesse/shared';
import { cn } from '@/lib/utils';

/**
 * Every game plus the gold brand default. Derived from `GameId` rather than
 * hand-listed: this union used to name only the first three games, so `/go` and
 * `/liquidate` silently fell back to the brand gold long after both shipped.
 */
export type AmbientHue = 'brand' | GameId;

/** The per-page glow color for the third (signature) bloom. */
const HUE_GLOW: Record<AmbientHue, string> = {
  brand: 'var(--c-accent-glow)',
  chess: 'var(--c-game-chess-glow)',
  checkers: 'var(--c-game-checkers-glow)',
  reversi: 'var(--c-game-reversi-glow)',
  go: 'var(--c-game-go-glow)',
  liquidate: 'var(--c-game-liquidate-glow)',
};

export interface AmbientBackgroundProps {
  /** Signature hue for the central bloom. Defaults to the gold brand. */
  hue?: AmbientHue;
  /** Animate the blooms with a slow aurora drift (heroes only). */
  animated?: boolean;
  /**
   * Visual weight. `subtle` for in-game/board screens where the board is the
   * focal point; `default` for most pages; `bold` for landing heroes.
   */
  intensity?: 'subtle' | 'default' | 'bold';
  className?: string;
}

const INTENSITY_OPACITY: Record<NonNullable<AmbientBackgroundProps['intensity']>, string> = {
  subtle: 'opacity-40',
  default: 'opacity-70',
  bold: 'opacity-100',
};

/**
 * Fixed, full-bleed ambient backdrop — layered radial glow blooms (gold + steel
 * chrome + a per-page signature hue) over the slate base, with a faint grain
 * overlay. This is the single biggest "liveliness" lever: it replaces the
 * dead-flat slate background with soft, layered color light.
 *
 * Sits at `-z-10` behind page content; `pointer-events-none` so it never
 * intercepts clicks. Animation (when `animated`) is reduced-motion gated via the
 * `.animate-aurora` utility in globals.css.
 */
export function AmbientBackground({
  hue = 'brand',
  animated = false,
  intensity = 'default',
  className,
}: AmbientBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-surface grain',
        className,
      )}
    >
      {/* Gold bloom — top-right brand warmth. No filter blur: a radial gradient
          to transparent is already edge-soft, so the ~64px `blur-3xl` only added
          a large per-frame raster pass (this backdrop is mounted site-wide and
          hurt first paint). The transparent stop is pushed out + the size bumped
          to reproduce the blurred spread. */}
      <div
        className={cn(
          'absolute -top-1/4 -right-1/4 h-[78vh] w-[78vh] rounded-full',
          INTENSITY_OPACITY[intensity],
          animated && 'animate-aurora',
        )}
        style={{ background: `radial-gradient(circle, var(--c-accent-glow) 0%, transparent 75%)` }}
      />
      {/* Steel bloom — bottom-left cool counterweight. */}
      <div
        className={cn(
          'absolute -bottom-1/4 -left-1/4 h-[78vh] w-[78vh] rounded-full',
          INTENSITY_OPACITY[intensity],
          animated && 'animate-aurora',
        )}
        style={{
          background: `radial-gradient(circle, var(--c-info-glow) 0%, transparent 75%)`,
          animationDelay: '-9s',
        }}
      />
      {/* Signature hue — central, defines the page's identity. */}
      <div
        className={cn(
          'absolute left-1/2 top-1/3 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full',
          INTENSITY_OPACITY[intensity],
          animated && 'animate-aurora',
        )}
        style={{
          background: `radial-gradient(circle, ${HUE_GLOW[hue]} 0%, transparent 75%)`,
          animationDelay: '-4.5s',
        }}
      />
    </div>
  );
}
