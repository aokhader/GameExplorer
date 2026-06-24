// In-memory Redis fake — implements the subset of ioredis commands the
// multiplayer services use, so they can be exercised without a live Redis.
//
// Usage (the factory must be imported inside the vi.mock callback because
// vi.mock calls are hoisted above regular imports):
//
//   vi.mock('../config/redis', async () => {
//     const { createRedisFakeModule } = await import('./helpers/redis-fake');
//     return createRedisFakeModule();
//   });
//
// The returned object mirrors the real module's exports (`redis`,
// `RedisService`, `scanKeys`, ...). `redis.flushall()` resets all state
// between tests.

export function createRedisFakeModule() {
  const strings = new Map<string, string>();
  const hashes  = new Map<string, Map<string, string>>();
  const zsets   = new Map<string, Map<string, number>>();
  const sets    = new Map<string, Set<string>>();

  const globToRe = (pat: string) =>
    new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

  const redis = {
    async hset(key: string, ...args: unknown[]) {
      let h = hashes.get(key);
      if (!h) { h = new Map(); hashes.set(key, h); }
      if (args.length === 1 && typeof args[0] === 'object') {
        for (const [k, v] of Object.entries(args[0] as Record<string, unknown>)) h.set(k, String(v));
      } else {
        for (let i = 0; i < args.length; i += 2) h.set(String(args[i]), String(args[i + 1]));
      }
      return 1;
    },
    async hget(key: string, field: string) { return hashes.get(key)?.get(field) ?? null; },
    async hgetall(key: string) {
      const h = hashes.get(key);
      return h ? Object.fromEntries(h.entries()) : {};
    },
    // Extra args ('EX', ttl) are accepted and ignored — the fake never expires keys.
    async set(key: string, val: string) { strings.set(key, String(val)); return 'OK'; },
    async get(key: string) { return strings.get(key) ?? null; },
    async del(...keys: string[]) {
      let n = 0;
      for (const key of keys) {
        if (strings.delete(key)) n++;
        if (hashes.delete(key)) n++;
        if (zsets.delete(key)) n++;
        if (sets.delete(key)) n++;
      }
      return n;
    },
    async exists(key: string) {
      return (strings.has(key) || hashes.has(key) || zsets.has(key) || sets.has(key)) ? 1 : 0;
    },
    async expire() { return 1; },
    async pexpire() { return 1; },
    async incr(key: string) {
      const n = Number(strings.get(key) ?? '0') + 1;
      strings.set(key, String(n));
      return n;
    },
    async zadd(key: string, score: number, member: string) {
      let z = zsets.get(key);
      if (!z) { z = new Map(); zsets.set(key, z); }
      const isNew = !z.has(member);
      z.set(member, Number(score));
      return isNew ? 1 : 0;
    },
    async zrem(key: string, member: string) { return zsets.get(key)?.delete(member) ? 1 : 0; },
    async sadd(key: string, ...members: string[]) {
      let s = sets.get(key);
      if (!s) { s = new Set(); sets.set(key, s); }
      let added = 0;
      for (const m of members) { if (!s.has(m)) { s.add(m); added++; } }
      return added;
    },
    async srem(key: string, ...members: string[]) {
      const s = sets.get(key);
      if (!s) return 0;
      let removed = 0;
      for (const m of members) { if (s.delete(m)) removed++; }
      return removed;
    },
    async smembers(key: string) { return [...(sets.get(key) ?? [])]; },
    async zrangebyscore(key: string, min: number, max: number) {
      const z = zsets.get(key);
      if (!z) return [];
      return [...z.entries()]
        .filter(([, s]) => s >= min && s <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
    },
    async zrange(key: string, start: number, stop: number, withScores?: string) {
      const z = zsets.get(key);
      if (!z) return [];
      const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
      const end = stop === -1 ? sorted.length : stop + 1;
      const slice = sorted.slice(start, end);
      if (withScores && withScores.toUpperCase() === 'WITHSCORES') {
        return slice.flatMap(([m, s]) => [m, String(s)]);
      }
      return slice.map(([m]) => m);
    },
    async keys(pattern: string) {
      const re = globToRe(pattern);
      const all = new Set<string>([...strings.keys(), ...hashes.keys(), ...zsets.keys(), ...sets.keys()]);
      return [...all].filter(k => re.test(k));
    },
    async flushall() { strings.clear(); hashes.clear(); zsets.clear(); sets.clear(); return 'OK'; },
  };

  return {
    redis,
    // Always allow — per-socket move rate limiting is not under test, and the
    // E2E suites fire moves faster than the real 1-per-200ms budget.
    RedisService: {
      checkRateLimit: async () => ({ allowed: true, remaining: 1 }),
    },
    // Real impl iterates with SCAN; the fake just filters the in-memory keys.
    scanKeys: async (pattern: string) => redis.keys(pattern),
    checkRedisConnection: async () => true,
    disconnectRedis: async () => {},
  };
}
