import { requestApi } from "@/lib/api/client";
import type { GithubConnectionStatus, GithubConnectUrlResponse } from "./github.types";

export function browserGithubApi() {
  return {
    getStatus: () =>
      requestApi<GithubConnectionStatus>("/github/status"),

    getConnectUrl: () =>
      requestApi<GithubConnectUrlResponse>("/github/connect"),

    disconnect: () =>
      requestApi<{ disconnected: boolean }>("/github/disconnect", {
        method: "DELETE",
      }),
  };
}
