import { describe, it, expect } from 'vitest';
import {
  can,
  assertCan,
  canAccessChurch,
  canSendNotification,
} from './access-control';
import { canAccessPerson } from './person.service';
import type { Actor } from '../core/entities/user';
import { ForbiddenError } from '../core/errors/app-error';

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u1', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

describe('access-control: can()', () => {
  it('only admin can admin:manage', () => {
    expect(can(actor('admin'), 'admin:manage')).toBe(true);
    expect(can(actor('director'), 'admin:manage')).toBe(false);
    expect(can(actor('church'), 'admin:manage')).toBe(false);
  });

  it('church can write registrants + check in, but cannot import or send camp-wide notices', () => {
    const c = actor('church');
    expect(can(c, 'registrant:write')).toBe(true);
    expect(can(c, 'checkin:write')).toBe(true);
    expect(can(c, 'import:run')).toBe(false);
    expect(can(c, 'notification:send:camp')).toBe(false);
  });

  it('church can READ first-aid records (own church) but cannot WRITE them or read general notes (Phase 4)', () => {
    const c = actor('church');
    expect(can(c, 'note:read:firstaid')).toBe(true);
    expect(can(c, 'note:write:firstaid')).toBe(false);
    expect(can(c, 'note:read')).toBe(false);
  });

  it('zoneLeader can send zone notices but not camp-wide; director can do both', () => {
    expect(can(actor('zoneLeader'), 'notification:send:zone')).toBe(true);
    expect(can(actor('zoneLeader'), 'notification:send:camp')).toBe(false);
    expect(can(actor('director'), 'notification:send:zone')).toBe(true);
    expect(can(actor('director'), 'notification:send:camp')).toBe(true);
  });

  it('zoneLeader cannot write registrants (read-only on rego)', () => {
    expect(can(actor('zoneLeader'), 'registrant:read')).toBe(true);
    expect(can(actor('zoneLeader'), 'registrant:write')).toBe(false);
  });
});

describe('access-control: assertCan()', () => {
  it('throws ForbiddenError when denied', () => {
    expect(() => assertCan(actor('church'), 'admin:manage')).toThrow(ForbiddenError);
  });
  it('does not throw when allowed', () => {
    expect(() => assertCan(actor('admin'), 'admin:manage')).not.toThrow();
  });
});

describe('access-control: canAccessChurch()', () => {
  it('church sees only its own church', () => {
    const c = actor('church', { churchId: 'c1' });
    expect(canAccessChurch(c, 'c1')).toBe(true);
    expect(canAccessChurch(c, 'c2')).toBe(false);
  });

  it('zoneLeader sees churches in its own zone only', () => {
    const z = actor('zoneLeader', { zone: 'Yellow' });
    expect(canAccessChurch(z, 'c1', 'Yellow')).toBe(true);
    expect(canAccessChurch(z, 'c1', 'Blue')).toBe(false);
    // missing zone info is denied, not allowed
    expect(canAccessChurch(z, 'c1')).toBe(false);
  });

  it('director and admin see every church', () => {
    expect(canAccessChurch(actor('director'), 'cX')).toBe(true);
    expect(canAccessChurch(actor('admin'), 'cX')).toBe(true);
  });
});

describe('access-control: firstAid role', () => {
  it('firstAid can read campers + sensitive data', () => {
    expect(can(actor('firstAid'), 'camper:read')).toBe(true);
    expect(can(actor('firstAid'), 'camper:read:sensitive')).toBe(true);
  });

  it('firstAid has attendance:write but NOT checkin:write (session check-in blocked at API level)', () => {
    expect(can(actor('firstAid'), 'attendance:write')).toBe(true);
    expect(can(actor('firstAid'), 'checkin:write')).toBe(false);
  });

  it('firstAid cannot read registrants, write GENERAL notes, or manage admin', () => {
    expect(can(actor('firstAid'), 'registrant:read')).toBe(false);
    expect(can(actor('firstAid'), 'note:write')).toBe(false);
    expect(can(actor('firstAid'), 'note:read')).toBe(false);
    expect(can(actor('firstAid'), 'admin:manage')).toBe(false);
  });

  it('firstAid CAN write + read first-aid records (Phase 4), without general note access', () => {
    expect(can(actor('firstAid'), 'note:write:firstaid')).toBe(true);
    expect(can(actor('firstAid'), 'note:read:firstaid')).toBe(true);
    // but NOT the general capabilities
    expect(can(actor('firstAid'), 'note:write')).toBe(false);
    expect(can(actor('firstAid'), 'note:read')).toBe(false);
  });

  it('canAccessPerson: firstAid can access any person regardless of church/zone', () => {
    const fa = actor('firstAid');
    expect(canAccessPerson(fa, { churchId: 'any-church', zone: 'Yellow' })).toBe(true);
    expect(canAccessPerson(fa, { churchId: 'other-church', zone: 'Blue' })).toBe(true);
  });

  it('canAccessChurch: firstAid can access any church', () => {
    expect(canAccessChurch(actor('firstAid'), 'any-church')).toBe(true);
    expect(canAccessChurch(actor('firstAid'), 'other-church', 'Red')).toBe(true);
  });

  it('firstAid cannot send any notification scope', () => {
    const fa = actor('firstAid');
    expect(canSendNotification(fa, 'camp')).toBe(false);
    expect(canSendNotification(fa, 'zone', 'Yellow')).toBe(false);
    expect(canSendNotification(fa, 'church')).toBe(false);
  });
});

describe('access-control: canSendNotification()', () => {
  it('zoneLeader can only target its own zone, never camp-wide', () => {
    const z = actor('zoneLeader', { zone: 'Yellow' });
    expect(canSendNotification(z, 'zone', 'Yellow')).toBe(true);
    expect(canSendNotification(z, 'zone', 'Blue')).toBe(false);
    expect(canSendNotification(z, 'camp')).toBe(false);
  });

  it('director can send camp-wide, any zone, and church-scoped', () => {
    const d = actor('director');
    expect(canSendNotification(d, 'camp')).toBe(true);
    expect(canSendNotification(d, 'zone', 'Blue')).toBe(true);
    expect(canSendNotification(d, 'church')).toBe(true);
  });

  it('church accounts cannot originate church-scoped notices (leadership only)', () => {
    expect(canSendNotification(actor('church', { churchId: 'c1' }), 'church')).toBe(false);
  });
});
