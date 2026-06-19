import { z } from 'zod';
import { CHECK_IN_TYPES } from '../types/enums';

export const CheckInInputSchema = z.object({
  camperId: z.string(),
  sessionId: z.string(),
  type: z.enum(CHECK_IN_TYPES),
});

export type CheckInInput = z.infer<typeof CheckInInputSchema>;

export const SignOutInputSchema = z.object({
  camperId: z.string(),
  reason: z.string().optional(),
  parentsMet: z.boolean().optional(),
  leaderName: z.string().optional(),
});

export type SignOutInput = z.infer<typeof SignOutInputSchema>;

export const SignInInputSchema = z.object({
  camperId: z.string(),
  leaderName: z.string().optional(),
});

export type SignInInput = z.infer<typeof SignInInputSchema>;
