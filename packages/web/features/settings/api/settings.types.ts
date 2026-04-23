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

export type CreateUserApiKeyInput = {
  name: string;
  expiryPreset?: "never" | "90_days";
};

export type CreateUserApiKeyResponse = {
  apiKey: UserApiKeySummary;
  plainTextKey: string;
};

export type RevokeUserApiKeyResponse = {
  revoked: true;
  apiKey: UserApiKeySummary;
};
