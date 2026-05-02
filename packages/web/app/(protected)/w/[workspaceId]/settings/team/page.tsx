import { TeamSection } from "@/features/settings/components/team-section";

export default async function WorkspaceTeamPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <TeamSection workspaceId={workspaceId} />;
}
