import {
  ApiClientError,
  getApiBaseUrl,
  parseApiResponseWithMeta,
  type ApiClientOptions as ServerProjectsApiOptions,
  requestApi,
} from "@/lib/api/client";
import type {
  ProjectAnalysisSummary,
  CreateProjectInput,
  CreateProjectFromGithubInput,
  GithubRepositoryOption,
  Project,
  ProjectFileContent,
  ProjectFileParseData,
  ProjectMapInsightsResponse,
  ProjectImport,
  ProjectImportComparison,
  ProjectListInclude,
  ProjectListItem,
  ProjectMapSnapshot,
  ProjectMapSearchResponse,
  ProjectMapGraphResponse,
  ProjectSourceImportResult,
  UpdateProjectInput,
  TriggerProjectImportInput,
} from "./projects.types";

export type * from "./projects.types";

export { ApiClientError as ProjectsApiError };

export function createServerProjectsApi(
  defaults: ServerProjectsApiOptions = {},
) {
  return {
    getProjects: async (options?: { include?: ProjectListInclude[] }) => {
      const includeQuery = options?.include?.length
        ? `?include=${options.include.join(",")}`
        : "";

      return requestApi<ProjectListItem[]>(`/projects${includeQuery}`, {
        cookieHeader: defaults.cookieHeader,
      });
    },

    getProject: async (projectId: string) => {
      return requestApi<Project>(`/projects/${projectId}`, {
        cookieHeader: defaults.cookieHeader,
      });
    },

    getProjectImports: async (projectId: string) => {
      return requestApi<ProjectImport[]>(`/projects/${projectId}/imports`, {
        cookieHeader: defaults.cookieHeader,
      });
    },

    getProjectImportPage: async (
      projectId: string,
      options?: { limit?: number; cursor?: string },
    ) => {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.cursor) params.set("cursor", options.cursor);
      const qs = params.toString();
      const url = `${getApiBaseUrl()}/projects/${projectId}/imports${qs ? `?${qs}` : ""}`;
      const headers = new Headers();
      if (defaults.cookieHeader) headers.set("cookie", defaults.cookieHeader);
      const response = await fetch(url, {
        headers,
        cache: "no-store",
        credentials: typeof window === "undefined" ? "same-origin" : "include",
      });
      return parseApiResponseWithMeta<ProjectImport[], { nextCursor: string | null }>(response);
    },

    getProjectMap: async (projectId: string) => {
      return requestApi<ProjectMapSnapshot>(`/projects/${projectId}/map`, {
        cookieHeader: defaults.cookieHeader,
      });
    },

    compareProjectImports: async (
      projectId: string,
      input: { base: string; head: string },
    ) => {
      return requestApi<ProjectImportComparison>(
        `/projects/${projectId}/imports/compare`,
        {
          cookieHeader: defaults.cookieHeader,
          queryParams: input,
        },
      );
    },

    getProjectFileContent: async (projectId: string, filePath: string) => {
      return requestApi<ProjectFileContent>(
        `/projects/${projectId}/map/files/content`,
        {
          cookieHeader: defaults.cookieHeader,
          queryParams: {
            path: filePath,
          },
        },
      );
    },

    getProjectFileParseData: async (projectId: string, filePath: string) => {
      return requestApi<ProjectFileParseData>(
        `/projects/${projectId}/map/files/parse`,
        {
          cookieHeader: defaults.cookieHeader,
          queryParams: {
            path: filePath,
          },
        },
      );
    },

    getProjectAnalysisSummary: async (projectId: string) => {
      return requestApi<ProjectAnalysisSummary>(
        `/projects/${projectId}/map/analysis`,
        {
          cookieHeader: defaults.cookieHeader,
        },
      );
    },

    getProjectInsights: async (projectId: string) => {
      return requestApi<ProjectMapInsightsResponse>(
        `/projects/${projectId}/map/insights`,
        {
          cookieHeader: defaults.cookieHeader,
        },
      );
    },

    getProjectGraph: async (projectId: string) => {
      return requestApi<ProjectMapGraphResponse>(
        `/projects/${projectId}/map/graph`,
        {
          cookieHeader: defaults.cookieHeader,
        },
      );
    },

    searchProjectMap: async (projectId: string, query: string) => {
      return requestApi<ProjectMapSearchResponse>(
        `/projects/${projectId}/map/search`,
        {
          cookieHeader: defaults.cookieHeader,
          queryParams: {
            q: query,
          },
        },
      );
    },

    listGithubRepositories: async (query?: string, limit?: number) => {
      return requestApi<GithubRepositoryOption[]>("/github/repositories", {
        cookieHeader: defaults.cookieHeader,
        queryParams: {
          q: query,
          limit: limit ? `${limit}` : undefined,
        },
      });
    },
  };
}

export const browserProjectsApi = createServerProjectsApi();

export function buildProjectRawFileUrl(projectId: string, filePath: string) {
  return `${getApiBaseUrl()}/projects/${projectId}/map/files/raw?path=${encodeURIComponent(filePath)}`;
}

export async function createProject(input: CreateProjectInput) {
  return requestApi<Project>("/projects", {
    method: "POST",
    body: input,
  });
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
) {
  return requestApi<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteProject(projectId: string) {
  return requestApi<{ id: string; deleted: boolean }>(
    `/projects/${projectId}`,
    {
      method: "DELETE",
    },
  );
}

export async function triggerProjectImport(
  projectId: string,
  input?: TriggerProjectImportInput,
) {
  return requestApi<ProjectImport>(`/projects/${projectId}/import`, {
    method: "POST",
    body: input ?? {},
  });
}

export async function createProjectFromGithub(
  input: CreateProjectFromGithubInput,
) {
  return requestApi<ProjectSourceImportResult>("/projects/from-github", {
    method: "POST",
    body: input,
  });
}
