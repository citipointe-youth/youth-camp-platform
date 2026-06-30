import type { ISODateString } from '../types/common';
import type { CampMode } from '../types/enums';

export const SETTINGS_ID = 'settings' as const;

export interface CampSettings {
  id: typeof SETTINGS_ID;
  campName: string;
  year: number;
  startDate: string;
  endDate: string;
  timezone: string;
  // Pre-camp
  checkInBanner?: string | null;
  // At-camp
  checkInDays: string[];
  accommodationLocked: boolean;
  tentPrice: number;
  classroomPrice: number;
  // Account login locks (manual toggles in admin Settings). When true, accounts of that
  // role are blocked at LOGIN only (existing sessions keep working until their token TTL).
  // Default false; admin/director/firstAid are never affected.
  churchLoginLocked: boolean;
  zoneLeaderLoginLocked: boolean;
  // Mode switch
  campMode: CampMode;
  // Temp passwords from the most recent new-year rollover, cleared after export.
  lastTempPasswords?: Array<{ username: string; tempPassword: string }> | null;
  // Timestamp of the last successful audit export; wipe guard requires this to be set.
  lastExportedAt?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CampDefaults {
  id: 'defaults';
  churches: unknown[];
  users: unknown[];
  classrooms: unknown[];
  faqs: unknown[];
  schedule: unknown[];
  devotionals: unknown[];
  createdAt: ISODateString;
}
