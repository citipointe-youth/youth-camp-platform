interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter (originally ported from connection-made-simple).
 *
 * Used to throttle login attempts. Reworked for go-live (2026-07-02):
 * - The caller keys buckets by ip+username (not bare IP) — at a camp venue every
 *   device shares ONE public IP behind the WiFi NAT, so a bare-IP bucket was a single
 *   shared 10-attempt pool for 200 leaders re-logging-in each morning (12h token TTL).
 * - Only FAILED attempts count (`recordFailure`), checked non-mutatingly via
 *   `isLimited` — successful logins never consume the budget.
 *
 * Being in-memory it is per-instance — on multi-instance hosting the effective limit
 * is maxAttempts × instances, an acceptable backstop against brute force (a shared
 * store would be needed for a hard global limit). State is intentionally not persisted.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /** Non-mutating: is `key` currently over the failure limit? */
  isLimited(key: string): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() >= bucket.resetAt) return false;
    return bucket.count >= this.maxAttempts;
  }

  /** Record a FAILED attempt for `key` (successful attempts must not be recorded). */
  recordFailure(key: string): void {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    bucket.count += 1;
  }

  /** Seconds until the bucket for `key` resets (0 if none active or already expired). */
  retryAfterSeconds(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    return Math.ceil(Math.max(0, bucket.resetAt - Date.now()) / 1000);
  }
}
