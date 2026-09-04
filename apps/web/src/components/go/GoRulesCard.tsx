'use client';

import type { GoScoring } from '@gameexplorer/shared';
import {
  GO_KOMI_PRESETS,
  GO_RATED_KOMI,
  GO_SCORING_OPTIONS,
} from '@gameexplorer/client/game/goSetup';

export interface GoRulesCardProps {
  komi: number;
  onKomiChange: (komi: number) => void;
  scoring: GoScoring;
  onScoringChange: (scoring: GoScoring) => void;
  /**
   * Show the note explaining that a non-standard komi makes the game casual.
   * False in pass-and-play and anywhere else nothing was going to be rated.
   */
  showRatedNote?: boolean;
}

/**
 * The two rules a Go game is set up with: how much White gets for moving
 * second, and how the board is counted at the end.
 *
 * Rendered in **every** mode, unlike the bot tier and the rated toggle — komi
 * and the scoring rule apply just as much to two people sharing a screen.
 *
 * Both groups follow Liquidate's house-rule pattern: segmented buttons, and one
 * line under them that changes with the selection. That line is the point of the
 * card. "Territory" and "area" mean nothing to a new player, and a setting
 * nobody understands is worse than no setting at all.
 */
export function GoRulesCard({
  komi,
  onKomiChange,
  scoring,
  onScoringChange,
  showRatedNote = false,
}: GoRulesCardProps) {
  const scoringOption = GO_SCORING_OPTIONS.find(o => o.value === scoring);
  const komiPreset = GO_KOMI_PRESETS.find(k => k.value === komi);
  const unrated = showRatedNote && komi !== GO_RATED_KOMI;

  return (
    <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
      <h2 className="text-2xl font-semibold text-fg mb-6">Rules</h2>

      <div className="mb-6">
        <div className="mb-2 text-sm font-medium text-fg">Scoring</div>
        <div className="flex flex-wrap gap-2">
          {GO_SCORING_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={scoring === option.value}
              onClick={() => onScoringChange(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                scoring === option.value
                  ? 'border-transparent bg-accent text-on-accent [box-shadow:var(--shadow-glow-accent)]'
                  : 'border-white/10 bg-white/5 text-fg hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-fg-muted">{scoringOption?.description}</p>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-fg">Komi — White’s compensation</div>
        <div className="flex flex-wrap gap-2">
          {GO_KOMI_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              aria-pressed={komi === preset.value}
              onClick={() => onKomiChange(preset.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                komi === preset.value
                  ? 'border-transparent bg-accent text-on-accent [box-shadow:var(--shadow-glow-accent)]'
                  : 'border-white/10 bg-white/5 text-fg hover:bg-white/10'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-fg-muted">{komiPreset?.description}</p>
        {unrated && (
          <p className="mt-2 text-xs text-warning-hover" role="status">
            Games away from {GO_RATED_KOMI} komi are casual. Komi is worth about seven
            points on a 9×9 board, and the bot’s tiers were measured at {GO_RATED_KOMI}.
          </p>
        )}
      </div>
    </div>
  );
}
