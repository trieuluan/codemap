export type ProjectVisibility = "private" | "public" | "internal";
export type ProjectStatus =
  | "draft"
  | "importing"
  | "ready"
  | "failed"
  | "archived";
export type ProjectProvider = "github";
export type ProjectImportStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerUserId: string;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  defaultBranch: string | null;
  repositoryUrl: string | null;
  provider: ProjectProvider | null;
  externalRepoId: string | null;
  lastImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectImport {
  id: string;
  projectId: string;
  triggeredByUserId: string;
  status: ProjectImportStatus;
  branch: string | null;
  commitSha: string | null;
  sourceStorageKey: string | null;
  sourceWorkspacePath: string | null;
  sourceAvailable: boolean;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectListInclude = "latestImport";

export interface ProjectListItem extends Project {
  latestImport?: ProjectImport | null;
}

export interface ProjectMapTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  extension?: string | null;
  children?: ProjectMapTreeNode[];
}

export interface ProjectMapSnapshot {
  id: string;
  projectId: string;
  importId: string;
  tree: ProjectMapTreeNode;
  createdAt: string;
  updatedAt: string;
}

export type ProjectFileContentStatus =
  | "ready"
  | "binary"
  | "too_large"
  | "unsupported"
  | "unavailable";

export interface ProjectFileContent {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  status: ProjectFileContentStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  defaultBranch?: string | null;
  repositoryUrl?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  defaultBranch?: string | null;
  repositoryUrl?: string | null;
}

export interface TriggerProjectImportInput {
  branch?: string;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiFailureResponse {
  success: false;
  error?: ApiErrorPayload;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse;

interface RequestProjectsApiOptions {
  method?: string;
  body?: unknown;
  cookieHeader?: string;
  cache?: RequestCache;
  headers?: HeadersInit;
}

export class ProjectsApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    options?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ProjectsApiError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}

function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return (
      process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001"
    );
  }

  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

async function parseApiResponse<T>(response: Response) {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const apiError = payload && !payload.success ? payload.error : undefined;

    throw new ProjectsApiError(
      apiError?.message || "Request failed",
      response.status,
      {
        code: apiError?.code,
        details: apiError?.details,
      },
    );
  }

  return payload.data;
}

async function requestProjectsApi<T>(
  path: string,
  options: RequestProjectsApiOptions = {},
) {
  const headers = new Headers(options.headers);
  const isServer = typeof window === "undefined";

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (isServer && options.cookieHeader) {
    headers.set("cookie", options.cookieHeader);
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: options.cache ?? "no-store",
    credentials: isServer ? "same-origin" : "include",
  });

  return parseApiResponse<T>(response);
}

export async function getProjects(options?: {
  cookieHeader?: string;
  include?: ProjectListInclude[];
}) {
  const includeQuery = options?.include?.length
    ? `?include=${options.include.join(",")}`
    : "";

  return requestProjectsApi<ProjectListItem[]>(`/projects${includeQuery}`, {
    cookieHeader: options?.cookieHeader,
  });
}

export async function getProject(
  projectId: string,
  options?: { cookieHeader?: string },
) {
  return requestProjectsApi<Project>(`/projects/${projectId}`, {
    cookieHeader: options?.cookieHeader,
  });
}

export async function getProjectImports(
  projectId: string,
  options?: { cookieHeader?: string },
) {
  return requestProjectsApi<ProjectImport[]>(`/projects/${projectId}/imports`, {
    cookieHeader: options?.cookieHeader,
  });
}

export async function getProjectMap(
  projectId: string,
  options?: { cookieHeader?: string },
) {
  return requestProjectsApi<ProjectMapSnapshot>(`/projects/${projectId}/map`, {
    cookieHeader: options?.cookieHeader,
  });
}

export async function getProjectFileContent(
  projectId: string,
  filePath: string,
  options?: { cookieHeader?: string },
) {
  return requestProjectsApi<ProjectFileContent>(
    `/projects/${projectId}/map/files/content?path=${encodeURIComponent(filePath)}`,
    {
      cookieHeader: options?.cookieHeader,
    },
  );
}

export async function createProject(input: CreateProjectInput) {
  return requestProjectsApi<Project>("/projects", {
    method: "POST",
    body: input,
  });
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
) {
  return requestProjectsApi<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteProject(projectId: string) {
  return requestProjectsApi<{ id: string; deleted: boolean }>(
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
  return requestProjectsApi<ProjectImport>(`/projects/${projectId}/import`, {
    method: "POST",
    body: input ?? {},
  });
}

export async function retryProjectImport(projectId: string, importId: string) {
  return requestProjectsApi<ProjectImport>(
    `/projects/${projectId}/imports/${importId}/retry`,
    {
      method: "POST",
    },
  );
}
