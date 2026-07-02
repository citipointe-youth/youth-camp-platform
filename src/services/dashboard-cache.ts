import { ResponseCache } from '../utils/response-cache';
import type { Actor } from '../core/entities/user';
import type { DashboardResult } from './dashboard.service';

// Kept in its own module (not inside dashboard.service.ts) so writer services
// (person.service, import services, admin.service, etc.) can invalidate it
// without creating a circular import with dashboard.service.ts, which itself
// imports from person.service.ts (canAccessPerson). `DashboardResult` is a
// type-only import, so it's erased and doesn't introduce a runtime cycle.
const _cache = new ResponseCache<DashboardResult>(30_000);

function _actorKey(actor: Actor): string {
  return `${actor.role}:${actor.churchId ?? '_'}:${actor.zone ?? '_'}`;
}

export function getCachedDashboard(actor: Actor): DashboardResult | null {
  return _cache.get(_actorKey(actor));
}

export function setCachedDashboard(actor: Actor, value: DashboardResult): void {
  _cache.set(_actorKey(actor), value);
}

/** Invalidate on every write that can change a dashboard DTO field (people,
 * churches, notifications, settings/mode). When in doubt, call this —
 * correctness over hit rate; the TTL is short (30s) so hit rate is a minor win. */
export function invalidateDashboardCache(): void {
  _cache.invalidateAll();
}
