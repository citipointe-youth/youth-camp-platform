interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter (ported from connection-made-simple).
 *
 * Used to throttle login attempts per IP. Being in-memory it is per-instance — on
 * multi-instance hosting the effective limit is maxAttempts × instances, which is an
 * acceptable backstop against brute force (a shared store would be needed for a hard
 * global limit). State is intentionally not persisted.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt for `key`; returns true if it should be blocked. */
  isBlocked(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return false;
    }

    bucket.count += 1;
    return bucket.count > this.maxAttempts;
  }

  /** Seconds until the bucket for `key` resets (0 if none active). */
  retryAfterSeconds(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    return Math.ceil(Math.max(0, bucket.resetAt - Date.now()) / 1000);
  }
}
