'use client';

import type { GoScoring } from '@gameexplorer/shared';
import {
  GO_BOARD_SIZES,
  GO_KOMI_PRESETS,
  GO_SCORING_OPTIONS,
  goRatedEligibility,
} from '@gameexplorer/client/game/goSetup';

export interface GoRulesCardProps {
  size: number;
  onSizeChange: (size: number) => void;
  komi: number;
  onKomiChange: (komi: number) => void;
  scoring: GoScoring;
  onScoringChange: (scoring: GoScoring) => void;
  /**
   * Show the note explaining that these settings make the game casual. False in
   * pass-and-play and anywhere else nothing was going to be rated.
   */
  showRatedNote?: boolean;
}

/** One segmented group: buttons, then the line that explains the choice. */
function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const selected = options.find(o => o.value === value);

  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-2 text-sm font-medium text-fg">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
              value === option.value
                ? 'border-transparent bg-accent text-on-accent [box-shadow:var(--shadow-glow-accent)]'
                : 'border-white/10 bg-white/5 text-fg hover:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-muted">{selected?.description}</p>
    </div>
  );
}

/**
 * The three rules a Go game is set up with: how big the board is, how much
 * White gets for moving second, and how the board is counted at the end.
 *
 * Rendered in **every** mode, unlike the bot tier and the rated toggle — all
 * three apply just as much to two people sharing a screen.
 *
 * Every group follows Liquidate's house-rule pattern: segmented buttons, and one
 * line under them that changes with the selection. That line is the point of the
 * card. "Territory" and "area" mean nothing to a new player, and a setting
 * nobody understands is worse than no setting at all.
 */
export function GoRulesCard({
  size,
  onSizeChange,
  komi,
  onKomiChange,
  scoring,
  onScoringChange,
  showRatedNote = false,
}: GoRulesCardProps) {
  // One shared rule, so this card and the mobile one cannot disagree about what
  // counts as rated.
  const eligibility = goRatedEligibility({ size, komi });

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
      <h2 className="text-2xl font-semibold text-fg mb-6">Rules</h2>

      <Choice label="Board" options={GO_BOARD_SIZES} value={size} onChange={onSizeChange} />
      <Choice
        label="Scoring"
        options={GO_SCORING_OPTIONS}
        value={scoring}
        onChange={onScoringChange}
      />
      <Choice
        label="Komi — White’s compensation"
        options={GO_KOMI_PRESETS}
        value={komi}
        onChange={onKomiChange}
      />

      {showRatedNote && !eligibility.rated && (
        <p className="mt-2 text-xs text-warning-hover" role="status">
          {eligibility.reason}
        </p>
      )}
    </div>
  );
}
