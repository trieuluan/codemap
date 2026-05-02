"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { Lock, ShieldCheck, UserMinus, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { browserWorkspacesApi } from "@/features/workspaces/api";

const api = browserWorkspacesApi();

function getInitials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function TeamSection({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isInviting, startInvite] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const {
    data: workspaceDetail,
    isLoading: workspaceLoading,
    mutate: mutateWorkspace,
  } = useSWR(["settings-workspace-detail", workspaceId], () =>
    api.getWorkspace(workspaceId),
  );
  const {
    data: members,
    isLoading: membersLoading,
    mutate: mutateMembers,
  } = useSWR(["settings-workspace-members", workspaceId], () =>
    api.listMembers(workspaceId),
  );

  const activeWorkspace = workspaceDetail?.workspace ?? null;
  const activeMembership = workspaceDetail?.membership ?? null;
  const entitlements = workspaceDetail?.entitlements ?? null;
  const isLoading = workspaceLoading || membersLoading;
  const canManage = activeMembership?.role === "owner" || activeMembership?.role === "admin";
  const canInvite = canManage && Boolean(entitlements?.teamMembers);

  function handleInvite() {
    if (!email.trim()) return;
    startInvite(async () => {
      try {
        await api.inviteMember(workspaceId, email.trim());
        toast({ title: "Member invited", description: `${email} has been added to the workspace.` });
        setEmail("");
        await Promise.all([mutateMembers(), mutateWorkspace()]);
      } catch (error) {
        toast({
          title: "Failed to invite",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    });
  }

  async function handleRemove(memberId: string, memberEmail: string) {
    setRemovingId(memberId);
    try {
      await api.removeMember(workspaceId, memberId);
      toast({ title: "Member removed", description: `${memberEmail} has been removed.` });
      await Promise.all([mutateMembers(), mutateWorkspace()]);
    } catch (error) {
      toast({
        title: "Failed to remove",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="grid size-10 place-items-center rounded-lg bg-secondary">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {(members?.length ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="grid size-10 place-items-center rounded-lg bg-secondary">
              <ShieldCheck className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold capitalize">
                {activeMembership?.role ?? "—"}
              </p>
              <p className="text-sm text-muted-foreground">Your role</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="grid size-10 place-items-center rounded-lg bg-secondary">
              <Lock className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold capitalize">
                {activeWorkspace?.plan ?? "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {entitlements?.teamMembers ? "Team members enabled" : "Invite locked"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Workspace members</CardTitle>
            <CardDescription>
              {activeWorkspace
                ? `${activeWorkspace.name} is a ${activeWorkspace.type} workspace on the ${activeWorkspace.plan} plan.`
                : "Members are scoped to this CodeMap workspace."}
            </CardDescription>
          </div>

          {canManage ? (
            <div className="flex w-full gap-2 sm:w-auto">
              {canInvite ? (
                <>
                  <Input
                    type="email"
                    placeholder="teammate@example.com"
                    className="w-full sm:w-64"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    disabled={isInviting}
                  />
                  <Button
                    onClick={handleInvite}
                    disabled={isInviting || !email.trim()}
                  >
                    {isInviting ? "Inviting..." : "Invite"}
                  </Button>
                </>
              ) : (
                <Button variant="outline" disabled className="gap-2 text-muted-foreground">
                  <Lock className="size-3.5" />
                  Invite — Team plan required
                </Button>
              )}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {!canManage && !isLoading ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              Only workspace owners and admins can invite or remove members.
            </div>
          ) : null}

          {canManage && !canInvite && !isLoading ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              Member invitations are disabled for this plan. Upgrade to Team when
              collaboration is ready for this workspace.
            </div>
          ) : null}

          {!activeWorkspace && !isLoading ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Users className="size-4" />
              No workspace found yet. Create a project to initialize your personal workspace.
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
              Loading workspace members...
            </div>
          ) : null}

          {members?.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border/70">
              {members.map((member) => {
                const memberEmail = member.user?.email ?? member.userId;
                const name = member.user?.name ?? memberEmail;
                const isOwner = member.role === "owner";
                const isCurrentUser = member.userId === activeMembership?.userId;
                const isRemoving = removingId === member.userId;

                return (
                  <li
                    key={member.userId}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback>
                        {getInitials(member.user?.name, memberEmail) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{name}</p>
                        {isCurrentUser ? (
                          <Badge variant="outline" className="text-[10px]">
                            You
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{memberEmail}</p>
                    </div>
                    <Badge variant={isOwner ? "default" : "secondary"}>
                      {roleLabel(member.role)}
                    </Badge>
                    {canManage && !isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        disabled={isRemoving}
                        onClick={() => handleRemove(member.userId, memberEmail)}
                      >
                        <UserMinus className="size-4" />
                        <span className="sr-only">Remove member</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!isLoading && members?.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No members found for this workspace.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
