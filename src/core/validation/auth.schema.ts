import { z } from 'zod';

export const LoginInputSchema = z.object({
  // Login identifier is a plain username (e.g. "victory", "grade7g"), not an email.
  username: z.string().min(1),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
