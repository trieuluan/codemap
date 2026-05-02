"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { Users, UserMinus, Lock } from "lucide-react";
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
import { useWorkspace } from "@/features/workspaces/workspace-context";

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

export function TeamSection() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isInviting, startInvite] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { activeWorkspace: activeRow, isLoading: workspacesLoading } = useWorkspace();
  const activeWorkspace = activeRow?.workspace ?? null;
  const activeMembership = activeRow?.membership ?? null;
  const {
    data: members,
    isLoading: membersLoading,
    mutate: mutateMembers,
  } = useSWR(
    activeWorkspace ? ["settings-workspace-members", activeWorkspace.id] : null,
    ([, workspaceId]) => api.listMembers(workspaceId),
  );

  const isLoading = workspacesLoading || membersLoading;
  const canManage = activeMembership?.role === "owner" || activeMembership?.role === "admin";
  // Team plan required for invite — beta/developer plan shows locked state
  const hasTeamPlan = activeWorkspace?.plan === "team";

  function handleInvite() {
    if (!activeWorkspace || !email.trim()) return;
    startInvite(async () => {
      try {
        await api.inviteMember(activeWorkspace.id, email.trim());
        toast({ title: "Member invited", description: `${email} has been added to the workspace.` });
        setEmail("");
        void mutateMembers();
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
    if (!activeWorkspace) return;
    setRemovingId(memberId);
    try {
      await api.removeMember(activeWorkspace.id, memberId);
      toast({ title: "Member removed", description: `${memberEmail} has been removed.` });
      void mutateMembers();
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
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Workspace members</CardTitle>
          <CardDescription>
            {activeWorkspace
              ? `${activeWorkspace.name} is your current ${activeWorkspace.type} workspace.`
              : "Members are scoped to your CodeMap workspace."}
          </CardDescription>
        </div>

        {canManage && (
          <div className="flex w-full gap-2 sm:w-auto">
            {hasTeamPlan ? (
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
        )}
      </CardHeader>

      <CardContent className="pt-0">
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
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const memberEmail = member.user?.email ?? member.userId;
              const name = member.user?.name ?? memberEmail;
              const isOwner = member.role === "owner";
              const isRemoving = removingId === member.userId;

              return (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Avatar className="size-9">
                    <AvatarFallback>
                      {getInitials(member.user?.name, memberEmail) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
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
      </CardContent>
    </Card>
  );
}
