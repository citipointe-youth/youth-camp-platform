import type { Actor } from '../core/entities/user';
import type { NotificationScope, UserRole } from '../core/types/enums';
import { ForbiddenError } from '../core/errors/app-error';

export type Action =
  | 'registrant:read'
  | 'registrant:write'
  | 'reminder:send'
  | 'camper:read'
  | 'camper:read:sensitive'
  | 'camper:write'
  | 'checkin:write'
  | 'attendance:write'
  | 'note:write'
  | 'note:read'
  // First-aid records (Phase 4). A first-aid record is a StudentNote with category 'firstaid'.
  // Kept as their own capabilities so firstAid (and church) get first-aid access WITHOUT gaining
  // general note read/write. note.service asserts note:write:firstaid only when category==='firstaid'.
  | 'note:write:firstaid'
  | 'note:read:firstaid'
  | 'notification:send:zone'
  | 'notification:send:camp'
  | 'import:run'
  | 'admin:manage';

const ROLE_PERMISSIONS: Record<UserRole, Set<Action>> = {
  // church is the shared per-church login — handles both pre-camp registrations and at-camp check-in
  church: new Set<Action>([
    'registrant:read',
    'registrant:write',
    'reminder:send',
    'camper:read',
    'camper:read:sensitive',
    'checkin:write',
    'attendance:write',
    'note:write',
    // Phase 4: church can READ first-aid records for its OWN church's campers (scoped by
    // canAccessPerson). It gets no first-aid WRITE and no general note:read.
    'note:read:firstaid',
  ]),
  zoneLeader: new Set<Action>([
    'registrant:read',
    'camper:read',
    'camper:read:sensitive',
    'checkin:write',
    'attendance:write',
    'note:write',
    'note:read',
    'note:read:firstaid',
    'notification:send:zone',
  ]),
  director: new Set<Action>([
    'registrant:read',
    'registrant:write',
    'reminder:send',
    'camper:read',
    'camper:read:sensitive',
    'camper:write',
    'checkin:write',
    'attendance:write',
    'note:write',
    'note:write:firstaid',
    'note:read',
    'note:read:firstaid',
    'notification:send:zone',
    'notification:send:camp',
    'import:run',
  ]),
  admin: new Set<Action>([
    'registrant:read',
    'registrant:write',
    'reminder:send',
    'camper:read',
    'camper:read:sensitive',
    'camper:write',
    'checkin:write',
    'attendance:write',
    'note:write',
    'note:write:firstaid',
    'note:read',
    'note:read:firstaid',
    'notification:send:zone',
    'notification:send:camp',
    'import:run',
    'admin:manage',
  ]),
  // firstAid: read-only at-camp access PLUS first-aid record logging (Phase 4).
  // No registrant:read (pre-camp hub is not accessible). attendance:write allows attendance
  // sign-in/out only. checkin:write is intentionally withheld — firstAid must not record daily
  // session entries, only physical presence events. note:write:firstaid lets it log first-aid
  // records (category 'firstaid' only — enforced in note.service); note:read:firstaid lets it
  // read them. firstAid does NOT get general note:write/note:read (no testimonies/general notes).
  // Cannot send notifications — canSendNotification() returns false via default paths (intentional).
  firstAid: new Set<Action>([
    'camper:read',
    'camper:read:sensitive',
    'attendance:write',
    'note:write:firstaid',
    'note:read:firstaid',
  ]),
};

export function can(actor: Actor, action: Action): boolean {
  return ROLE_PERMISSIONS[actor.role]?.has(action) ?? false;
}

export function assertCan(actor: Actor, action: Action): void {
  if (!can(actor, action)) {
    throw new ForbiddenError(`Role '${actor.role}' cannot perform '${action}'`);
  }
}

/**
 * Returns true if the actor can access data for the given church.
 * - church: own church only
 * - zoneLeader: own zone's churches (caller must check zone)
 * - director/admin/firstAid: all
 */
export function canAccessChurch(actor: Actor, churchId: string, churchZone?: string): boolean {
  switch (actor.role) {
    case 'admin':
    case 'director':
    case 'firstAid':
      return true;
    case 'zoneLeader':
      if (!actor.zone || !churchZone) return false;
      return actor.zone === churchZone;
    case 'church':
      return actor.churchId === churchId;
    default:
      return false;
  }
}

export function assertCanAccessChurch(actor: Actor, churchId: string, churchZone?: string): void {
  if (!canAccessChurch(actor, churchId, churchZone)) {
    throw new ForbiddenError('Access denied to this church');
  }
}

/**
 * Returns true if actor can send a notification with the given scope/zone.
 */
export function canSendNotification(actor: Actor, scope: NotificationScope, zone?: string | null): boolean {
  if (scope === 'camp') {
    return can(actor, 'notification:send:camp');
  }
  if (scope === 'zone') {
    if (!can(actor, 'notification:send:zone')) return false;
    if (actor.role === 'zoneLeader') {
      return !zone || actor.zone === zone;
    }
    return true;
  }
  if (scope === 'church') {
    // Church-scoped notifications: church to own church, director/admin to any
    if (actor.role === 'admin' || actor.role === 'director') return true;
    return false;
  }
  return false;
}

export function assertCanSendNotification(actor: Actor, scope: NotificationScope, zone?: string | null): void {
  if (!canSendNotification(actor, scope, zone)) {
    throw new ForbiddenError(`Cannot send '${scope}' notification`);
  }
}
