/**
 * Formatting for the cosmic property game's currency, "Credits". Kept in shared
 * so web and mobile render money identically. Purely presentational — amounts
 * are integers in game state.
 */

/** The Credits symbol used throughout the property game. */
export const CREDIT_SYMBOL = '₡';

const groups = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Format a whole-number Credits amount, e.g. `1234 → "₡1,234"`,
 * `-500 → "-₡500"`. Fractional inputs are rounded to the nearest Credit.
 */
export function formatCredits(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${CREDIT_SYMBOL}${groups.format(Math.abs(rounded))}`;
}
