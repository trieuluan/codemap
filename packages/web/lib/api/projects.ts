import {
  ApiClientError,
  getApiBaseUrl,
  type ApiClientOptions as ServerProjectsApiOptions,
  requestApi,
} from "./client";
import type {
  ProjectAnalysisSummary,
  CreateProjectInput,
  Project,
  ProjectFileContent,
  ProjectFileParseData,
  ProjectMapInsightsResponse,
  ProjectImport,
  ProjectListInclude,
  ProjectListItem,
  ProjectMapSnapshot,
  ProjectMapSearchResponse,
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

    getProjectMap: async (projectId: string) => {
      return requestApi<ProjectMapSnapshot>(`/projects/${projectId}/map`, {
        cookieHeader: defaults.cookieHeader,
      });
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
