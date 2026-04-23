"use client";

import { useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { KeyRound, Shield, UserRound } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { browserSettingsApi, type UserApiKeySummary } from "@/features/settings/api";
import { CreateApiKeyDialog } from "./components/create-api-key-dialog";
import { useToast } from "@/components/ui/use-toast";

const api = browserSettingsApi();

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
}

function getApiKeyType(apiKey: UserApiKeySummary) {
  if (apiKey.metadata?.client === "mcp") {
    return apiKey.metadata.clientName ?? "MCP";
  }

  return "Manual";
}

function getApiKeyStatus(apiKey: UserApiKeySummary) {
  if (!apiKey.enabled) {
    return {
      label: "Revoked",
      className: "border-destructive/40 text-destructive",
    };
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now()) {
    return {
      label: "Expired",
      className: "border-amber-500/40 text-amber-500",
    };
  }

  return {
    label: "Active",
    className: "border-success/40 text-success",
  };
}

function PlaceholderTab({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Empty className="border border-dashed border-border bg-background/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [revokeTarget, setRevokeTarget] = useState<UserApiKeySummary | null>(null);
  const { data, isLoading, mutate } = useSWR("settings-api-keys", () =>
    api.listApiKeys(),
  );

  const apiKeys = useMemo(() => data ?? [], [data]);

  function handleRevoke() {
    if (!revokeTarget) {
      return;
    }

    startTransition(async () => {
      try {
        await api.revokeApiKey(revokeTarget.id);
        await mutate();
        toast({
          title: "API key revoked",
          description: `${revokeTarget.name ?? "Selected API key"} has been revoked.`,
        });
        setRevokeTarget(null);
      } catch (error) {
        toast({
          title: "Unable to revoke API key",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage account defaults and access credentials for CodeMap.
          </p>
        </div>

        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-0">
            <PlaceholderTab
              icon={UserRound}
              title="Profile settings coming soon"
              description="Profile details and user preferences will live here in a future pass."
            />
          </TabsContent>

          <TabsContent value="security" className="mt-0">
            <PlaceholderTab
              icon={Shield}
              title="Security settings coming soon"
              description="Session controls, password updates, and security history will be added here."
            />
          </TabsContent>

          <TabsContent value="api-keys" className="mt-0 space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>
                    Create and revoke personal keys for MCP clients, scripts,
                    and local integrations.
                  </CardDescription>
                </div>

                <CreateApiKeyDialog
                  onCreated={() => mutate()}
                  trigger={<Button>Create API key</Button>}
                />
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Loading API keys...
                  </div>
                ) : apiKeys.length === 0 ? (
                  <Empty className="border border-dashed border-border bg-background/40">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <KeyRound className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>No API keys yet</EmptyTitle>
                      <EmptyDescription>
                        Create your first API key to use CodeMap from local tools
                        and scripts.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <CreateApiKeyDialog
                        onCreated={() => mutate()}
                        trigger={<Button>Create API key</Button>}
                      />
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {apiKeys.map((apiKey) => {
                          const status = getApiKeyStatus(apiKey);

                          return (
                            <TableRow key={apiKey.id}>
                              <TableCell className="font-medium">
                                <div className="space-y-1">
                                  <div>{apiKey.name ?? "Untitled API key"}</div>
                                  {apiKey.metadata?.deviceName ? (
                                    <div className="text-xs text-muted-foreground">
                                      {apiKey.metadata.deviceName}
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>{getApiKeyType(apiKey)}</TableCell>
                              <TableCell>
                                {apiKey.start ??
                                  (apiKey.prefix ? `${apiKey.prefix}...` : "—")}
                              </TableCell>
                              <TableCell>{formatDate(apiKey.createdAt)}</TableCell>
                              <TableCell>{formatDate(apiKey.expiresAt)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={status.className}
                                >
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRevokeTarget(apiKey)}
                                  disabled={!apiKey.enabled || isPending}
                                >
                                  Revoke
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRevokeTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `Revoke ${revokeTarget.name ?? "this API key"}? Existing clients using it will stop working immediately.`
                : "Revoke this API key?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={isPending}>
              {isPending ? "Revoking..." : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
