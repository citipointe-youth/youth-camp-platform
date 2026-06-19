import { z } from 'zod';
import { NOTIFICATION_SCOPES, NOTIFICATION_PRIORITIES } from '../types/enums';

export const CreateNotificationSchema = z.object({
  scope: z.enum(NOTIFICATION_SCOPES),
  zone: z.string().nullable().optional(),
  churchId: z.string().nullable().optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional().default('normal'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  expiresAt: z.string().nullable().optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
