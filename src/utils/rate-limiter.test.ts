import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limiter';

// Fixed-window limiter — failures-only counting (go-live rework 2026-07-02).
// Tests use generous windows so the suite never crosses a real time boundary.

describe('RateLimiter', () => {
  it('blocks a key only after maxAttempts FAILURES are recorded', () => {
    const rl = new RateLimiter(3, 60_000);
    expect(rl.isLimited('k')).toBe(false);
    rl.recordFailure('k'); // 1
    rl.recordFailure('k'); // 2
    expect(rl.isLimited('k')).toBe(false); // under the limit
    rl.recordFailure('k'); // 3 -> at the limit
    expect(rl.isLimited('k')).toBe(true);
    expect(rl.isLimited('k')).toBe(true); // stays blocked
  });

  it('isLimited is non-mutating — checking never consumes budget', () => {
    const rl = new RateLimiter(2, 60_000);
    rl.recordFailure('k'); // 1 of 2
    for (let i = 0; i < 20; i++) expect(rl.isLimited('k')).toBe(false);
    rl.recordFailure('k'); // 2 of 2 -> limit reached
    expect(rl.isLimited('k')).toBe(true);
  });

  it('tracks keys independently (ip+username keying: one user cannot lock out another)', () => {
    const rl = new RateLimiter(1, 60_000);
    rl.recordFailure('1.2.3.4|victory');
    expect(rl.isLimited('1.2.3.4|victory')).toBe(true);
    // Same IP (shared camp WiFi), different username — unaffected.
    expect(rl.isLimited('1.2.3.4|gracepoint')).toBe(false);
  });

  it('retryAfterSeconds is positive once a bucket exists, 0 for unknown keys', () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.retryAfterSeconds('unknown')).toBe(0);
    rl.recordFailure('x');
    const secs = rl.retryAfterSeconds('x');
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(60);
  });

  it('an expired window resets the bucket (windowMs 0 = immediate expiry)', () => {
    const rl = new RateLimiter(1, 0);
    rl.recordFailure('k');
    expect(rl.isLimited('k')).toBe(false); // window already over
    rl.recordFailure('k'); // starts a fresh bucket, count 1
    expect(rl.isLimited('k')).toBe(false);
  });
});
