"use client";

import { useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { KeyRound, MonitorCheck } from "lucide-react";
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
import {
  browserSettingsApi,
  type UserApiKeySummary,
} from "@/features/settings/api";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { useToast } from "@/hooks/use-toast";

const api = browserSettingsApi();

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatKeyPreview(k: UserApiKeySummary) {
  const start = k.start ?? (k.prefix ? `${k.prefix}...` : null);
  if (!start) return "••••••••••••";
  return `${start}••••••••`;
}

function isActive(k: UserApiKeySummary) {
  return k.enabled && !(k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now());
}

function getApiKeyStatus(apiKey: UserApiKeySummary) {
  if (!apiKey.enabled) return { label: "Revoked", className: "border-destructive/40 text-destructive" };
  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now())
    return { label: "Expired", className: "border-amber-500/40 text-amber-500" };
  return { label: "Active", className: "border-success/40 text-success" };
}

// ─── MCP sessions ─────────────────────────────────────────────────────────────

function McpSessionRow({
  apiKey,
  isPending,
  onRevoke,
}: {
  apiKey: UserApiKeySummary;
  isPending: boolean;
  onRevoke: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <MonitorCheck className="size-3.5 shrink-0 text-emerald-500" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {apiKey.metadata?.clientName ?? apiKey.name ?? "MCP session"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatKeyPreview(apiKey)}
            </p>
          </div>
        </div>
      </TableCell>
      {apiKey.metadata?.deviceName ? (
        <TableCell className="text-xs text-muted-foreground">{apiKey.metadata.deviceName}</TableCell>
      ) : <TableCell />}
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(apiKey.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onRevoke} disabled={isPending}>
          Revoke
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Manual keys ──────────────────────────────────────────────────────────────

function ManualKeyRow({
  apiKey,
  isPending,
  onRevoke,
}: {
  apiKey: UserApiKeySummary;
  isPending: boolean;
  onRevoke: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{apiKey.name ?? "Untitled API key"}</p>
          <p className="font-mono text-xs text-muted-foreground">{formatKeyPreview(apiKey)}</p>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(apiKey.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(apiKey.expiresAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onRevoke} disabled={isPending}>
          Revoke
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ApiKeysSection() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [revokeTarget, setRevokeTarget] = useState<UserApiKeySummary | null>(null);
  const [showRevokedMcp, setShowRevokedMcp] = useState(false);
  const [showRevokedManual, setShowRevokedManual] = useState(false);

  const { data, isLoading, mutate } = useSWR("settings-api-keys", () =>
    api.listApiKeys(),
  );

  const apiKeys = useMemo(() => data ?? [], [data]);

  const activeMcpKeys = useMemo(
    () => apiKeys.filter((k) => k.metadata?.client === "mcp" && isActive(k)),
    [apiKeys],
  );
  const revokedMcpKeys = useMemo(
    () => apiKeys.filter((k) => k.metadata?.client === "mcp" && !isActive(k)),
    [apiKeys],
  );
  const activeManualKeys = useMemo(
    () => apiKeys.filter((k) => k.metadata?.client !== "mcp" && isActive(k)),
    [apiKeys],
  );
  const revokedManualKeys = useMemo(
    () => apiKeys.filter((k) => k.metadata?.client !== "mcp" && !isActive(k)),
    [apiKeys],
  );

  function handleRevoke() {
    if (!revokeTarget) return;
    startTransition(async () => {
      try {
        await api.revokeApiKey(revokeTarget.id);
        await mutate();
        toast({ title: "Key revoked", description: `${revokeTarget.name ?? "API key"} has been revoked.` });
        setRevokeTarget(null);
      } catch (error) {
        toast({
          title: "Unable to revoke key",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    });
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <>
      {/* MCP Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>MCP Sessions</CardTitle>
          <CardDescription>
            Active connections from AI tools via the CodeMap MCP server. Revoke
            a session to disconnect that device immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeMcpKeys.length === 0 && revokedMcpKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No MCP sessions yet.{" "}
              <a href="/dashboard/api" className="text-primary hover:underline">
                Connect your AI tool →
              </a>
            </p>
          ) : (
            <div className="space-y-3">
              {activeMcpKeys.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Session</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Connected</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMcpKeys.map((k) => (
                        <McpSessionRow
                          key={k.id}
                          apiKey={k}
                          isPending={isPending}
                          onRevoke={() => setRevokeTarget(k)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active MCP sessions.</p>
              )}

              {revokedMcpKeys.length > 0 ? (
                <div className="border-t border-border/50 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRevokedMcp((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>{showRevokedMcp ? "▾" : "▸"}</span>
                    {showRevokedMcp
                      ? "Hide revoked sessions"
                      : `Show ${revokedMcpKeys.length} revoked session${revokedMcpKeys.length === 1 ? "" : "s"}`}
                  </button>
                  {showRevokedMcp ? (
                    <div className="mt-3 overflow-x-auto opacity-60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Session</TableHead>
                            <TableHead>Device</TableHead>
                            <TableHead>Connected</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revokedMcpKeys.map((k) => {
                            const status = getApiKeyStatus(k);
                            return (
                              <TableRow key={k.id} className="hover:bg-transparent">
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <MonitorCheck className="size-3.5 shrink-0 text-muted-foreground" />
                                    <div className="space-y-0.5">
                                      <p className="text-sm font-medium line-through text-muted-foreground">
                                        {k.metadata?.clientName ?? k.name ?? "MCP session"}
                                      </p>
                                      <p className="font-mono text-xs text-muted-foreground">
                                        {formatKeyPreview(k)}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {k.metadata?.deviceName ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(k.createdAt)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="outline" className={status.className}>
                                    {status.label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual API keys */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Manual API Keys</CardTitle>
            <CardDescription>
              Personal keys for scripts, CI pipelines, and direct REST API
              access. Set{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                CODEMAP_API_KEY
              </code>{" "}
              to use one.
            </CardDescription>
          </div>
          <CreateApiKeyDialog
            onCreated={() => void mutate()}
            trigger={<Button>Create key</Button>}
          />
        </CardHeader>
        <CardContent>
          {activeManualKeys.length === 0 && revokedManualKeys.length === 0 ? (
            <Empty className="border border-dashed border-border bg-background/40">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRound className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No manual keys yet</EmptyTitle>
                <EmptyDescription>
                  Create a key for scripts or CI environments that can't use
                  browser-based auth.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <CreateApiKeyDialog
                  onCreated={() => void mutate()}
                  trigger={<Button>Create key</Button>}
                />
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-3">
              {activeManualKeys.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeManualKeys.map((k) => (
                        <ManualKeyRow
                          key={k.id}
                          apiKey={k}
                          isPending={isPending}
                          onRevoke={() => setRevokeTarget(k)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active keys.</p>
              )}

              {revokedManualKeys.length > 0 ? (
                <div className="border-t border-border/50 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRevokedManual((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>{showRevokedManual ? "▾" : "▸"}</span>
                    {showRevokedManual
                      ? "Hide revoked keys"
                      : `Show ${revokedManualKeys.length} revoked key${revokedManualKeys.length === 1 ? "" : "s"}`}
                  </button>
                  {showRevokedManual ? (
                    <div className="mt-3 overflow-x-auto opacity-60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revokedManualKeys.map((k) => {
                            const status = getApiKeyStatus(k);
                            return (
                              <TableRow key={k.id} className="hover:bg-transparent">
                                <TableCell>
                                  <div className="space-y-0.5">
                                    <p className="text-sm font-medium line-through text-muted-foreground">
                                      {k.name ?? "Untitled"}
                                    </p>
                                    <p className="font-mono text-xs text-muted-foreground">
                                      {formatKeyPreview(k)}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(k.createdAt)}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(k.expiresAt)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="outline" className={status.className}>
                                    {status.label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open: boolean) => { if (!open) setRevokeTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget?.metadata?.client === "mcp" ? "Disconnect MCP session" : "Revoke API key"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.metadata?.client === "mcp"
                ? `Disconnect "${revokeTarget.metadata?.clientName ?? revokeTarget.name ?? "this session"}"? The AI tool using it will lose access immediately.`
                : `Revoke "${revokeTarget?.name ?? "this key"}"? Any scripts or integrations using it will stop working immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={isPending}>
              {isPending
                ? "Revoking..."
                : revokeTarget?.metadata?.client === "mcp"
                  ? "Disconnect"
                  : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
