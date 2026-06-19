import { z } from 'zod';
import { GENDERS, GRADES, ACCOMMODATION_KINDS, PAYMENT_STATUSES, REGISTRANT_STATUSES, REGISTRANT_KINDS } from '../types/enums';

export const CreateRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(GENDERS),
  kind: z.enum(REGISTRANT_KINDS),
  grade: z.union([z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12)]).nullable().optional(),
  accommodationKind: z.enum(ACCOMMODATION_KINDS).nullable().optional(),
  accommodationLabel: z.string().nullable().optional(),
  dietary: z.string().nullable().optional(),
  medical: z.string().nullable().optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional().default('unpaid'),
  blueCardCollected: z.boolean().optional().default(false),
  parentName: z.string().nullable().optional(),
  parentPhone: z.string().nullable().optional(),
  churchId: z.string().min(1),
  churchName: z.string().min(1),
  zone: z.string().min(1),
  status: z.enum(REGISTRANT_STATUSES).optional().default('registered'),
});

export type CreateRegistrantInput = z.infer<typeof CreateRegistrantSchema>;

export const UpdateRegistrantSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  gender: z.enum(GENDERS).optional(),
  kind: z.enum(REGISTRANT_KINDS).optional(),
  grade: z.union([z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12)]).nullable().optional(),
  accommodationKind: z.enum(ACCOMMODATION_KINDS).nullable().optional(),
  accommodationLabel: z.string().nullable().optional(),
  dietary: z.string().nullable().optional(),
  medical: z.string().nullable().optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  blueCardCollected: z.boolean().optional(),
  parentName: z.string().nullable().optional(),
  parentPhone: z.string().nullable().optional(),
  status: z.enum(REGISTRANT_STATUSES).optional(),
});

export type UpdateRegistrantInput = z.infer<typeof UpdateRegistrantSchema>;
