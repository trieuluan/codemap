import type {
  Project,
  ProjectImport,
  ProjectStatus,
  ProjectVisibility,
} from "@/lib/api/projects";

export function formatProjectDate(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
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

export function getProjectRepositoryLabel(project: Pick<Project, "provider" | "repositoryUrl">) {
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
