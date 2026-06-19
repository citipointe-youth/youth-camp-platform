import { z } from 'zod';
import { ACCOMMODATION_KINDS } from '../types/enums';

export const CreateBlockSchema = z.object({
  kind: z.enum(ACCOMMODATION_KINDS),
  name: z.string().min(1),
  price: z.number().min(0),
  capacity: z.number().int().min(1),
  baseTaken: z.number().int().min(0).optional().default(0),
});

export type CreateBlockInput = z.infer<typeof CreateBlockSchema>;

export const UpdateBlockSchema = z.object({
  kind: z.enum(ACCOMMODATION_KINDS).optional(),
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  capacity: z.number().int().min(1).optional(),
  baseTaken: z.number().int().min(0).optional(),
});

export type UpdateBlockInput = z.infer<typeof UpdateBlockSchema>;

export const ReservationPatchSchema = z.object({
  kind: z.enum(ACCOMMODATION_KINDS),
  spots: z.number().int().min(0),
  label: z.string().min(1),
  confirmed: z.boolean().optional().default(false),
});

export type ReservationPatchInput = z.infer<typeof ReservationPatchSchema>;

export const SetReservationsSchema = z.object({
  churchId: z.string().min(1),
  reservations: z.array(ReservationPatchSchema),
});

export type SetReservationsInput = z.infer<typeof SetReservationsSchema>;
