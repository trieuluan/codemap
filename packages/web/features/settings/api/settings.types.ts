export type { CreateApiKeyBody as CreateUserApiKeyInput } from "@codemap/shared";

export type UserApiKeyMetadata = {
  client?: string;
  clientName?: string;
  deviceName?: string | null;
  lastSessionId?: string;
  createdBy?: string;
} | null;

export type UserApiKeySummary = {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: UserApiKeyMetadata;
};

export type ListUserApiKeysResponse = UserApiKeySummary[];

export type CreateUserApiKeyResponse = {
  apiKey: UserApiKeySummary;
  plainTextKey: string;
};

export type RevokeUserApiKeyResponse = {
  revoked: true;
  apiKey: UserApiKeySummary;
};
