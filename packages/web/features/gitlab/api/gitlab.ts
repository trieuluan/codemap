import { requestApi } from "@/lib/api/client";
import type { GitlabConnectionStatus, GitlabConnectUrlResponse } from "./gitlab.types";

export function browserGitlabApi() {
  return {
    getStatus: () =>
      requestApi<GitlabConnectionStatus>("/gitlab/status"),

    getConnectUrl: (returnTo?: string) =>
      requestApi<GitlabConnectUrlResponse>("/gitlab/connect", {
        queryParams: { returnTo },
      }),

    disconnect: () =>
      requestApi<{ disconnected: boolean }>("/gitlab/disconnect", {
        method: "DELETE",
      }),
  };
}
