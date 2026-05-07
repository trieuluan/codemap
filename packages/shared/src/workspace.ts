export type WorkspaceType = "personal" | "team";
export type WorkspacePlan = "basic" | "beta" | "developer" | "team";
export type WorkspaceRole = "owner" | "admin" | "member";
export type BillingProvider = "paypal" | "stripe" | "manual";
export type SubscriptionStatus =
  | "active"
  | "cancelling"
  | "cancelled"
  | "past_due"
  | "paused"
  | "trialing";
export type UsageEventType =
  | "project_created"
  | "import_triggered"
  | "parse_completed"
  | "mcp_session_created";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  ownerUserId: string;
  plan: WorkspacePlan;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface WorkspaceEntitlements {
  plan: WorkspacePlan;
  maxProjects: number | null;
  maxImportsPerMonth: number | null;
  maxIndexedFilesPerImport: number | null;
  privateRepoImports: boolean;
  mcpAccess: boolean;
  teamMembers: boolean;
  cloudImportAccess: boolean;
  graphAccess: boolean;
  insightsAccess: boolean;
}

export interface WorkspaceUsageSummary {
  projectCount: number;
  importsThisMonth: number;
  indexedFilesThisMonth: number;
  indexedSymbolsThisMonth: number;
  indexedEdgesThisMonth: number;
  mcpSessionsCreatedThisMonth: number;
}

export interface WorkspaceSubscription {
  id: string;
  workspaceId: string;
  plan: WorkspacePlan;
  provider: BillingProvider;
  providerSubscriptionId: string | null;
  providerPlanId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDetail {
  workspace: Workspace;
  membership: WorkspaceMember;
  entitlements: WorkspaceEntitlements;
  usage: WorkspaceUsageSummary;
  activeSubscription: WorkspaceSubscription | null;
  latestSubscription: WorkspaceSubscription | null;
}
