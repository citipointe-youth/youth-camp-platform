import { describe, it, expect } from 'vitest';
import {
  isCamper,
  isRegistrant,
  toPersonKind,
  personFromRegistrant,
  personFromCamper,
  AT_CAMP_LIFECYCLES,
} from './person';
import type { Registrant } from './registrant';
import type { Camper } from './camper';

// ---------------------------------------------------------------------------
// Unit tests for the unified Person model (design D2). Lock the lifecycle
// semantics (a person becomes a "camper" at Day-1 sign-in) and the legacy
// Registrant/Camper -> Person mapping that bridges the staged merge.
// ---------------------------------------------------------------------------

function reg(over: Partial<Registrant> = {}): Registrant {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'r1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    kind: 'camper',
    grade: 9,
    accommodationKind: 'tent',
    accommodationLabel: 'Tent A',
    dietary: 'Vegetarian',
    medical: 'Asthma',
    paymentStatus: 'deposit',
    blueCardCollected: false,
    parentName: 'Byron',
    parentPhone: '0400 000 000',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    status: 'registered',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function camper(over: Partial<Camper> = {}): Camper {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'cmp1',
    firstName: 'Grace',
    lastName: 'Hopper',
    gender: 'female',
    dateOfBirth: '2012-12-09',
    grade: 8,
    school: 'Navy High',
    zone: 'Blue',
    groupId: 'g1',
    kind: 'student',
    mobile: '0411 111 111',
    email: 'grace@example.org',
    suburb: 'Brisbane',
    postcode: '4000',
    state: 'QLD',
    medicalConditions: ['Peanut allergy'],
    dietaryRequirements: ['Halal'],
    otherMedications: 'EpiPen',
    consents: {
      medical: { granted: true, timestamp: now },
      media: { granted: false, timestamp: null },
      supervision: { granted: true, timestamp: now },
    },
    parentGuardianName: 'Walter',
    parentPhone: '0422 222 222',
    parentRelation: 'Father',
    blueCardNumber: 'BC123',
    blueCardExpiry: '2027-01-01',
    churchId: 'c2',
    churchName: 'Grace Point',
    atCamp: true,
    status: 'checked_in',
    checkInHistory: [],
    signOutHistory: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('isCamper / isRegistrant lifecycle predicates', () => {
  it('a registered person is a registrant, not a camper', () => {
    expect(isRegistrant({ lifecycle: 'registered' })).toBe(true);
    expect(isCamper({ lifecycle: 'registered' })).toBe(false);
  });

  it('arrived / checked_out / departed are all campers (at camp)', () => {
    for (const lc of ['arrived', 'checked_out', 'departed'] as const) {
      expect(isCamper({ lifecycle: lc })).toBe(true);
      expect(isRegistrant({ lifecycle: lc })).toBe(false);
    }
  });

  it('cancelled is neither a registrant nor a camper', () => {
    expect(isCamper({ lifecycle: 'cancelled' })).toBe(false);
    expect(isRegistrant({ lifecycle: 'cancelled' })).toBe(false);
  });

  it('AT_CAMP_LIFECYCLES is exactly the three at-camp states', () => {
    expect([...AT_CAMP_LIFECYCLES].sort()).toEqual(['arrived', 'checked_out', 'departed']);
  });
});

describe('toPersonKind — taxonomy collapse', () => {
  it('maps leader -> leader', () => {
    expect(toPersonKind('leader')).toBe('leader');
  });
  it('maps the youth-ish kinds (camper, student) -> youth', () => {
    expect(toPersonKind('camper')).toBe('youth');
    expect(toPersonKind('student')).toBe('youth');
  });
  it('defaults anything unexpected to youth', () => {
    expect(toPersonKind('')).toBe('youth');
    expect(toPersonKind('something')).toBe('youth');
  });
});

describe('personFromRegistrant', () => {
  it('maps a registered registrant to a registered, not-at-camp person', () => {
    const p = personFromRegistrant(reg());
    expect(p.lifecycle).toBe('registered');
    expect(p.atCamp).toBe(false);
    expect(isRegistrant(p)).toBe(true);
    expect(p.kind).toBe('youth'); // 'camper' -> 'youth'
  });

  it('maps a cancelled registrant to the cancelled lifecycle', () => {
    const p = personFromRegistrant(reg({ status: 'cancelled' }));
    expect(p.lifecycle).toBe('cancelled');
  });

  it('lifts scalar medical/dietary into arrays and preserves pre-camp fields', () => {
    const p = personFromRegistrant(reg({ medical: 'Asthma', dietary: 'Vegetarian' }));
    expect(p.medicalConditions).toEqual(['Asthma']);
    expect(p.dietaryRequirements).toEqual(['Vegetarian']);
    expect(p.paymentStatus).toBe('deposit');
    expect(p.accommodationKind).toBe('tent');
    expect(p.accommodationLabel).toBe('Tent A');
    expect(p.parentGuardianName).toBe('Byron');
  });

  it('produces empty arrays when scalar medical/dietary are absent', () => {
    const p = personFromRegistrant(reg({ medical: null, dietary: null }));
    expect(p.medicalConditions).toEqual([]);
    expect(p.dietaryRequirements).toEqual([]);
  });

  it('leader kind is preserved', () => {
    expect(personFromRegistrant(reg({ kind: 'leader' })).kind).toBe('leader');
  });
});

describe('personFromCamper', () => {
  it('derives lifecycle=arrived from a checked_in camper and keeps atCamp', () => {
    const p = personFromCamper(camper({ status: 'checked_in', atCamp: true }));
    expect(p.lifecycle).toBe('arrived');
    expect(p.atCamp).toBe(true);
    expect(isCamper(p)).toBe(true);
    expect(p.kind).toBe('youth'); // 'student' -> 'youth'
  });

  it('maps each camper status to the matching lifecycle', () => {
    expect(personFromCamper(camper({ status: 'registered' })).lifecycle).toBe('registered');
    expect(personFromCamper(camper({ status: 'checked_in' })).lifecycle).toBe('arrived');
    expect(personFromCamper(camper({ status: 'checked_out' })).lifecycle).toBe('checked_out');
    expect(personFromCamper(camper({ status: 'departed' })).lifecycle).toBe('departed');
    expect(personFromCamper(camper({ status: 'cancelled' })).lifecycle).toBe('cancelled');
  });

  it('preserves the full care record (consents, blue card, medical arrays)', () => {
    const p = personFromCamper(camper());
    expect(p.consents.medical.granted).toBe(true);
    expect(p.consents.media.granted).toBe(false);
    expect(p.blueCardNumber).toBe('BC123');
    expect(p.medicalConditions).toEqual(['Peanut allergy']);
    expect(p.otherMedications).toBe('EpiPen');
  });
});
