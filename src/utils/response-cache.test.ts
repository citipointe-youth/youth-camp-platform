import { describe, it, expect, afterEach, vi } from 'vitest';
import { ResponseCache } from './response-cache';

afterEach(() => vi.useRealTimers());

describe('ResponseCache', () => {
  it('returns null for a key that was never set', () => {
    const cache = new ResponseCache<string>(1000);
    expect(cache.get('missing')).toBeNull();
  });

  it('returns the value while within the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cache = new ResponseCache<string>(1000);
    cache.set('k', 'v');
    vi.setSystemTime(999);
    expect(cache.get('k')).toBe('v');
  });

  it('expires the value once the TTL has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cache = new ResponseCache<string>(1000);
    cache.set('k', 'v');
    vi.setSystemTime(1001);
    expect(cache.get('k')).toBeNull();
  });

  it('keeps distinct keys isolated from each other', () => {
    const cache = new ResponseCache<number>(1000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('invalidateAll() clears every key', () => {
    const cache = new ResponseCache<number>(1000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.invalidateAll();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});
