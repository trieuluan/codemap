import { z } from 'zod'

export const registerBodySchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
  name: z.string().min(1).max(100),
})

export const loginBodySchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
})

export type RegisterBody = z.infer<typeof registerBodySchema>
export type LoginBody = z.infer<typeof loginBodySchema>
