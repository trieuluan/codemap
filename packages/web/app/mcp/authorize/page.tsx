import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Github,
  Monitor,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiBaseUrl, requestApi } from "@/lib/api/client";
import { AuthorizeButton } from "./authorize-button";
import { GithubConnectButton } from "./github-connect-button";

export const metadata: Metadata = {
  title: "Authorize MCP",
  description: "Authorize CodeMap MCP to access your CodeMap account",
};

type McpAuthStatus = {
  sessionId: string;
  status: "pending" | "authorized" | "expired" | "denied";
  clientName: string | null;
  deviceName: string | null;
  expiresAt: string | null;
  apiUrl: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
  apiKeyReady: boolean;
  apiKeyClaimed: boolean;
  apiKeyDeliveredAt: string | null;
};

type SignedInUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type GithubStatus =
  | { connected: false; githubLogin: null }
  | {
      connected: true;
      githubLogin: string;
      scope: string;
      connectedAt: string;
    };

interface AuthorizePageProps {
  searchParams: Promise<{
    sessionId?: string;
    github_connected?: string;
    github_error?: string;
    login?: string;
  }>;
}

async function getSignedInUser(cookieHeader: string) {
  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      user?: SignedInUser;
      data?: { user?: SignedInUser };
    };

    return payload.data?.user ?? payload.user ?? null;
  } catch {
    return null;
  }
}

async function getGithubStatus(cookieHeader: string) {
  try {
    return await requestApi<GithubStatus>("/github/status", {
      cookieHeader,
    });
  } catch {
    return null;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString();
}

function StatusIcon({ status }: { status: McpAuthStatus["status"] }) {
  if (status === "authorized") {
    return <CheckCircle2 className="size-5 text-emerald-600" />;
  }

  if (status === "expired" || status === "denied") {
    return <XCircle className="size-5 text-destructive" />;
  }

  return <Clock className="size-5 text-amber-600" />;
}

function GithubNotice({
  status,
  sessionId,
  githubConnected,
  githubError,
  login,
}: {
  status: GithubStatus | null;
  sessionId: string;
  githubConnected: boolean;
  githubError?: string;
  login?: string;
}) {
  const returnTo = `/mcp/authorize?sessionId=${encodeURIComponent(sessionId)}`;

  if (githubConnected) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
        GitHub connected{login ? ` as @${login}` : ""}.
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Github className="size-4" />
          GitHub connected
        </div>
        <p className="text-muted-foreground">
          CodeMap can access repositories for @{status.githubLogin}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
      {githubError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
          GitHub connection failed: {githubError}.
        </div>
      ) : null}
      <div className="flex items-center gap-2 font-medium">
        <Github className="size-4" />
        GitHub is optional
      </div>
      <p className="text-muted-foreground">
        Connect GitHub if you want CodeMap to import private repositories from
        your account. MCP authorization is already complete without it.
      </p>
      <GithubConnectButton returnTo={returnTo} />
    </div>
  );
}

export default async function McpAuthorizePage({
  searchParams,
}: AuthorizePageProps) {
  const params = await searchParams;
  const sessionId = params.sessionId?.trim();

  if (!sessionId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-5 text-destructive" />
              <CardTitle>Missing MCP session</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              This authorization link is incomplete. Restart the MCP login flow
              from your AI tool.
            </p>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const cookieHeader = (await cookies()).toString();
  const authStatus = await requestApi<McpAuthStatus>("/mcp/auth/status", {
    queryParams: {
      sessionId,
    },
  }).catch(() => null);

  if (!authStatus) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-xl">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-5 text-destructive" />
              <CardTitle>Invalid MCP session</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              This authorization session could not be loaded. Start a new MCP
              login flow from your AI tool.
            </p>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const signedInUser = await getSignedInUser(cookieHeader);

  if (!signedInUser && authStatus.status === "pending") {
    redirect(
      `/auth?redirect=${encodeURIComponent(`/mcp/authorize?sessionId=${sessionId}`)}`,
    );
  }

  const githubStatus =
    authStatus.status === "authorized" && signedInUser
      ? await getGithubStatus(cookieHeader)
      : null;
  const visibleUser = authStatus.user ?? signedInUser;
  const isComplete = authStatus.status === "authorized";
  const title =
    authStatus.status === "expired"
      ? "Authorization expired"
      : authStatus.status === "denied"
        ? "Authorization denied"
        : isComplete
          ? authStatus.apiKeyClaimed
            ? "MCP is connected"
            : "Authorization complete"
          : "Authorize CodeMap MCP";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusIcon status={authStatus.status} />
              <CardTitle>{title}</CardTitle>
            </div>
            <Badge variant={isComplete ? "default" : "secondary"}>
              {authStatus.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {authStatus.status === "expired"
              ? "This login request expired. Go back to your AI tool and start the MCP login flow again."
              : authStatus.status === "denied"
                ? "This MCP authorization request was denied. Start a new login flow from your AI tool when you are ready."
                : isComplete
                  ? authStatus.apiKeyClaimed
                    ? "Your AI tool has claimed the MCP API key and can use CodeMap now."
                    : "Authorization complete. Return to your AI tool so it can claim the MCP API key."
                  : "Approve this device so CodeMap MCP can access your projects using a dedicated API key."}
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Client</div>
                <div className="text-muted-foreground">
                  {authStatus.clientName ?? "CodeMap MCP"}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Monitor className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Device</div>
                <div className="text-muted-foreground">
                  {authStatus.deviceName ?? "Unknown device"}
                </div>
              </div>
            </div>
            <div>
              <div className="font-medium">API host</div>
              <div className="break-all text-muted-foreground">
                {authStatus.apiUrl}
              </div>
            </div>
            <div>
              <div className="font-medium">Expires</div>
              <div className="text-muted-foreground">
                {formatDate(authStatus.expiresAt)}
              </div>
            </div>
            {visibleUser ? (
              <div className="sm:col-span-2">
                <div className="font-medium">Signed in as</div>
                <div className="text-muted-foreground">
                  {visibleUser.email ?? visibleUser.name ?? visibleUser.id}
                </div>
              </div>
            ) : null}
          </div>

          {authStatus.status === "pending" ? (
            <AuthorizeButton sessionId={sessionId} />
          ) : isComplete ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Authorization complete. Return to your AI tool.
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
                <div className="font-medium">Project setup continues in your AI tool</div>
                <p className="mt-1 text-muted-foreground">
                  CodeMap MCP can now check this workspace, link or create a
                  project, import the repository, and wait until indexing is
                  ready.
                </p>
              </div>
              <GithubNotice
                status={githubStatus}
                sessionId={sessionId}
                githubConnected={params.github_connected === "1"}
                githubError={params.github_error}
                login={params.login}
              />
            </div>
          ) : (
            <Button asChild className="w-full">
              <a href="/auth">Back to sign in</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
