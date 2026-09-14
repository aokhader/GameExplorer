import { cn } from '@/lib/utils';

/**
 * A bot tier's strength as rising bars, filled up to the tier — the web twin of
 * the mobile app's `src/game/DifficultyMeter.tsx`.
 *
 * It replaced a coloured emoji dot per tier. Those rendered differently on every
 * platform, could not take a theme colour, and ranked the tiers by colour alone,
 * which a colour-blind player cannot read. Bar count carries the rank; colour
 * only says which tile is selected (lit bars take the text colour).
 *
 * Decorative: the tile it sits on already names the tier.
 */
export function DifficultyMeter({ level, of, className }: {
  /** 1-based position of this tier on its ladder. */
  level: number;
  /** How many tiers the ladder has. */
  of: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn('inline-flex h-4 items-end gap-0.5', className)}>
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={cn('w-1 rounded-xs', i < level ? 'bg-current' : 'bg-border')}
          // Rising, so the row reads as a scale even at a glance.
          style={{ height: 6 + Math.round((10 * i) / Math.max(1, of - 1)) }}
        />
      ))}
    </span>
  );
}
