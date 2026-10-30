// A Bloom filter: a set that answers "definitely not here" or "maybe here",
// never "definitely here". At a 1% false-positive rate it costs about 9.6 bits
// per member, where a Set of the same strings costs tens of bytes each.
//
// Its one caller is the username filter (services/usernameFilter.service.ts),
// which uses "definitely not here" to skip a database lookup.
//
// Hashing: a seeded 32-bit MurmurHash3, run twice with different seeds. Bit i
// of k is (h1 + i·h2) mod m — Kirsch–Mitzenmacher double hashing, which gives
// the false-positive rate of k independent hashes for the cost of two. The
// seeds are random per filter unless given, so which absent keys collide
// changes on every restart. Pass seeds only from tests.
import { randomInt } from 'crypto';

export interface BloomSize {
  /** m: bits in the array. */
  bits: number;
  /** k: bits set per key. */
  hashes: number;
}

/**
 * The textbook sizing for `capacity` keys at a target false-positive rate:
 * m = −n·ln p / (ln 2)², k = (m / n)·ln 2. At p = 1% that is 9.59 bits a key
 * and k = 7.
 */
export function sizeFor(capacity: number, falsePositiveRate: number): BloomSize {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  if (!(falsePositiveRate > 0 && falsePositiveRate < 1)) {
    throw new RangeError(`falsePositiveRate must be between 0 and 1, got ${falsePositiveRate}`);
  }
  const bits = Math.ceil((-capacity * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
  const hashes = Math.max(1, Math.round((bits / capacity) * Math.LN2));
  return { bits, hashes };
}

/** MurmurHash3, x86 32-bit variant, over the key's UTF-8 bytes. Unsigned result. */
export function murmur3_32(key: string, seed: number): number {
  const data = Buffer.from(key, 'utf8');
  const len = data.length;
  const blocks = len & ~3;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h = seed >>> 0;

  for (let i = 0; i < blocks; i += 4) {
    let k = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }

  const tail = len & 3;
  if (tail > 0) {
    let k = 0;
    if (tail === 3) k ^= data[blocks + 2] << 16;
    if (tail >= 2) k ^= data[blocks + 1] << 8;
    k ^= data[blocks];
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
  }

  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const randomSeed = () => randomInt(0, 0x1_0000_0000);

export class BloomFilter {
  /** How many keys it was sized for. Past this, the false-positive rate climbs. */
  readonly capacity: number;
  readonly bits: number;
  readonly hashes: number;
  private readonly array: Uint8Array;
  private readonly seeds: readonly [number, number];
  private distinct = 0;

  constructor(
    capacity: number,
    falsePositiveRate: number,
    seeds: readonly [number, number] = [randomSeed(), randomSeed()],
  ) {
    const { bits, hashes } = sizeFor(capacity, falsePositiveRate);
    this.capacity = capacity;
    this.bits = bits;
    this.hashes = hashes;
    this.array = new Uint8Array(Math.ceil(bits / 8));
    this.seeds = seeds;
  }

  /**
   * Roughly how many distinct keys are in it. A key counts once, however often
   * it is added — the username filter's poll re-adds the same recent names
   * every time, and that must not look like growth. It undercounts by the keys
   * that were false positives when added, about the false-positive rate.
   */
  get size(): number {
    return this.distinct;
  }

  /** Bytes the bit array occupies. */
  get byteLength(): number {
    return this.array.byteLength;
  }

  add(key: string): void {
    let setAny = false;
    for (const index of this.indexes(key)) {
      const byte = index >>> 3;
      const mask = 1 << (index & 7);
      if ((this.array[byte] & mask) === 0) {
        this.array[byte] |= mask;
        setAny = true;
      }
    }
    if (setAny) this.distinct++;
  }

  /** False means the key was never added. True means it probably was. */
  mightContain(key: string): boolean {
    for (const index of this.indexes(key)) {
      if ((this.array[index >>> 3] & (1 << (index & 7))) === 0) return false;
    }
    return true;
  }

  private *indexes(key: string): Generator<number> {
    const h1 = murmur3_32(key, this.seeds[0]);
    // Forced odd so the stride is never 0, which would set one bit k times.
    const h2 = (murmur3_32(key, this.seeds[1]) | 1) >>> 0;
    for (let i = 0; i < this.hashes; i++) {
      // Far below 2^53 for any k a real sizing produces, so this is exact.
      yield (h1 + i * h2) % this.bits;
    }
  }
}
