// The Bloom filter's two promises are what this pins: it NEVER says "not here"
// for a key that was added (the username check would call a taken name free),
// and it says "maybe" for absent keys at about the rate it was sized for (any
// higher and it saves fewer database lookups than it claims). Fixed seeds make
// every measured rate below deterministic.
import { describe, it, expect } from 'vitest';
import { BloomFilter, murmur3_32, sizeFor } from '../bloomFilter';

const SEEDS = [0x9747b28c, 0x1b873593] as const;
const names = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}_${i}`);

function falsePositiveRate(filter: BloomFilter, absent: string[]): number {
  return absent.filter((key) => filter.mightContain(key)).length / absent.length;
}

describe('murmur3_32', () => {
  it('matches the reference implementation', () => {
    expect(murmur3_32('', 0)).toBe(0);
    expect(murmur3_32('', 1)).toBe(0x514e28b7);
    expect(murmur3_32('', 0xffffffff)).toBe(0x81f16f39);
    expect(murmur3_32('test', 0)).toBe(0xba6bd213);
    expect(murmur3_32('Hello, world!', 0)).toBe(0xc0363e43);
    expect(murmur3_32('The quick brown fox jumps over the lazy dog', 0)).toBe(0x2e4ff723);
  });

  it('covers every tail length', () => {
    // 1, 2 and 3 trailing bytes each take a different branch.
    expect(murmur3_32('a', 0)).toBe(0x3c2569b2);
    expect(murmur3_32('ab', 0)).toBe(0x9bbfd75f);
    expect(murmur3_32('abc', 0)).toBe(0xb3dd93fa);
  });
});

describe('sizeFor', () => {
  it('gives 9.59 bits a key and 7 hashes at 1%', () => {
    expect(sizeFor(10_000, 0.01)).toEqual({ bits: 95_851, hashes: 7 });
  });

  it('refuses a capacity or rate it cannot size', () => {
    expect(() => sizeFor(0, 0.01)).toThrow(RangeError);
    expect(() => sizeFor(1.5, 0.01)).toThrow(RangeError);
    expect(() => sizeFor(100, 0)).toThrow(RangeError);
    expect(() => sizeFor(100, 1)).toThrow(RangeError);
    expect(() => sizeFor(100, Number.NaN)).toThrow(RangeError);
  });
});

describe('BloomFilter', () => {
  it('never answers "not here" for a key it was given', () => {
    const filter = new BloomFilter(10_000, 0.01, SEEDS);
    const added = names('user', 10_000);
    added.forEach((key) => filter.add(key));
    expect(added.every((key) => filter.mightContain(key))).toBe(true);
  });

  it('says "maybe" for absent keys at about the rate it was sized for', () => {
    const filter = new BloomFilter(10_000, 0.01, SEEDS);
    names('user', 10_000).forEach((key) => filter.add(key));

    const rate = falsePositiveRate(filter, names('absent', 100_000));
    expect(rate).toBeGreaterThan(0.005);
    expect(rate).toBeLessThan(0.015);
  });

  it('degrades well past capacity, which is why the username filter rebuilds', () => {
    const filter = new BloomFilter(10_000, 0.01, SEEDS);
    names('user', 20_000).forEach((key) => filter.add(key));
    // Theory says about 16% at twice the load.
    expect(falsePositiveRate(filter, names('absent', 20_000))).toBeGreaterThan(0.1);
  });

  it('counts a key once however often it is added', () => {
    const filter = new BloomFilter(100, 0.01, SEEDS);
    filter.add('bob');
    filter.add('bob');
    filter.add('alice');
    expect(filter.size).toBe(2);
  });

  it('is case-sensitive: folding case is the caller’s job', () => {
    const filter = new BloomFilter(100, 0.01, SEEDS);
    filter.add('bob');
    expect(filter.mightContain('bob')).toBe(true);
    expect(filter.mightContain('BOB')).toBe(false);
  });

  it('collides on different absent keys under different seeds', () => {
    const added = names('user', 2_000);
    const absent = names('absent', 20_000);
    const collisions = (seeds: readonly [number, number]) => {
      const filter = new BloomFilter(2_000, 0.01, seeds);
      added.forEach((key) => filter.add(key));
      return new Set(absent.filter((key) => filter.mightContain(key)));
    };
    const first = collisions(SEEDS);
    const second = collisions([1, 2]);
    expect(first.size).toBeGreaterThan(0);
    expect([...first].filter((key) => second.has(key)).length).toBeLessThan(first.size / 2);
  });

  it('takes about 12 KiB for 10,000 names', () => {
    expect(new BloomFilter(10_000, 0.01, SEEDS).byteLength).toBe(11_982);
  });
});
