import { WorkspaceProvider } from "@/features/workspaces/workspace-context";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
