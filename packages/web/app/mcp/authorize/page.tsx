import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getApiBaseUrl, requestApi } from "@/lib/api/client";
import { AuthorizeButton } from "./authorize-button";

export const metadata: Metadata = {
  title: "Authorize MCP",
  description: "Authorize CodeMap MCP to access your CodeMap account",
};

interface AuthorizePageProps {
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

async function hasValidSession(cookieHeader: string) {
  if (!cookieHeader) {
    return false;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export default async function McpAuthorizePage({
  searchParams,
}: AuthorizePageProps) {
  const params = await searchParams;
  const sessionId = params.sessionId?.trim();

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Missing MCP session</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This authorization link is incomplete. Please restart the MCP login
            flow from your AI tool.
          </CardContent>
        </Card>
      </div>
    );
  }

  const cookieHeader = (await cookies()).toString();
  const authStatus = await requestApi<{
    status: "pending" | "authorized" | "expired" | "denied";
    clientName: string | null;
    deviceName: string | null;
    expiresAt: string | null;
    apiUrl: string;
  }>("/mcp/auth/status", {
    queryParams: {
      sessionId,
    },
  });

  const authenticated = await hasValidSession(cookieHeader);

  if (!authenticated && authStatus.status === "pending") {
    redirect(`/auth?redirect=${encodeURIComponent(`/mcp/authorize?sessionId=${sessionId}`)}`);
  }

  const title =
    authStatus.status === "expired"
      ? "Authorization expired"
      : authStatus.status === "authorized"
        ? "Already authorized"
        : "Authorize CodeMap MCP";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {authStatus.status === "expired"
              ? "This login request expired. Go back to your AI tool and start the MCP login flow again."
              : authStatus.status === "authorized"
                ? "This MCP session has already been authorized. You can return to your AI tool."
                : "Approve this device so CodeMap MCP can access your projects using a dedicated API key."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <div>
              <span className="font-medium">Client:</span>{" "}
              {authStatus.clientName ?? "CodeMap MCP"}
            </div>
            {authStatus.deviceName ? (
              <div>
                <span className="font-medium">Device:</span>{" "}
                {authStatus.deviceName}
              </div>
            ) : null}
            <div>
              <span className="font-medium">API host:</span> {authStatus.apiUrl}
            </div>
            {authStatus.expiresAt ? (
              <div>
                <span className="font-medium">Expires:</span>{" "}
                {new Date(authStatus.expiresAt).toLocaleString()}
              </div>
            ) : null}
          </div>

          {authStatus.status === "pending" ? (
            <AuthorizeButton sessionId={sessionId} />
          ) : authStatus.status === "authorized" ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
              Authorization already completed. You can return to your AI tool now.
            </div>
          ) : (
            <Button asChild className="w-full">
              <a href="/auth">Back to sign in</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
