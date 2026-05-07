import { cookies } from "next/headers";
import { UpgradeCheckout } from "@/features/billing/upgrade-checkout";
import { createServerWorkspacesApi } from "@/features/workspaces/api";
import { config } from "@/lib/config";

export default async function WorkspaceUpgradePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const api = createServerWorkspacesApi({
    cookieHeader: (await cookies()).toString(),
  });
  const workspaceDetail = await api.getWorkspace(workspaceId);

  return (
    <UpgradeCheckout
      workspaceId={workspaceId}
      initialDetail={workspaceDetail}
      paypalClientId={config.paypalClientId}
    />
  );
}
