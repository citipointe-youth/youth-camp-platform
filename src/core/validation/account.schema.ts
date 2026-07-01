import { z } from 'zod';
import { ACCOMMODATION_KINDS, USER_ROLES, ZONE_NAMES } from '../types/enums';

// Login identifier is a USERNAME (plain string), not an email — e.g. "grade7g",
// "victory", "director". Letters/digits/. _ - allowed. Password min 6 (matching
// connection-made-simple's flexibility; was min 8).
const usernameField = z.string().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Username may use letters, numbers, . _ -');

export const CreateUserSchema = z.object({
  firstName: z.string().min(1),
  // A first-aid (or other) account may be a single word with no surname — allow an empty
  // last name rather than forcing a duplicated/placeholder one.
  lastName: z.string().default(''),
  username: usernameField,
  mobile: z.string().optional(),
  role: z.enum(USER_ROLES),
  churchId: z.string().nullable().optional(),
  churchName: z.string().nullable().optional(),
  zone: z.enum(ZONE_NAMES).nullable().optional(),
  password: z.string().min(6),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  username: usernameField.optional(),
  mobile: z.string().optional(),
  role: z.enum(USER_ROLES).optional(),
  churchId: z.string().nullable().optional(),
  churchName: z.string().nullable().optional(),
  zone: z.enum(ZONE_NAMES).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const SetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(6),
});

export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;

export const CreateChurchWithAccountSchema = z.object({
  churchName: z.string().min(1),
  zone: z.enum(ZONE_NAMES),
  contactPhone: z.string().optional(),
  // Account for the church's user
  accountFirstName: z.string().min(1),
  accountLastName: z.string().min(1),
  accountUsername: usernameField,
  accountPassword: z.string().min(6),
  accountRole: z.enum(['church'] as const).optional().default('church'),
});

export type CreateChurchWithAccountInput = z.infer<typeof CreateChurchWithAccountSchema>;

const ChurchContactSchema = z.object({
  name: z.string().default(''),
  phone: z.string().default(''),
});
const ChurchContactsSchema = z.object({
  male: z.object({ primary: ChurchContactSchema, backup: ChurchContactSchema }),
  female: z.object({ primary: ChurchContactSchema, backup: ChurchContactSchema }),
});

export const UpdateChurchSchema = z.object({
  name: z.string().min(1).optional(),
  zone: z.enum(ZONE_NAMES).optional(),
  contactPhone: z.string().optional(),
  contacts: ChurchContactsSchema.optional(),
  // Applied to STUDENTS at import time only (see Church.accommodationOverride).
  accommodationOverride: z.enum(ACCOMMODATION_KINDS).nullable().optional(),
});

export type UpdateChurchInput = z.infer<typeof UpdateChurchSchema>;
