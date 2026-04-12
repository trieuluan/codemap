import { cookies } from "next/headers";
import { ProjectList } from "@/features/projects/list/project-list";
import { getProjects } from "@/lib/api/projects";

export default async function ProjectsPage() {
  const cookieHeader = (await cookies()).toString();
  const projects = await getProjects({ cookieHeader });

  return <ProjectList initialProjects={projects} />;
}
