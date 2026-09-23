// Security audit v2, GX-18 — regression test for the rate-limiter key.
//
// The bug: `app.ts` sets `trust proxy` to 1, but the real chain in production is
// client → Cloudflare → Render, three hops. Express walks X-Forwarded-For from
// the right and trusts one hop, so `req.ip` returned a Render-internal load
// balancer address — and a probe on 2026-09-22 got a DIFFERENT internal address
// on the next request (10.30.218.249, then 10.24.134.235). Every HTTP limiter,
// including `authLimiter` in front of username sign-in, was keying on a rotating
// internal address and throttling nobody.
//
// These tests pin the three properties that make the replacement correct:
//   1. the Cloudflare header wins over req.ip,
//   2. a client-supplied X-Forwarded-For never influences the key,
//   3. IPv6 is bucketed by /64, so one subscriber is one bucket.
import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { clientIp, maskIp } from '../utils/clientIp';

/** Minimal Request stand-in — clientIp only reads headers, ip and the socket. */
function req(
  headers: Record<string, string | string[]>,
  ip?: string,
  remoteAddress?: string,
): Request {
  return { headers, ip, socket: { remoteAddress } } as unknown as Request;
}

describe('GX-18 · clientIp', () => {
  it('prefers cf-connecting-ip over req.ip', () => {
    // This is the whole fix: req.ip is the rotating Render-internal address,
    // cf-connecting-ip is the actual client. Cloudflare sets this header itself
    // and rejects a forged copy at the edge (verified in production: HTTP 403,
    // error code 1000 — the request never reached the origin).
    const r = req({ 'cf-connecting-ip': '108.253.179.240' }, '10.30.218.249');
    expect(clientIp(r)).toBe('108.253.179.240');
  });

  it('gives one client one key across requests that hit different Render nodes', () => {
    const first = clientIp(req({ 'cf-connecting-ip': '198.51.100.9' }, '10.30.218.249'));
    const second = clientIp(req({ 'cf-connecting-ip': '198.51.100.9' }, '10.24.134.235'));
    expect(first).toBe(second);
  });

  it('ignores a caller-supplied X-Forwarded-For entirely', () => {
    // The trap in this finding: `trust proxy: true` would have made req.ip the
    // LEFTMOST XFF entry, i.e. whatever the attacker sent. Nothing here reads
    // that header, so a forged value cannot move the bucket.
    const r = req(
      {
        'x-forwarded-for': '203.0.113.7, 108.253.179.240, 172.64.217.86, 10.30.218.249',
        'cf-connecting-ip': '108.253.179.240',
      },
      '10.30.218.249',
    );
    expect(clientIp(r)).toBe('108.253.179.240');
    expect(clientIp(r)).not.toContain('203.0.113.7');
  });

  it('falls back to true-client-ip, then req.ip, then the socket address', () => {
    expect(clientIp(req({ 'true-client-ip': '203.0.113.20' }, '10.0.0.1'))).toBe('203.0.113.20');
    expect(clientIp(req({}, '203.0.113.30'))).toBe('203.0.113.30');
    expect(clientIp(req({}, undefined, '203.0.113.40'))).toBe('203.0.113.40');
    expect(clientIp(req({}))).toBe('unknown');
  });

  it('ignores blank and array-valued headers', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '   ' }, '203.0.113.50'))).toBe('203.0.113.50');
    expect(clientIp(req({ 'cf-connecting-ip': ['203.0.113.60', '1.1.1.1'] }))).toBe('203.0.113.60');
  });
});

describe('GX-18 · maskIp', () => {
  it('leaves IPv4 alone, including the forms node and proxies produce', () => {
    expect(maskIp('203.0.113.7')).toBe('203.0.113.7');
    expect(maskIp('  203.0.113.7  ')).toBe('203.0.113.7');
    expect(maskIp('203.0.113.7:51234')).toBe('203.0.113.7');
    // Dual-stack sockets hand back IPv4-mapped IPv6; masking it to /64 would
    // bucket the entire IPv4 internet into one key.
    expect(maskIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('buckets an IPv6 client by /64', () => {
    // A residential or mobile subscriber is routinely handed a whole /64, so
    // without this one person would own 2^64 buckets and never be limited.
    const a = maskIp('2001:db8:1234:5678:aaaa:bbbb:cccc:dddd');
    const b = maskIp('2001:db8:1234:5678:1111:2222:3333:4444');
    expect(a).toBe(b);
    expect(a).toBe('2001:db8:1234:5678::/64');

    // A different /64 is a different bucket.
    expect(maskIp('2001:db8:1234:9999::1')).not.toBe(a);
  });

  it('expands :: correctly wherever it appears', () => {
    expect(maskIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(maskIp('::1')).toBe('0:0:0:0::/64');
    expect(maskIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(maskIp('[2001:db8:1:2:3:4:5:6]:443')).toBe('2001:db8:1:2::/64');
    // Leading zeros and case must not split one client into two buckets.
    expect(maskIp('2001:0DB8:0000:0001::9')).toBe(maskIp('2001:db8:0:1::9'));
  });

  it('never throws, and degrades to a literal key on garbage', () => {
    for (const junk of ['', '   ', 'not-an-ip', ':::::', 'unknown', '1:2:3']) {
      expect(() => maskIp(junk)).not.toThrow();
      expect(typeof maskIp(junk)).toBe('string');
    }
    expect(maskIp('')).toBe('unknown');
  });
});
