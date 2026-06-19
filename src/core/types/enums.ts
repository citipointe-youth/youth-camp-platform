export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const GRADES = [7, 8, 9, 10, 11, 12] as const;
export type Grade = (typeof GRADES)[number];

export const ZONE_NAMES = ['Yellow', 'Blue', 'Green', 'Red'] as const;
export type ZoneName = (typeof ZONE_NAMES)[number];

// Combined roles — church is the shared per-church login (covers both pre-camp and at-camp)
export const USER_ROLES = ['church', 'zoneLeader', 'director', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOMMODATION_KINDS = ['tent', 'classroom'] as const;
export type AccommodationKind = (typeof ACCOMMODATION_KINDS)[number];

export const PAYMENT_STATUSES = ['unpaid', 'deposit', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REGISTRANT_STATUSES = ['registered', 'cancelled'] as const;
export type RegistrantStatus = (typeof REGISTRANT_STATUSES)[number];

export const REGISTRANT_KINDS = ['camper', 'leader'] as const;
export type RegistrantKind = (typeof REGISTRANT_KINDS)[number];

export const CAMPER_STATUSES = ['registered', 'checked_in', 'checked_out', 'departed', 'cancelled'] as const;
export type CamperStatus = (typeof CAMPER_STATUSES)[number];

export const CAMPER_KINDS = ['student', 'leader'] as const;
export type CamperKind = (typeof CAMPER_KINDS)[number];

// Unified Person taxonomy (design D2) — collapses the mismatched camper|leader /
// student|leader kinds into one.
export const PERSON_KINDS = ['youth', 'leader'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

// Unified Person lifecycle (design D2). Pre-camp: registered/cancelled. A person
// becomes a "camper" at their Day-1 first check-in (registered -> arrived).
export const PERSON_LIFECYCLES = [
  'registered',
  'arrived',
  'checked_out',
  'departed',
  'cancelled',
] as const;
export type PersonLifecycle = (typeof PERSON_LIFECYCLES)[number];

export const NOTIFICATION_SCOPES = ['camp', 'zone', 'church'] as const;
export type NotificationScope = (typeof NOTIFICATION_SCOPES)[number];

export const NOTIFICATION_PRIORITIES = ['normal', 'urgent'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const SCHEDULE_ITEM_TYPES = ['meal', 'session', 'activity', 'free', 'logistics'] as const;
export type ScheduleItemType = (typeof SCHEDULE_ITEM_TYPES)[number];

export const CHECK_IN_TYPES = ['in', 'out'] as const;
export type CheckInType = (typeof CHECK_IN_TYPES)[number];

export const CONSENT_TYPES = ['medical', 'media', 'supervision'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CAMP_MODES = ['pre-camp', 'at-camp'] as const;
export type CampMode = (typeof CAMP_MODES)[number];
