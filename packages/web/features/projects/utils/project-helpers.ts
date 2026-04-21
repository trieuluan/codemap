import type {
  Project,
  ProjectImport,
  ProjectImportParseStats,
  ProjectImportParseStatus,
  ProjectImportStatus,
  ProjectStatus,
  ProjectVisibility,
} from "@/features/projects/api";

export function formatProjectDate(
  value?: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}

export function formatLastImportedAt(value?: string | null) {
  if (!value) {
    return "Never imported";
  }

  return formatProjectDate(value);
}

export function getProjectStatusLabel(status: ProjectStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "importing":
      return "Importing";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

export function getProjectVisibilityLabel(visibility: ProjectVisibility) {
  switch (visibility) {
    case "private":
      return "Private";
    case "public":
      return "Public";
    case "internal":
      return "Internal";
    default:
      return visibility;
  }
}

export function getProjectRepositoryLabel(
  project: Pick<Project, "provider" | "repositoryUrl">,
) {
  if (!project.repositoryUrl) {
    return "Repository not connected";
  }

  try {
    const url = new URL(project.repositoryUrl);
    return project.provider
      ? `${project.provider} • ${url.hostname.replace(/^www\./, "")}`
      : url.hostname.replace(/^www\./, "");
  } catch {
    return project.provider ?? "Repository connected";
  }
}

export function getLatestProjectImport(imports: ProjectImport[]) {
  return imports[0] ?? null;
}

export function getProjectImportStatusLabel(status: ProjectImportStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function getProjectImportParseStatusLabel(
  status?: ProjectImportParseStatus | null,
) {
  switch (status) {
    case "pending":
      return "Queued";
    case "running":
      return "Analyzing";
    case "completed":
      return "Analyzed";
    case "partial":
      return "Partial";
    case "failed":
      return "Parse failed";
    default:
      return "Not available";
  }
}

function toValidCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface ProjectImportAnalysisStats {
  totalFiles: number | null;
  sourceFiles: number | null;
  parsedFiles: number | null;
  dependenciesFound: number | null;
}

export function getProjectImportAnalysisStats(
  projectImport?: ProjectImport | null,
): ProjectImportAnalysisStats {
  const stats = projectImport?.parseStatsJson as ProjectImportParseStats | null;
  const totalFiles =
    toValidCount(stats?.totalFileCount) ??
    toValidCount(projectImport?.indexedFileCount) ??
    null;
  const sourceFiles = toValidCount(stats?.sourceFileCount);
  const parsedFiles = toValidCount(stats?.parsedFileCount);
  const dependenciesFound =
    toValidCount(stats?.dependencyCount) ??
    toValidCount(projectImport?.indexedEdgeCount) ??
    null;

  return {
    totalFiles,
    sourceFiles,
    parsedFiles,
    dependenciesFound,
  };
}

export function formatProjectImportAnalysisCount(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}
