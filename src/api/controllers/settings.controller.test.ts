import { describe, it, expect } from 'vitest';
import { makeSettingsController } from './settings.controller';
import type { SettingsService } from '../../services/settings.service';
import type { CampSettings } from '../../core/entities/settings';
import { SETTINGS_ID } from '../../core/entities/settings';
import type { HttpRequest } from '../http/types';

function settings(over: Partial<CampSettings> = {}): CampSettings {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: SETTINGS_ID, campName: 'Camp', year: 2026, startDate: '2026-07-01', endDate: '2026-07-05',
    timezone: 'Australia/Brisbane', checkInDays: [], accommodationLocked: false,
    tentPrice: 80, classroomPrice: 120, campMode: 'pre-camp', createdAt: now, updatedAt: now, ...over,
  };
}

// Minimal SettingsService stub returning a fixed settings object.
function controllerFor(s: CampSettings) {
  const svc = { get: async () => s } as unknown as SettingsService;
  return makeSettingsController({ settings: svc });
}

describe('GET /settings — public endpoint redaction (R9 security fix)', () => {
  it('NEVER returns lastTempPasswords (plaintext rollover passwords) on the public endpoint', async () => {
    const ctrl = controllerFor(settings({
      lastTempPasswords: [
        { username: 'victory', tempPassword: 'PLAINTEXT-1' },
        { username: 'gracepoint', tempPassword: 'PLAINTEXT-2' },
      ],
    }));
    const res = await ctrl.get({} as HttpRequest) as Record<string, unknown>;
    expect(res['lastTempPasswords']).toBeUndefined();
    // The actual secrets must not appear anywhere in the serialised response.
    expect(JSON.stringify(res)).not.toContain('PLAINTEXT-1');
    expect(JSON.stringify(res)).not.toContain('PLAINTEXT-2');
  });

  it('exposes a safe pendingTempPasswordCount instead', async () => {
    const ctrl = controllerFor(settings({
      lastTempPasswords: [
        { username: 'a', tempPassword: 'x' },
        { username: 'b', tempPassword: 'y' },
      ],
    }));
    const res = await ctrl.get({} as HttpRequest) as Record<string, unknown>;
    expect(res['pendingTempPasswordCount']).toBe(2);
  });

  it('reports 0 pending when there are no temp passwords, and still returns public fields', async () => {
    const ctrl = controllerFor(settings({ campName: 'Summer Camp', lastTempPasswords: null }));
    const res = await ctrl.get({} as HttpRequest) as Record<string, unknown>;
    expect(res['pendingTempPasswordCount']).toBe(0);
    expect(res['campName']).toBe('Summer Camp');
    expect(res['campMode']).toBe('pre-camp');
  });
});
