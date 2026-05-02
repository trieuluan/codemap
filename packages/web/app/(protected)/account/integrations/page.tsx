import { GithubConnectCard } from "@/features/github/components/github-connect-card";
import { GitlabConnectCard } from "@/features/gitlab/components/gitlab-connect-card";

export default function AccountIntegrationsPage() {
  return (
    <div className="space-y-4">
      <GithubConnectCard />
      <GitlabConnectCard />
    </div>
  );
}
