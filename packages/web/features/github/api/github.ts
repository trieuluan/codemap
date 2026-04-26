import { requestApi } from "@/lib/api/client";
import type { GithubConnectionStatus, GithubConnectUrlResponse } from "./github.types";

export function browserGithubApi() {
  return {
    getStatus: () =>
      requestApi<GithubConnectionStatus>("/github/status"),

    getConnectUrl: (returnTo?: string) =>
      requestApi<GithubConnectUrlResponse>("/github/connect", {
        queryParams: { returnTo },
      }),

    disconnect: () =>
      requestApi<{ disconnected: boolean }>("/github/disconnect", {
        method: "DELETE",
      }),
  };
}
