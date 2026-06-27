import { z } from 'zod';
import { SCHEDULE_ITEM_TYPES, CAMP_MODES } from '../types/enums';

export const CreateFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  order: z.number().int().min(0).optional().default(0),
});

export type CreateFaqInput = z.infer<typeof CreateFaqSchema>;

export const UpdateFaqSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});

export type UpdateFaqInput = z.infer<typeof UpdateFaqSchema>;

export const SetDevotionalSchema = z.object({
  day: z.string().min(1),
  verse: z.string().min(1),
  reference: z.string().min(1),
  reflection: z.string().min(1),
  prayer: z.string().min(1),
});

export type SetDevotionalInput = z.infer<typeof SetDevotionalSchema>;

export const CreateScheduleItemSchema = z.object({
  day: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().nullable().optional(),
  title: z.string().min(1),
  location: z.string().nullable().optional(),
  type: z.enum(SCHEDULE_ITEM_TYPES),
});

export type CreateScheduleItemInput = z.infer<typeof CreateScheduleItemSchema>;

export const UpdateScheduleItemSchema = z.object({
  day: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  location: z.string().nullable().optional(),
  type: z.enum(SCHEDULE_ITEM_TYPES).optional(),
});

export type UpdateScheduleItemInput = z.infer<typeof UpdateScheduleItemSchema>;

export const SetModeSchema = z.object({
  campMode: z.enum(CAMP_MODES),
});

export type SetModeInput = z.infer<typeof SetModeSchema>;

export const UpdateSettingsSchema = z.object({
  campName: z.string().min(1).optional(),
  year: z.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().optional(),
  checkInBanner: z.string().nullable().optional(),
  checkInDays: z.array(z.string()).optional(),
  accommodationLocked: z.boolean().optional(),
  campMode: z.enum(CAMP_MODES).optional(),
  tentPrice: z.number().min(0).optional(),
  classroomPrice: z.number().min(0).optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
