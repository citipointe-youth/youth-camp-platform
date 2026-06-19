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
  checkInLocation: string;
  checkInFrom: string;
  checkInBanner?: string | null;
  registerBaseUrl: string;
  // At-camp
  checkInDays: string[];
  accommodationLocked: boolean;
  // Mode switch
  campMode: CampMode;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CampDefaults {
  id: 'defaults';
  churches: unknown[];
  users: unknown[];
  accommodationBlocks: unknown[];
  faqs: unknown[];
  schedule: unknown[];
  devotionals: unknown[];
  createdAt: ISODateString;
}
