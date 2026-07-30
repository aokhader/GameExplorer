import type { SfxEvent } from '@/audio/useGameSfx.native';

/**
 * Which sound/haptic a log line earns.
 *
 * Driven off the log rather than off dispatches because bot actions never pass
 * through a component — the log is the one place every event, human or bot,
 * appears exactly once.
 *
 * **Order matters.** Several messages match more than one pattern: "rolls
 * doubles and leaves impound" contains both a roll and an impound, and a
 * won auction is both a claim and a win. The first match wins, so the list runs
 * most-specific first.
 */
const RULES: [RegExp, SfxEvent][] = [
  // Rolls first: a roll that frees a ship from impound is still a roll.
  [/ rolls /, 'jump'],
  // Taking a property, however it was taken.
  [/ claims | wins .+ at auction for /, 'promote'],
  // Colonies going up.
  [/ builds colony | raises a megastructure /, 'promote'],
  // Money leaving your hands.
  [/ owes | pays the /, 'capture'],
  // Losing a seat.
  [/ folds — /, 'loss'],
  // Winning the match. Anchored so it cannot catch an auction win.
  [/ wins$| wins with a net worth of /, 'win'],
  // Being sent to, or held in, impound.
  [/impound/i, 'check'],
  // Softer beats.
  [/ draws: /, 'select'],
  [/ bids \d+$/, 'select'],
  [/ mortgages | dismantles a colony | clears the mortgage /, 'select'],
  [/ accepts the trade | declines the trade | offers .+ a trade/, 'select'],
];

/** The event for a log message, or `null` when it deserves no feedback. */
export function sfxForLogLine(message: string): SfxEvent | null {
  for (const [pattern, event] of RULES) {
    if (pattern.test(message)) return event;
  }
  return null;
}
