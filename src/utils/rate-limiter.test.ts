import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limiter';

// ---------------------------------------------------------------------------
// Fixed-window rate limiter (login throttle). Uses a large window so the test
// never crosses a real time boundary; isBlocked is called maxAttempts+1 times.
// ---------------------------------------------------------------------------

describe('RateLimiter', () => {
  it('allows up to maxAttempts, blocks the next attempt', () => {
    const rl = new RateLimiter(3, 60_000);
    expect(rl.isBlocked('ip1')).toBe(false); // 1
    expect(rl.isBlocked('ip1')).toBe(false); // 2
    expect(rl.isBlocked('ip1')).toBe(false); // 3
    expect(rl.isBlocked('ip1')).toBe(true); // 4 -> over the limit
    expect(rl.isBlocked('ip1')).toBe(true); // stays blocked
  });

  it('tracks separate buckets per key', () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.isBlocked('a')).toBe(false);
    expect(rl.isBlocked('a')).toBe(true);
    // 'b' is independent and still allowed.
    expect(rl.isBlocked('b')).toBe(false);
  });

  it('retryAfterSeconds is positive once a bucket exists, 0 for unknown keys', () => {
    const rl = new RateLimiter(1, 60_000);
    expect(rl.retryAfterSeconds('unknown')).toBe(0);
    rl.isBlocked('x');
    const secs = rl.retryAfterSeconds('x');
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(60);
  });

  it('a zero/elapsed window lets attempts through again (fresh bucket)', () => {
    // windowMs of 0 means every call starts a fresh window -> never blocks.
    const rl = new RateLimiter(1, 0);
    expect(rl.isBlocked('k')).toBe(false);
    expect(rl.isBlocked('k')).toBe(false);
  });
});
