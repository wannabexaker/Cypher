import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

const password = z.string().min(8).max(128);

export const loginSchema = z.object({
  email,
  password,
});

export const registerSchema = z.object({
  email,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/),
  password,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
