import { z } from "zod";

export const startMcpAuthBodySchema = z.object({
  clientName: z.string().trim().min(1).max(120).default("CodeMap MCP"),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

export const mcpAuthSessionQuerySchema = z.object({
  sessionId: z.uuid(),
});

export const approveMcpAuthBodySchema = z.object({
  sessionId: z.uuid(),
});

export const claimMcpAuthBodySchema = z.object({
  sessionId: z.uuid(),
});

export type StartMcpAuthBody = z.infer<typeof startMcpAuthBodySchema>;
export type McpAuthSessionQuery = z.infer<typeof mcpAuthSessionQuerySchema>;
export type ApproveMcpAuthBody = z.infer<typeof approveMcpAuthBodySchema>;
export type ClaimMcpAuthBody = z.infer<typeof claimMcpAuthBodySchema>;
