import { cookies } from "next/headers";
import { ProjectList } from "@/features/projects/list/project-list";
import { createServerProjectsApi } from "@/lib/api/projects";

export default async function ProjectsPage() {
  const api = createServerProjectsApi({
    cookieHeader: (await cookies()).toString(),
  });
  const projects = await api.getProjects({
    include: ["latestImport"],
  });

  return <ProjectList initialProjects={projects} />;
}
