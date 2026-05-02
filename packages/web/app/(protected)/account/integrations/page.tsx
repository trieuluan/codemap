import { GithubConnectCard } from "@/features/github/components/github-connect-card";
import { GitlabConnectCard } from "@/features/gitlab/components/gitlab-connect-card";

export default function AccountIntegrationsPage() {
  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3 xl:grid-cols-2 lg:grid-cols-2 md:grid-cols-2 sm:grid-cols-1">
      <GithubConnectCard />
      <GitlabConnectCard />
    </div>
  );
}
