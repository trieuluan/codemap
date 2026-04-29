export interface CodeMapUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface McpStartAuthResponse {
  sessionId: string;
  authorizeUrl: string;
  pollIntervalMs: number;
  expiresAt: string;
}

export interface McpAuthStatusResponse {
  sessionId: string;
  status: "pending" | "authorized" | "expired" | "denied";
  expiresAt: string | null;
  clientName: string | null;
  deviceName: string | null;
  apiUrl: string;
  user?: CodeMapUser | null;
  apiKeyReady: boolean;
  apiKeyClaimed: boolean;
  apiKeyDeliveredAt: string | null;
}

export interface McpAuthClaimResponse extends McpAuthStatusResponse {
  status: "authorized";
  expiresAt: string;
  clientName: string;
  deviceName: string | null;
  apiKey: string;
}

export interface McpAuthMeResponse {
  authenticated: true;
  apiUrl: string;
  user: CodeMapUser;
}
