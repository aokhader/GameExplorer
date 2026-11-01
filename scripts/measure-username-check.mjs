#!/usr/bin/env node
// Time the username availability check, to see what the username Bloom filter
// saves. Plan: project-docs/username-bloom-filter-plan.md ("Measuring it").
//
//   node scripts/measure-username-check.mjs [--api <origin>] [--rounds <n>]
//
// Defaults to the PRODUCTION API. Every request counts against
// usernameCheckLimiter (60 per 15 minutes per address), so a run makes
// 3 × rounds + 1 requests and refuses to make more than 58. Do not run it twice
// inside 15 minutes from the same address, or the second run measures 429s.
//
// Three probes, interleaved, so a slow patch of network hits all three alike:
//   refused  `zq*probe…` — refused by the grammar before the filter or the
//            database: the cost of reaching the API at all
//   free     a random unused name: the filter's path. With the filter built,
//            no database lookup; without it (or before it deploys), one lookup
//   fresh    the same kind of name with fresh=1: always a database lookup.
//            An API without the filter ignores the flag
//
// fresh − refused ≈ the database hop. fresh − free ≈ what the filter saves.
// Plain node on purpose: it imports nothing from the workspace.

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const api = flag('api', 'https://gameexplorer-api.onrender.com').replace(/\/+$/, '');
const rounds = Number(flag('rounds', '15'));
if (!Number.isInteger(rounds) || rounds < 1 || 3 * rounds + 1 > 58) {
  console.error('--rounds must be a whole number from 1 to 19 (the limiter allows 60 checks per 15 minutes)');
  process.exit(1);
}

const randomName = () => `zqm_${Math.random().toString(36).slice(2, 10)}`;

async function probe(username, fresh, timeoutMs = 15_000) {
  const url = `${api}/api/auth/username-available?username=${encodeURIComponent(username)}${fresh ? '&fresh=1' : ''}`;
  const started = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => null);
  return { ms: performance.now() - started, status: res.status, body };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

console.log(`API ${api}, ${rounds} rounds`);
process.stdout.write('Waking the API (a cold start takes up to a minute)… ');
try {
  const warm = await probe('zq*warm', false, 90_000);
  console.log(`${warm.status} in ${Math.round(warm.ms)} ms (not counted)`);
} catch (err) {
  console.log(`failed: ${err.message}`);
  process.exit(1);
}

const samples = { refused: [], free: [], fresh: [] };
const expected = { refused: 'invalid-format', free: 'ok', fresh: 'ok' };

for (let round = 0; round < rounds; round++) {
  const plan = [
    ['refused', `zq*probe${round}`, false],
    ['free', randomName(), false],
    ['fresh', randomName(), true],
  ];
  // Rotate the order each round.
  for (let i = 0; i < plan.length; i++) {
    const [kind, name, fresh] = plan[(i + round) % plan.length];
    const { ms, status, body } = await probe(name, fresh);
    if (status === 429) {
      console.error('Rate limited (429): wait 15 minutes before running again.');
      process.exit(1);
    }
    if (status !== 200 || body?.reason !== expected[kind]) {
      console.warn(`  ${kind} ${name}: unexpected ${status} ${JSON.stringify(body)}, not counted`);
      continue;
    }
    samples[kind].push(ms);
  }
}

const row = (kind) => {
  const values = samples[kind];
  if (values.length === 0) return `${kind.padEnd(8)} no samples`;
  const fmt = (n) => `${Math.round(n)} ms`.padStart(7);
  return `${kind.padEnd(8)} n=${String(values.length).padStart(2)}  median ${fmt(percentile(values, 50))}  p90 ${fmt(percentile(values, 90))}  min ${fmt(Math.min(...values))}`;
};

console.log('');
for (const kind of ['refused', 'free', 'fresh']) console.log(row(kind));

const median = (kind) => (samples[kind].length ? percentile(samples[kind], 50) : NaN);
console.log('');
console.log(`${'database hop'.padEnd(19)} ≈ fresh − refused = ${Math.round(median('fresh') - median('refused'))} ms`);
console.log(`${'saved by the filter'.padEnd(19)} ≈ fresh − free    = ${Math.round(median('fresh') - median('free'))} ms`);
console.log('(Before the filter deploys, "free" also does a lookup, so the second line reads about 0.)');
