"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Unlink } from "lucide-react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { browserGitlabApi } from "@/features/gitlab/api";
import type { GitlabConnectionStatus } from "@/features/gitlab/api";

const api = browserGitlabApi();

function GitlabIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51 1.22 3.78a.84.84 0 0 1-.3.92z" />
    </svg>
  );
}

export function GitlabConnectCard() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const {
    data: status,
    isLoading,
    mutate,
  } = useSWR<GitlabConnectionStatus>("gitlab-status", () => api.getStatus(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  async function handleConnect() {
    try {
      setIsConnecting(true);
      const { url } = await api.getConnectUrl();
      window.location.href = url;
    } catch {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      setIsDisconnecting(true);
      await api.disconnect();
      await mutate();
    } finally {
      setIsDisconnecting(false);
    }
  }

  const isConnected = status?.connected === true;

  return (
    <Card
      className={cn(
        "transition-colors",
        isConnected && "border-success/30 bg-success/5",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg bg-secondary",
              isConnected && "bg-success/20",
            )}
          >
            {isConnected ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : (
              <GitlabIcon className="size-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <CardTitle className="text-sm font-medium">GitLab</CardTitle>
            <CardDescription className="text-xs">
              {isLoading
                ? "Checking status..."
                : isConnected
                  ? `Connected as @${(status as Extract<GitlabConnectionStatus, { connected: true }>).gitlabLogin}`
                  : "Connect to import private repositories"}
            </CardDescription>
          </div>
        </div>

        {isConnected && (
          <Badge
            variant="outline"
            className="border-success/40 text-success text-xs"
          >
            Connected
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Button variant="secondary" size="sm" disabled className="w-full">
            <Loader2 className="mr-2 size-3.5 animate-spin" />
            Loading...
          </Button>
        ) : isConnected ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Unlink className="mr-2 size-3.5" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <GitlabIcon className="mr-2 size-3.5" />
            )}
            Connect GitLab
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
