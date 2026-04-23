import { requestApi } from "@/lib/api/client";
import type {
  CreateUserApiKeyInput,
  CreateUserApiKeyResponse,
  ListUserApiKeysResponse,
  RevokeUserApiKeyResponse,
} from "./settings.types";

export type * from "./settings.types";

export function browserSettingsApi() {
  return {
    listApiKeys: () =>
      requestApi<ListUserApiKeysResponse>("/settings/api-keys"),

    createApiKey: (input: CreateUserApiKeyInput) =>
      requestApi<CreateUserApiKeyResponse>("/settings/api-keys", {
        method: "POST",
        body: input,
      }),

    revokeApiKey: (apiKeyId: string) =>
      requestApi<RevokeUserApiKeyResponse>(
        `/settings/api-keys/${apiKeyId}/revoke`,
        {
          method: "POST",
        },
      ),
  };
}
