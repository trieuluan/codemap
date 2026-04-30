"use client";

import useSWR from "swr";
import { Users } from "lucide-react";
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

export function TeamSection() {
  const { data: workspaceRows, isLoading: workspacesLoading } = useSWR(
    "settings-workspaces",
    () => api.listWorkspaces(),
  );
  const activeWorkspace = workspaceRows?.[0]?.workspace ?? null;
  const { data: members, isLoading: membersLoading } = useSWR(
    activeWorkspace ? ["settings-workspace-members", activeWorkspace.id] : null,
    ([, workspaceId]) => api.listMembers(workspaceId),
  );

  const isLoading = workspacesLoading || membersLoading;

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
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            disabled
            type="email"
            placeholder="teammate@example.com"
            className="w-full sm:w-64"
          />
          <Button disabled>Invite soon</Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!activeWorkspace && !isLoading ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Users className="size-4" />
            No workspace found yet. Create a project to initialize your personal
            workspace.
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
              const email = member.user?.email ?? member.userId;
              const name = member.user?.name ?? email;
              return (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Avatar className="size-9">
                    <AvatarFallback>
                      {getInitials(member.user?.name, email) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {email}
                    </p>
                  </div>
                  <Badge
                    variant={member.role === "owner" ? "default" : "secondary"}
                  >
                    {roleLabel(member.role)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
