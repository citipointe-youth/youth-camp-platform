import { z } from 'zod';

export const CreateClassroomSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1),
});
export type CreateClassroomInput = z.infer<typeof CreateClassroomSchema>;

export const UpdateClassroomSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
});
export type UpdateClassroomInput = z.infer<typeof UpdateClassroomSchema>;

// Allocation map: roomId -> [{ key: "<churchId>|male|female", n }]
const AllocEntrySchema = z.object({ key: z.string().min(1), n: z.number().int().min(0) });
export const SetAllocationsSchema = z.object({
  allocations: z.record(z.string(), z.array(AllocEntrySchema)),
});
export type SetAllocationsInput = z.infer<typeof SetAllocationsSchema>;
