import { describe, it, expect } from 'vitest';
import { CREDIT_SYMBOL, formatCredits } from './currency';

describe('formatCredits', () => {
  it('prefixes the credit symbol and groups thousands', () => {
    expect(formatCredits(0)).toBe('₡0');
    expect(formatCredits(1234)).toBe('₡1,234');
    expect(formatCredits(1000000)).toBe('₡1,000,000');
  });

  it('places the sign before the symbol for negatives', () => {
    expect(formatCredits(-500)).toBe('-₡500');
  });

  it('rounds fractional amounts to the nearest credit', () => {
    expect(formatCredits(1234.4)).toBe('₡1,234');
    expect(formatCredits(1234.6)).toBe('₡1,235');
  });

  it('exposes the symbol constant', () => {
    expect(CREDIT_SYMBOL).toBe('₡');
  });
});
