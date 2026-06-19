import { z } from 'zod';
import { GENDERS, CAMPER_STATUSES, CAMPER_KINDS, CONSENT_TYPES } from '../types/enums';

const gradeEnum = z.union([
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
]);

const consentRecord = z.record(
  z.enum(CONSENT_TYPES),
  z.object({
    granted: z.boolean(),
    timestamp: z.string().nullable(),
  }),
).optional();

export const CreateCamperSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(GENDERS),
  dateOfBirth: z.string().nullable().optional(),
  grade: gradeEnum.nullable().optional(),
  school: z.string().nullable().optional(),
  zone: z.string().min(1),
  groupId: z.string().nullable().optional(),
  kind: z.enum(CAMPER_KINDS),
  mobile: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  suburb: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  medicalConditions: z.array(z.string()).optional().default([]),
  dietaryRequirements: z.array(z.string()).optional().default([]),
  otherMedications: z.string().nullable().optional(),
  consents: consentRecord,
  parentGuardianName: z.string().nullable().optional(),
  parentPhone: z.string().nullable().optional(),
  parentRelation: z.string().nullable().optional(),
  blueCardNumber: z.string().nullable().optional(),
  blueCardExpiry: z.string().nullable().optional(),
  churchId: z.string().min(1),
  churchName: z.string().min(1),
  status: z.enum(CAMPER_STATUSES).optional().default('registered'),
});

export type CreateCamperInput = z.infer<typeof CreateCamperSchema>;

export const UpdateCamperSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  gender: z.enum(GENDERS).optional(),
  dateOfBirth: z.string().nullable().optional(),
  grade: gradeEnum.nullable().optional(),
  school: z.string().nullable().optional(),
  zone: z.string().optional(),
  groupId: z.string().nullable().optional(),
  kind: z.enum(CAMPER_KINDS).optional(),
  mobile: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  suburb: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  medicalConditions: z.array(z.string()).optional(),
  dietaryRequirements: z.array(z.string()).optional(),
  otherMedications: z.string().nullable().optional(),
  consents: consentRecord,
  parentGuardianName: z.string().nullable().optional(),
  parentPhone: z.string().nullable().optional(),
  parentRelation: z.string().nullable().optional(),
  blueCardNumber: z.string().nullable().optional(),
  blueCardExpiry: z.string().nullable().optional(),
  status: z.enum(CAMPER_STATUSES).optional(),
  atCamp: z.boolean().optional(),
});

export type UpdateCamperInput = z.infer<typeof UpdateCamperSchema>;
