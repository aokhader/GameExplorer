import type { Request } from 'express';

/**
 * Resolves the address a rate limiter should count a request against.
 *
 * ## Why this exists
 *
 * `req.ip` is wrong here, and measurably so. The real request chain in
 * production is **client → Cloudflare → Render → this process**, but `app.ts`
 * sets `trust proxy` to `1`. Express walks `X-Forwarded-For` from the *right*
 * and trusts one hop, so it stops at Render's internal load balancer and
 * returns something like `10.30.218.249` — and a probe run on 2026-09-22 got a
 * *different* internal address on the very next request (`10.24.134.235`).
 *
 * Every HTTP limiter was therefore keyed on a rotating internal address:
 * `authLimiter`, the only brute-force throttle in front of username sign-in,
 * counted nobody reliably and could still lock out an innocent user who landed
 * on a busy node.
 *
 * ## Why not just `trust proxy: true`
 *
 * Because that makes `req.ip` the **leftmost** `X-Forwarded-For` entry, which
 * is whatever the caller sent. That turns a limiter that counts the wrong thing
 * into one an attacker can step around with a header, which is strictly worse.
 * `trust proxy: 3` would be correct today but silently breaks the moment either
 * provider adds or removes a hop — and it breaks *open*.
 *
 * ## Why `cf-connecting-ip` is trustworthy
 *
 * Cloudflare sets it to the connecting client and refuses to pass through a
 * caller-supplied copy. Verified against production: a request carrying a
 * forged `CF-Connecting-IP` was rejected at the edge with HTTP 403 (`error
 * code: 1000`) and never reached this process at all. The origin is not
 * publicly addressable except through that edge.
 *
 * If the header is ever absent (a topology change, or local development), this
 * falls back to `true-client-ip` and then to `req.ip`, i.e. to the old — broken
 * but not forgeable — behaviour. That degradation is deliberate: losing
 * granularity is survivable, trusting an attacker-controlled value is not.
 */
export function clientIp(req: Request): string {
  const raw =
    firstHeader(req, 'cf-connecting-ip') ??
    firstHeader(req, 'true-client-ip') ??
    req.ip ??
    req.socket?.remoteAddress ??
    'unknown';

  return maskIp(raw);
}

function firstHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof single === 'string' ? single.trim() : '';
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Normalises an address into a limiter bucket key.
 *
 * IPv4 is used as-is. IPv6 is masked to its 64-bit prefix, because a single
 * residential or mobile subscriber is routinely handed a /64 (or larger) — so
 * without masking, one person has 2^64 buckets and is not limited at all.
 *
 * Exported for the regression test; `clientIp` is the entry point callers want.
 */
export function maskIp(input: string): string {
  let ip = input.trim();
  if (ip === '') return 'unknown';

  // "[2001:db8::1]:443" — bracketed IPv6 with a port.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];

  // "203.0.113.7:51234" — IPv4 with a port. Checked before the colon test
  // below, which would otherwise read the port as an IPv6 group.
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (v4WithPort) ip = v4WithPort[1];

  // "::ffff:203.0.113.7" — node hands back IPv4-mapped IPv6 on a dual-stack
  // socket. It is an IPv4 address; masking it to /64 would bucket the whole
  // internet together.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];

  // Drop any zone index ("fe80::1%eth0").
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);

  if (!ip.includes(':')) return ip; // IPv4, or something unparseable — key as-is.

  const groups = expandIpv6(ip);
  if (!groups) return ip; // Not parseable as IPv6; key on the literal string.

  return `${groups.slice(0, 4).join(':')}::/64`;
}

/** Expands `::` and returns the eight 16-bit groups, or null if malformed. */
function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const toGroups = (part: string): string[] => (part === '' ? [] : part.split(':'));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];

  // A trailing embedded IPv4 ("::ffff:192.0.2.1" in its general form) occupies
  // two groups, so it has to count as two when working out the gap.
  const width = (gs: string[]) => gs.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);

  let full: string[];
  if (halves.length === 2) {
    const gap = 8 - width(head) - width(tail);
    if (gap < 0) return null;
    full = [...head, ...Array<string>(gap).fill('0'), ...tail];
  } else {
    if (width(head) !== 8) return null;
    full = head;
  }

  return full.map(g => (g.includes('.') ? g : g.replace(/^0+(?=.)/, '').toLowerCase()));
}
